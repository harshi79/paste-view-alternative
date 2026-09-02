// @vitest-environment jsdom
/**
 * Application shell / navigation tests (Job 1).
 *
 * Drives the real Nav under jsdom. Covers desktop sidebar, active route,
 * destination hrefs (including placeholders), mobile bottom nav, drawer
 * keyboard behavior, and the existing notification-bell auth gating.
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
      'aria-current'?: string;
      'data-nav-item'?: string;
      title?: string;
      onClick?: (e: unknown) => void;
      role?: string;
    }) =>
      React.createElement(
        'a',
        {
          href: props.href,
          className: props.className,
          'aria-label': props['aria-label'],
          'aria-current': props['aria-current'],
          'data-nav-item': props['data-nav-item'],
          title: props.title,
          onClick: props.onClick,
          role: props.role,
        },
        props.children,
      ),
  };
});

const pathnameRef = { current: '/' };
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));

import Nav, { isActivePath, NAV_HREFS, profileHref, type NavUser } from '@/components/Nav';
import TrendingPage from '@/app/trending/page';
import SearchPage from '@/app/search/page';
import { renderToStaticMarkup } from 'react-dom/server';

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/notifications/unread-count')) {
      return { ok: true, status: 200, json: async () => ({ count: 0 }) } as Response;
    }
    if (url.startsWith('/api/notifications/latest')) {
      return { ok: true, status: 200, json: async () => ({ notifications: [], unreadCount: 0 }) } as Response;
    }
    if (url.startsWith('/api/auth/logout')) {
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  pathnameRef.current = '/';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  stubFetch();
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

async function renderNav(session: NavUser) {
  await act(async () => {
    root.render(createElement(Nav, { session }));
  });
  await flush();
}

const session: NavUser = { username: 'dev', displayName: 'Dev', avatarUrl: null };

describe('isActivePath', () => {
  it('treats Home as exact-only so nested routes are not highlighted', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/latest', '/')).toBe(false);
    expect(isActivePath('/latest', '/latest')).toBe(true);
    expect(isActivePath('/bookmarks/x', '/bookmarks')).toBe(true);
    expect(isActivePath('/u/dev', '/u/dev')).toBe(true);
    expect(isActivePath('/u/dev2', '/u/dev')).toBe(false);
  });
});

describe('desktop navigation', () => {
  it('renders the persistent desktop sidebar with primary destinations', async () => {
    await renderNav(session);
    const sidebar = container.querySelector('[data-nav="desktop-sidebar"]');
    expect(sidebar).not.toBeNull();
    expect(sidebar!.getAttribute('aria-label')).toBe('Primary');

    const hrefs = Array.from(sidebar!.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(NAV_HREFS.home);
    expect(hrefs).toContain(NAV_HREFS.latest);
    expect(hrefs).toContain(NAV_HREFS.trending);
    expect(hrefs).toContain(NAV_HREFS.search);
    expect(hrefs).toContain(NAV_HREFS.saved);
    expect(hrefs).toContain(NAV_HREFS.create);
    expect(hrefs).toContain(NAV_HREFS.notifications);
    expect(hrefs).toContain(profileHref('dev'));
  });

  it('marks the active route with aria-current and leaves others inactive', async () => {
    pathnameRef.current = '/latest';
    await renderNav(session);
    const sidebar = container.querySelector('[data-nav="desktop-sidebar"]')!;
    const latest = sidebar.querySelector('[data-nav-item="latest"]');
    const home = sidebar.querySelector('[data-nav-item="home"]');
    expect(latest?.getAttribute('aria-current')).toBe('page');
    expect(home?.getAttribute('aria-current')).toBeNull();
  });

  it('Saved points at the existing bookmarks route', async () => {
    await renderNav(session);
    expect(NAV_HREFS.saved).toBe('/bookmarks');
    const saved = container.querySelector('[data-nav="desktop-sidebar"] [data-nav-item="saved"]');
    expect(saved?.getAttribute('href')).toBe('/bookmarks');
  });

  it('Notifications points at the existing notifications route', async () => {
    await renderNav(session);
    expect(NAV_HREFS.notifications).toBe('/notifications');
    const item = container.querySelector('[data-nav="desktop-sidebar"] [data-nav-item="notifications"]');
    expect(item?.getAttribute('href')).toBe('/notifications');
  });

  it('Profile points at the existing profile route', async () => {
    await renderNav(session);
    const item = container.querySelector('[data-nav="desktop-sidebar"] [data-nav-item="profile"]');
    expect(item?.getAttribute('href')).toBe('/u/dev');
  });

  it('Create uses the existing paste creation flow', async () => {
    await renderNav(session);
    const create = container.querySelector('[data-nav="desktop-sidebar"] [data-nav-item="create"]');
    expect(create?.getAttribute('href')).toBe('/paste');
  });
});

describe('placeholder destinations do not implement extra systems', () => {
  it('Trending navigation exists but the page has no trending logic', async () => {
    await renderNav(session);
    const trending = container.querySelector('[data-nav-item="trending"]');
    expect(trending?.getAttribute('href')).toBe('/trending');

    const html = renderToStaticMarkup(createElement(TrendingPage));
    expect(html).toContain('Trending');
    expect(html).toContain('coming soon');
    expect(html).not.toMatch(/trending score|trendingScore|popularity/i);
    expect(html).not.toContain('<form');
    expect(html).toContain('/latest');
  });

  it('Search navigation exists but the page has no search logic', async () => {
    await renderNav(session);
    const search = container.querySelector('[data-nav-item="search"]');
    expect(search?.getAttribute('href')).toBe('/search');

    const html = renderToStaticMarkup(createElement(SearchPage));
    expect(html).toContain('Search');
    expect(html).toContain('coming soon');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toMatch(/\/api\/search/);
  });
});

describe('mobile navigation', () => {
  it('renders a compact bottom nav with five destinations, not a shrunk sidebar', async () => {
    await renderNav(session);
    const bottom = container.querySelector('[data-nav="mobile-bottom"]');
    expect(bottom).not.toBeNull();
    expect(bottom!.className).toContain('overflow-x-hidden');
    const items = bottom!.querySelectorAll('a, button');
    expect(items.length).toBe(5);
    const hrefs = Array.from(bottom!.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/latest');
    expect(hrefs).toContain('/paste');
    expect(hrefs).toContain('/search');
  });

  it('does not cause horizontal overflow classes on the shell', async () => {
    await renderNav(session);
    const bottom = container.querySelector('[data-nav="mobile-bottom"]')!;
    expect(bottom.className).toMatch(/overflow-x-hidden/);
    const sidebar = container.querySelector('[data-nav="desktop-sidebar"]')!;
    expect(sidebar.className).toMatch(/overflow-x-hidden/);
  });

  it('opens the more drawer from the keyboard and closes it with Escape', async () => {
    await renderNav(session);
    const more = container.querySelector<HTMLButtonElement>('[data-nav-item="more"]');
    expect(more).not.toBeNull();
    expect(more!.tagName).toBe('BUTTON');
    expect(more!.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      more!.focus();
      more!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    const drawer = container.querySelector('#mobile-nav-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer!.getAttribute('role')).toBe('dialog');
    expect(more!.getAttribute('aria-expanded')).toBe('true');
    expect(drawer!.textContent).toContain('Trending');
    expect(drawer!.textContent).toContain('Saved');
    expect(drawer!.textContent).toContain('Notifications');
    expect(drawer!.textContent).toContain('Profile');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(container.querySelector('#mobile-nav-drawer')).toBeNull();
  });
});

describe('existing authentication and notification behavior', () => {
  it('renders no notification control for guests', async () => {
    await renderNav(null);
    expect(container.querySelector('button[aria-controls="notification-panel"]')).toBeNull();
    expect(container.textContent).not.toContain('Notifications');
  });

  it('renders the bell for logged-in users, before the account control', async () => {
    await renderNav(session);
    const btn = container.querySelector('button[aria-controls="notification-panel"]');
    expect(btn).not.toBeNull();
    const account = container.querySelector('button[title="Account menu"]');
    expect(account).not.toBeNull();
    expect(btn!.compareDocumentPosition(account!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
