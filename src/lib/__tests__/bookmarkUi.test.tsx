/**
 * Bookmark UI component tests.
 *
 * This repo's vitest setup runs in a plain node environment (no jsdom),
 * so — like followUi.test.tsx — we call the component function directly
 * with stubbed hooks and assert on the returned element tree.
 *
 * Covers:
 * - BookmarkButton renders Save / Saved states (aria-pressed, aria-label)
 * - guest click redirects to /register with the paste preserved
 * - logged-in click POSTs to the bookmark API
 * - saved click sends DELETE to the bookmark API
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (fn: () => unknown) => fn(),
    useState: (initial: unknown) => [initial, () => {}] as const,
    useRef: (initial: unknown) => ({ current: initial }),
    useEffect: () => {},
  };
});

import BookmarkButton from '@/components/BookmarkButton';

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

async function clickButton(btn: HostEl): Promise<unknown> {
  const onClick = btn.props.onClick;
  if (typeof onClick !== 'function') throw new Error('button has no onClick');
  return (onClick as () => unknown)();
}

describe('BookmarkButton', () => {
  it('renders Save when not bookmarked, with accessible labels', () => {
    const el = BookmarkButton({ pasteId: 'abc12345', initialBookmarked: false }) as unknown as ReactElement;
    const btn = firstButton(el);
    expect(collectText(btn)).toContain('Save');
    expect(btn.props['aria-pressed']).toBe(false);
    expect(btn.props['aria-label']).toBe('Bookmark this paste');
    expect(btn.props.title).toBe('Save');
    expect(btn.props.disabled).toBe(false);
  });

  it('renders Saved state with aria-pressed and a remove label', () => {
    const el = BookmarkButton({ pasteId: 'abc12345', initialBookmarked: true }) as unknown as ReactElement;
    const btn = firstButton(el);
    expect(collectText(btn)).toContain('Saved');
    expect(btn.props['aria-pressed']).toBe(true);
    expect(btn.props['aria-label']).toBe('Remove bookmark');
    expect(btn.props.title).toBe('Saved — click to remove');
  });

  it('guest click redirects to /register with the paste preserved', async () => {
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
    const el = BookmarkButton({ pasteId: 'abc12345', initialBookmarked: false, guest: true }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);
    expect(hrefs).toContain('/register?next=%2Fp%2Fabc12345');
    vi.unstubAllGlobals();
  });

  it('logged-in click POSTs to the bookmark API', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, bookmarked: true, created: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const el = BookmarkButton({ pasteId: 'abc12345', initialBookmarked: false }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);

    expect(fetchMock).toHaveBeenCalledWith('/api/pastes/abc12345/bookmark', { method: 'POST' });
    vi.unstubAllGlobals();
  });

  it('saved click DELETEs the bookmark', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: true, bookmarked: false, removed: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const el = BookmarkButton({ pasteId: 'abc12345', initialBookmarked: true }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);

    expect(fetchMock).toHaveBeenCalledWith('/api/pastes/abc12345/bookmark', { method: 'DELETE' });
    vi.unstubAllGlobals();
  });

  it('mid-session 401 falls back to the register redirect (no unhandled error)', async () => {
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
    const fetchMock = vi.fn(async () => ({
      status: 401,
      ok: false,
      json: async () => ({ error: 'Not signed in.' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const el = BookmarkButton({ pasteId: 'abc12345', initialBookmarked: false }) as unknown as ReactElement;
    const btn = firstButton(el);
    await clickButton(btn);

    expect(hrefs).toContain('/register?next=%2Fp%2Fabc12345');
    vi.unstubAllGlobals();
  });
});
