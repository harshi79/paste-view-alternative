// @vitest-environment jsdom
/**
 * Notification UI tests (Chat 2) — bell/dropdown/sheet behavior.
 *
 * Drives the real NotificationBell (and Nav) under jsdom with real React
 * rendering (createRoot + act) and a stubbed fetch that emulates the
 * Chat 1 API contract:
 *
 *   GET  /api/notifications/unread-count   → { count }
 *   GET  /api/notifications/latest?limit=N → { notifications, unreadCount }
 *   POST /api/notifications/<id>/read      → { ok, unreadCount }
 *   POST /api/notifications/read-all       → { ok, updated, unreadCount }
 *
 * Covers: auth gating via Nav, badge counts, open/toggle, re-fetch on
 * open, latest-10 newest-first, loading/empty/error/401 states, mark-one,
 * mark-all, outside click, Escape, click-inside, the /notifications link
 * and the mobile sheet affordances.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: (props: {
      href: string;
      children?: ReactNode;
      className?: string;
      'aria-label'?: string;
      title?: string;
      onClick?: (e: unknown) => void;
    }) =>
      React.createElement(
        'a',
        {
          href: props.href,
          className: props.className,
          'aria-label': props['aria-label'],
          title: props.title,
          onClick: props.onClick,
        },
        props.children,
      ),
  };
});

vi.mock('next/navigation', () => ({ usePathname: () => '/paste' }));

import NotificationBell, {
  formatUnreadBadge,
  LATEST_LIMIT,
} from '@/components/NotificationBell';
import Nav, { type NavUser } from '@/components/Nav';
import type { NotificationRow } from '@/lib/notifications';

// --- fixtures & helpers -----------------------------------------------------

function makeNotification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    type: 'FOLLOW',
    title: '@yori follows you',
    message: '',
    link: '/u/yori',
    pasteId: null,
    isRead: false,
    createdAt: Date.now(),
    actor: { id: 'u1', username: 'yori', displayName: 'Yori', avatarUrl: null },
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

function isResponseLike(v: unknown): v is Response {
  return (
    typeof v === 'object' &&
    v !== null &&
    'ok' in v &&
    'status' in v &&
    typeof (v as Response).json === 'function'
  );
}

type FetchOverrides = {
  latest?: () => unknown;
  unread?: () => unknown;
  readOne?: (id: string) => unknown;
  readAll?: () => unknown;
};

let fetchMock: ReturnType<typeof vi.fn>;

/** Stubs fetch with the Chat 1 endpoint contract. */
function stubFetch(overrides: FetchOverrides = {}) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/notifications/latest')) {
      if (!overrides.latest) return jsonResponse({ notifications: [], unreadCount: 0 });
      const out = await overrides.latest();
      return isResponseLike(out) ? out : jsonResponse(out);
    }
    if (url.startsWith('/api/notifications/read-all')) {
      if (!overrides.readAll) return jsonResponse({ ok: true, updated: 0, unreadCount: 0 });
      const out = await overrides.readAll();
      return isResponseLike(out) ? out : jsonResponse(out);
    }
    if (url.startsWith('/api/notifications/unread-count')) {
      if (!overrides.unread) return jsonResponse({ count: 0 });
      const out = await overrides.unread();
      return isResponseLike(out) ? out : jsonResponse(out);
    }
    const match = url.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (match) {
      if (!overrides.readOne) return jsonResponse({ ok: true, unreadCount: 0 });
      const out = await overrides.readOne(match[1]);
      return isResponseLike(out) ? out : jsonResponse(out);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(el: ReactNode) {
  await act(async () => {
    root.render(el);
  });
  await flush();
}

const bell = () => container.querySelector<HTMLButtonElement>('button[aria-controls="notification-panel"]');
const panel = () => container.querySelector<HTMLElement>('#notification-panel');

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
}

async function clickBell() {
  const btn = bell();
  if (!btn) throw new Error('notification bell not rendered');
  await click(btn);
}

// --- badge formatting --------------------------------------------------------

describe('formatUnreadBadge', () => {
  it('is empty at zero, shows compact numbers, and caps at 99+', () => {
    expect(formatUnreadBadge(0)).toBe('');
    expect(formatUnreadBadge(1)).toBe('1');
    expect(formatUnreadBadge(12)).toBe('12');
    expect(formatUnreadBadge(99)).toBe('99');
    expect(formatUnreadBadge(100)).toBe('99+');
    expect(formatUnreadBadge(1200)).toBe('99+');
  });
});

// --- auth gating (Nav) -------------------------------------------------------

