/**
 * Regression tests — admin UI small fix (audit fix #11).
 *
 * Two known issues:
 *   1. The Admin Overview tab did not show as active because the page passed
 *      `active="home"` while Overview's href is `/admin`, so the AdminNav
 *      active-state comparison (`it.href === active`) never matched.
 *   2. Invalid nested interactive HTML: a `<Link>` (renders an `<a>`) was
 *      nested inside a `<button>` in the Users admin row.
 *
 * These tests pin the AdminNav active-state contract and verify the Users
 * admin row renders valid sibling interactive elements (no `<a>` inside a
 * `<button>`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// Marker for the AdminNav "active tab" visual state. The skin was redesigned
// (brutalist tabs), so the marker class changed — the active-state LOGIC it
// pins (it.href === active, pathname fallback, 'home' never matching) is
// untouched and these assertions still verify exactly that contract.
const ACTIVE_CLASS = 'border-brand-400/70 bg-brand-600/25 text-white';

beforeEach(() => {
  vi.resetModules();
});

function mockLink() {
  vi.doMock('next/link', () => {
    const Link = (props: Record<string, unknown>) =>
      createElement(
        'a',
        { href: props.href, className: props.className } as React.AnchorHTMLAttributes<HTMLAnchorElement>,
        props.children as React.ReactNode,
      );
    return { default: Link };
  });
}

function mockNext() {
  vi.doMock('next/navigation', () => ({
    usePathname: () => '/admin',
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  }));
  mockLink();
}

describe('AdminNav — Overview active state', () => {
  it('Overview is highlighted when active="/admin" (its actual href)', async () => {
    mockNext();
    const { default: AdminNav } = await import('@/components/AdminNav');
    const html = renderToStaticMarkup(createElement(AdminNav, { active: '/admin' }));
    // Overview link is active; Users is not.
    const overview = html.match(/href="\/admin"([^>]*)>/);
    expect(overview).not.toBeNull();
    expect(overview![1]).toContain(ACTIVE_CLASS);
    const users = html.match(/href="\/admin\/users"([^>]*)>/);
    expect(users![1]).not.toContain(ACTIVE_CLASS);
  });

  it('active="/admin/users" highlights Users, not Overview', async () => {
    mockNext();
    const { default: AdminNav } = await import('@/components/AdminNav');
    const html = renderToStaticMarkup(createElement(AdminNav, { active: '/admin/users' }));
    const users = html.match(/href="\/admin\/users"([^>]*)>/);
    expect(users![1]).toContain(ACTIVE_CLASS);
    const overview = html.match(/href="\/admin"([^>]*)>/);
    expect(overview![1]).not.toContain(ACTIVE_CLASS);
  });

  it('the old "home" value does not match Overview (documents the bug)', async () => {
    mockNext();
    const { default: AdminNav } = await import('@/components/AdminNav');
    const html = renderToStaticMarkup(createElement(AdminNav, { active: 'home' }));
    const overview = html.match(/href="\/admin"([^>]*)>/);
    expect(overview![1]).not.toContain(ACTIVE_CLASS);
  });

  it('includes a Broadcast tab pointing at /admin/notifications', async () => {
    mockNext();
    const { default: AdminNav } = await import('@/components/AdminNav');
    const html = renderToStaticMarkup(createElement(AdminNav, { active: '/admin' }));
    expect(html).toMatch(/href="\/admin\/notifications"/);
    expect(html).toContain('Broadcast');
    const broadcast = html.match(/href="\/admin\/notifications"([^>]*)>/);
    expect(broadcast).not.toBeNull();
    expect(broadcast![1]).not.toContain(ACTIVE_CLASS);
  });

  it('active="/admin/notifications" highlights Broadcast, not Overview', async () => {
    mockNext();
    const { default: AdminNav } = await import('@/components/AdminNav');
    const html = renderToStaticMarkup(createElement(AdminNav, { active: '/admin/notifications' }));
    const broadcast = html.match(/href="\/admin\/notifications"([^>]*)>/);
    expect(broadcast![1]).toContain(ACTIVE_CLASS);
    const overview = html.match(/href="\/admin"([^>]*)>/);
    expect(overview![1]).not.toContain(ACTIVE_CLASS);
  });

  it('falls back to pathname when no active prop is given', async () => {
    vi.doMock('next/navigation', () => ({
      usePathname: () => '/admin/users',
      useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    }));
    mockLink();
    const { default: AdminNav } = await import('@/components/AdminNav');
    const html = renderToStaticMarkup(createElement(AdminNav, {}));
    const users = html.match(/href="\/admin\/users"([^>]*)>/);
    expect(users![1]).toContain(ACTIVE_CLASS);
  });
});

describe('Users admin row — valid interactive structure', () => {
  it('does not nest an <a> inside a <button>', async () => {
    mockNext();
    const { default: UsersAdminClient } = await import('@/components/UsersAdminClient');
    const rows = [
      { id: 'u1', username: 'alice', createdAt: new Date('2024-01-01') },
    ];
    const html = renderToStaticMarkup(
      createElement(UsersAdminClient, { initial: rows, initialQuery: '' }),
    );
    // A button containing an <a> (nested interactive markup) must not exist.
    const nested = html.match(/<button[^>]*>\s*<a\b/);
    expect(nested).toBeNull();
    // The row must still expose a working "open user" button and a profile link.
    expect(html).toContain('@alice');
    expect(html).toMatch(/href="\/u\/alice"/);
    expect(html).toContain('<button');
  });
});
