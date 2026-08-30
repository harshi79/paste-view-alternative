/**
 * Follow UI component tests (TODO #1, #2, #5).
 *
 * This repo's vitest setup runs in a plain node environment (no jsdom),
 * so — like nameDisplayHooks.test.tsx — we call the component functions
 * directly with stubbed hooks and assert on the returned element trees.
 *
 * Covers:
 * - FollowButton renders Follow / Following (aria-pressed) states
 * - guest click redirects to /register with the profile preserved
 * - logged-in click calls the follow API and refreshes
 * - 401 mid-session falls back to the same register redirect
 * - ProfileHoverCard renders the compact preview (avatar, name, tag,
 *   status emoji, text status, counts, follow action, view-profile link)
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const hookLog = vi.hoisted(() => [] as string[]);

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (fn: () => unknown) => {
      hookLog.push('useMemo');
      return fn();
    },
    useState: (initial: unknown) => {
      hookLog.push('useState');
      return [initial, () => {}] as const;
    },
    useRef: (initial: unknown) => {
      hookLog.push('useRef');
      return { current: initial };
    },
    useEffect: () => {
      hookLog.push('useEffect');
    },
  };
});

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: (props: {
      href: string;
      children?: ReactNode;
      className?: string;
      'aria-label'?: string;
    }) =>
      React.createElement(
        'a',
        { href: props.href, className: props.className, 'aria-label': props['aria-label'] },
        props.children,
      ),
  };
});

const routerSpy = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routerSpy }));

import FollowButton from '@/components/FollowButton';
import ProfileHoverCard, { ProfileHoverCardContent, type ProfileHoverData } from '@/components/ProfileHoverCard';

const hoverData: ProfileHoverData = {
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  statusEmoji: '🔥',
  statusText: 'Upset',
  tags: [{ id: 't1', label: 'Founder', color: '#fbbf24', effect: 'gold' }],
  followersCount: 12,
  followingCount: 3,
  pastesCount: 45,
  nameFrom: '#a78bfa',
  nameTo: '#22d3ee',
  nameStyle: 'gradient',
  nameEffect: 'none',
  effectSpeed: 50,
  effectIntensity: 60,
};

type HostEl = ReactElement<Record<string, unknown> & { children?: unknown }>;

/**
 * Render function-component elements by invoking them (safe here because
 * react hooks are mocked), so the whole tree is plain host elements.
 */
function expand(node: unknown): unknown {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return node;
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    return expand((el.type as (props: Record<string, unknown>) => unknown)(el.props));
  }
  return node;
}

function collectText(node: unknown): string {
  node = expand(node);
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  const el = node as HostEl;
  return collectText(el.props.children);
}

function walk(node: unknown, visit: (el: HostEl) => void): void {
  node = expand(node);
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  const el = node as HostEl;
  if (typeof el.type === 'string') visit(el);
  walk(el.props.children, visit);
}

function firstButton(el: ReactElement): HostEl {
  let found: HostEl | null = null;
  walk(el, (n) => {
    if (found === null && n.type === 'button') found = n;
  });
  if (!found) throw new Error('no button found');
  return found;
}

function anchors(el: ReactElement): string[] {
  const hrefs: string[] = [];
  walk(el, (n) => {
    if (n.type === 'a' && typeof n.props.href === 'string') hrefs.push(n.props.href);
  });
  return hrefs;
}

function clickButton(btn: HostEl): unknown {
  const onClick = btn.props.onClick;
  if (typeof onClick !== 'function') throw new Error('button has no onClick');
  return (onClick as () => unknown)();
}

describe('FollowButton', () => {
  it('renders Follow when not following', () => {
    const el = FollowButton({ username: 'alice', initialFollowing: false }) as unknown as ReactElement;
    const btn = firstButton(el);
    expect(collectText(btn)).toContain('Follow');
    expect(btn.props['aria-pressed']).toBe(false);
  });

  it('renders Following state with aria-pressed', () => {
    const el = FollowButton({ username: 'alice', initialFollowing: true }) as unknown as ReactElement;
    const btn = firstButton(el);
    expect(collectText(btn)).toContain('Following');
    expect(btn.props['aria-pressed']).toBe(true);
    expect(btn.props['aria-label']).toBe('Unfollow alice');
  });

  it('guest click redirects to /register with the profile preserved', async () => {
    const hrefs: string[] = [];
    vi.stubGlobal('window', {
      location: {
        set href(v: string) {
          hrefs.push(v);
        },
        get href() {
          return hrefs[hrefs.length - 1] ?? '';
        },
      },
    });
    const el = FollowButton({ username: 'alice', guest: true }) as unknown as ReactElement;
    const btn = firstButton(el);
    clickButton(btn);
    expect(hrefs).toContain('/register?next=%2Fu%2Falice');
    vi.unstubAllGlobals();
  });

  it('logged-in click POSTs to the follow API and refreshes', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, following: true, followersCount: 5 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    routerSpy.refresh.mockClear();

    const el = FollowButton({ username: 'alice', initialFollowing: false }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);

    expect(fetchMock).toHaveBeenCalledWith('/api/users/alice/follow', { method: 'POST' });
    expect(routerSpy.refresh).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('unfollows via DELETE when already following', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, following: false, followersCount: 0 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const el = FollowButton({ username: 'alice', initialFollowing: true }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);

    expect(fetchMock).toHaveBeenCalledWith('/api/users/alice/follow', { method: 'DELETE' });
    vi.unstubAllGlobals();
  });

  it('falls back to the register redirect when the session expired (401)', async () => {
    const hrefs: string[] = [];
    vi.stubGlobal('window', {
      location: {
        set href(v: string) {
          hrefs.push(v);
        },
        get href() {
          return hrefs[hrefs.length - 1] ?? '';
        },
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 401 })));

    const el = FollowButton({ username: 'alice', initialFollowing: false }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);

    expect(hrefs).toContain('/register?next=%2Fu%2Falice');
    vi.unstubAllGlobals();
  });
});

describe('ProfileHoverCard', () => {
  it('renders the compact profile preview when open', () => {
    const el = ProfileHoverCard({
      data: hoverData,
      following: false,
      guest: false,
      defaultOpen: true,
      children: null,
    }) as unknown as ReactElement;

    const text = collectText(el);
    // avatar initial + name + username + tag + emoji + text status
    expect(text).toContain('Alice');
    expect(text).toContain('@alice');
    expect(text).toContain('Founder');
    expect(text).toContain('🔥');
    expect(text).toContain('Upset');
    // counts
    expect(text).toContain('Followers');
    expect(text).toContain('Following');
    expect(text).toContain('Pastes');
    expect(text).toContain('12');
    expect(text).toContain('3');
    expect(text).toContain('45');
    // view-profile links point at the profile
    expect(anchors(el).filter((h) => h === '/u/alice').length).toBeGreaterThanOrEqual(2);
    // follow action is present
    expect(collectText(firstButton(el))).toContain('Follow');
  });

  it('renders no card when closed', () => {
    const el = ProfileHoverCard({
      data: hoverData,
      following: true,
      guest: false,
      children: null,
    }) as unknown as ReactElement;
    expect(collectText(el)).not.toContain('Followers');
  });

  it('content component reflects the Following state', () => {
    const el = ProfileHoverCardContent({
      data: hoverData,
      following: true,
      guest: false,
    }) as unknown as ReactElement;
    expect(collectText(firstButton(el))).toContain('Following');
  });
});