describe('NotificationBell auth gating via Nav', () => {
  it('renders no notification control for guests', async () => {
    stubFetch();
    await render(createElement(Nav, { session: null }));
    expect(bell()).toBeNull();
    expect(container.textContent).not.toContain('Notifications');
    // Guests must not issue any notification request.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the bell for logged-in users, before the account control', async () => {
    stubFetch();
    const session: NavUser = { username: 'dev', displayName: null, avatarUrl: null };
    await render(createElement(Nav, { session }));
    const btn = bell();
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-expanded')).toBe('false');
    expect(btn!.getAttribute('aria-label')).toBe('Notifications');
    const account = container.querySelector('button[title="Account menu"]');
    expect(account).not.toBeNull();
    // Bell sits before the account control in the document order.
    expect(btn!.compareDocumentPosition(account!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

// --- badge --------------------------------------------------------------------

describe('NotificationBell badge', () => {
  it('seeds the badge from the unread-count endpoint on mount', async () => {
    stubFetch({ unread: () => ({ count: 5 }) });
    await render(createElement(NotificationBell, {}));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/notifications/unread-count');
    expect(bell()!.textContent).toContain('5');
    expect(bell()!.getAttribute('aria-label')).toBe('Notifications, 5 unread');
  });

  it('shows no badge when the count is zero', async () => {
    stubFetch({ unread: () => ({ count: 0 }) });
    await render(createElement(NotificationBell, {}));
    expect(bell()!.textContent).not.toMatch(/\d/);
  });
});

// --- open / toggle / data ------------------------------------------------------

describe('NotificationBell dropdown', () => {
  it('opens on click, requests exactly the latest 10, and toggles closed', async () => {
    const fm = stubFetch();
    await render(createElement(NotificationBell, {}));
    await clickBell();
    expect(bell()!.getAttribute('aria-expanded')).toBe('true');
    expect(panel()).not.toBeNull();
    expect(panel()!.getAttribute('role')).toBe('dialog');
    const latestCall = fm.mock.calls.find(([u]) => String(u).startsWith('/api/notifications/latest'));
    expect(String(latestCall![0])).toBe(`/api/notifications/latest?limit=${LATEST_LIMIT}`);
    expect(LATEST_LIMIT).toBe(10);
    await clickBell();
    expect(panel()).toBeNull();
    expect(bell()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('re-fetches the latest list every time the dropdown opens', async () => {
    const fm = stubFetch();
    await render(createElement(NotificationBell, {}));
    await clickBell();
    await clickBell(); // close
    await clickBell(); // reopen
    const latestCalls = fm.mock.calls.filter(([u]) => String(u).startsWith('/api/notifications/latest'));
    expect(latestCalls).toHaveLength(2);
  });

  it('renders the API list in order (newest first) and never more than 10 items', async () => {
    const list = Array.from({ length: 12 }, (_, i) =>
      makeNotification({
        id: `n${i}`,
        title: `@user${i} follows you`,
        actor: { id: `u${i}`, username: `user${i}`, displayName: null, avatarUrl: null },
      }),
    );
    stubFetch({ latest: () => ({ notifications: list, unreadCount: 12, hasMore: true, nextCursor: null }) });
    await render(createElement(NotificationBell, {}));
    await clickBell();
    const items = Array.from(panel()!.querySelectorAll('li[data-notification-id]'));
    expect(items).toHaveLength(10);
    expect(items.map((i) => i.getAttribute('data-notification-id'))).toEqual([
      'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9',
    ]);
    // Badge reflects the backend unread count, not the visible rows.
    expect(bell()!.textContent).toContain('12');
  });

  it('shows a loading state while the first list is still pending', async () => {
    let resolveLatest: ((v: unknown) => void) | null = null;
    stubFetch({ latest: () => new Promise((res) => (resolveLatest = res)) });
    await render(createElement(NotificationBell, {}));
    await act(async () => {
      bell()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(panel()!.querySelector('.animate-pulse')).not.toBeNull();
    await act(async () => {
      resolveLatest!({ notifications: [], unreadCount: 0 });
    });
    await flush();
    expect(panel()!.textContent).toContain("You're all caught up.");
  });

  it('shows the empty state and a disabled mark-all when there are no notifications', async () => {
    stubFetch({ latest: () => ({ notifications: [], unreadCount: 0 }) });
    await render(createElement(NotificationBell, {}));
    await clickBell();
    expect(panel()!.textContent).toContain("You're all caught up.");
    const markAll = Array.from(panel()!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all'),
    );
    expect(markAll).not.toBeNull();
    expect((markAll as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an error state and recovers via Try again', async () => {
    let fail = true;
    stubFetch({
      latest: () => {
        if (fail) throw new Error('boom');
        return { notifications: [makeNotification()], unreadCount: 1 };
      },
    });
    await render(createElement(NotificationBell, {}));
    await clickBell();
    expect(panel()!.textContent).toContain("Couldn't load notifications.");
    fail = false;
    const retry = Array.from(panel()!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try again'),
    )!;
    await click(retry);
    expect(panel()!.textContent).toContain('@yori');
    expect(bell()!.textContent).toContain('1');
  });

  it('shows the signed-out state when the session expired (401)', async () => {
    stubFetch({ latest: () => jsonResponse({ error: 'Not signed in.' }, { ok: false, status: 401 }) });
    await render(createElement(NotificationBell, {}));
    await clickBell();
    expect(panel()!.textContent).toContain('Sign in to view notifications.');
    const login = Array.from(panel()!.querySelectorAll('a')).find((a) => a.getAttribute('href') === '/login');
    expect(login).not.toBeNull();
  });
});

// --- read behavior ---------------------------------------------------------------

describe('NotificationBell read behavior', () => {
  const twoNotifications = () => [
    makeNotification(),
    makeNotification({
      id: 'a2',
      type: 'LIKE',
      title: '@nova liked your post',
      message: 'Python API Example',
      pasteId: 'p9',
      link: '/p/p9',
      actor: { id: 'u2', username: 'nova', displayName: null, avatarUrl: null },
    }),
  ];

  it('marks one notification read via the API when it is opened, and syncs the badge', async () => {
    const readOne = vi.fn((id: string) => ({ ok: true, unreadCount: 1 }));
    stubFetch({
      unread: () => ({ count: 2 }),
      latest: () => ({ notifications: twoNotifications(), unreadCount: 2 }),
      readOne,
    });
    await render(createElement(NotificationBell, {}));
    await clickBell();
    expect(bell()!.textContent).toContain('2');

    const postLink = Array.from(panel()!.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/p/p9',
    )!;
    await click(postLink);

    expect(readOne).toHaveBeenCalledWith('a2');
    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/a2/read', { method: 'POST' });
    // Authoritative badge count comes from the API response.
    expect(bell()!.textContent).toContain('1');
    // The opened row reads as read; the dropdown stays open and stable.
    const row = panel()!.querySelector('li[data-notification-id="a2"]')!;
    expect(row.textContent).not.toContain('Unread');
    expect(panel()).not.toBeNull();
  });

  it('marks all read via the backend endpoint and clears the badge without closing', async () => {
    stubFetch({
      unread: () => ({ count: 2 }),
      latest: () => ({ notifications: twoNotifications(), unreadCount: 2 }),
      readAll: () => ({ ok: true, updated: 2, unreadCount: 0 }),
    });
    await render(createElement(NotificationBell, {}));
    await clickBell();
    const markAll = Array.from(panel()!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark all'),
    )!;
    await click(markAll);

    expect(fetchMock).toHaveBeenCalledWith('/api/notifications/read-all', { method: 'POST' });
    expect(panel()!.textContent).not.toContain('Unread');
    expect(bell()!.textContent).not.toMatch(/\d/);
    // The dropdown stays open and stable.
    expect(panel()).not.toBeNull();
    expect(bell()!.getAttribute('aria-expanded')).toBe('true');
  });
});

// --- outside interaction ------------------------------------------------------------

describe('NotificationBell outside interaction', () => {
  it('closes on outside click and Escape, and stays open for clicks inside', async () => {
    stubFetch();
    await render(createElement(NotificationBell, {}));
    await clickBell();
    expect(panel()).not.toBeNull();

    // Click inside the panel does not close it.
    await act(async () => {
      panel()!.querySelector('ul')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(panel()).not.toBeNull();

    // Click outside closes it.
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(panel()).toBeNull();
    expect(bell()!.getAttribute('aria-expanded')).toBe('false');

    // Escape closes it too.
    await clickBell();
    expect(panel()).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(panel()).toBeNull();
  });

  it('notifies the navbar via onOpen exactly once per open', async () => {
    const onOpen = vi.fn();
    stubFetch();
    await render(createElement(NotificationBell, { onOpen }));
    await clickBell();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

// --- see all / mobile sheet -----------------------------------------------------------

describe('NotificationBell see-all and mobile sheet', () => {
  it('links "See all notifications" to /notifications and closes on click', async () => {
    stubFetch();
    await render(createElement(NotificationBell, {}));
    await clickBell();
    const seeAll = Array.from(panel()!.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/notifications',
    );
    expect(seeAll).not.toBeNull();
    expect(seeAll!.textContent).toContain('See all notifications');
    await click(seeAll!);
    expect(panel()).toBeNull();
  });

  it('includes the mobile sheet affordances: scrim and close button', async () => {
    stubFetch();
    await render(createElement(NotificationBell, {}));
    await clickBell();
    const closeBtn = Array.from(panel()!.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Close notifications',
    );
    expect(closeBtn).not.toBeNull();
    expect(container.querySelector('[class*="bg-black/60"]')).not.toBeNull();
    await click(closeBtn!);
    expect(panel()).toBeNull();
  });
});
