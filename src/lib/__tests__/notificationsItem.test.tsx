/**
 * Notification UI tests (Chat 2) — presentational row contract.
 *
 * NotificationItem is a pure presentational component (no hooks), so the
 * element trees are exercised directly: renderToStaticMarkup for markup
 * assertions and direct invocation for the click handlers. next/link is
 * mocked as a plain anchor, following the followUi/adminNav patterns.
 *
 * Covers the Chat 2 rendering contract for every Chat 1 type:
 *   FOLLOW   → "@username follows you", username links to /u/<username>
 *   LIKE     → actor profile link + the exact post linked to /p/<id>
 *   NEW_POST → actor profile link + embedded preview of the exact post
 *   ADMIN    → stored title/message/link, no actor
 * plus unread/read distinction, relative time, explicit mark-as-read for
 * linkless ADMIN rows, and no nested interactive elements.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactElement, type ReactNode } from 'react';

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

import NotificationItem from '@/components/NotificationItem';
import type { NotificationRow } from '@/lib/notifications';

const noop = () => {};

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

function render(
  n: NotificationRow,
  onActivate: (n: NotificationRow) => void = noop,
  onMarkRead: (n: NotificationRow) => void = noop,
): string {
  return renderToStaticMarkup(
    createElement(NotificationItem, { notification: n, onActivate, onMarkRead }),
  );
}

// Element-tree helpers for direct invocation (component has no hooks).
type HostEl = ReactElement<Record<string, unknown> & { children?: unknown }>;

/** Expand function components (e.g. the mocked next/link) into host elements. */
function expand(node: unknown): unknown {
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return node;
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    return expand((el.type as (props: Record<string, unknown>) => unknown)(el.props));
  }
  return node;
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

function firstAnchor(el: unknown): HostEl {
  let found: HostEl | null = null;
  walk(el, (n) => {
    if (found === null && n.type === 'a') found = n;
  });
  if (!found) throw new Error('no anchor found');
  return found;
}

function firstButton(el: unknown): HostEl {
  let found: HostEl | null = null;
  walk(el, (n) => {
    if (found === null && n.type === 'button') found = n;
  });
  if (!found) throw new Error('no button found');
  return found;
}

// --- FOLLOW ----------------------------------------------------------------

describe('NotificationItem — FOLLOW', () => {
  it('links the actor username to their profile and renders the stored title verbatim', () => {
    const html = render(makeNotification());
    expect(html).toContain('href="/u/yori"');
    expect(html).toContain('@yori');
    expect(html).toContain('follows you');
    expect(html).toContain('just now'); // fresh notification
    expect(html).not.toContain('href="/p/');
  });

  it('shows the unread indicator only while unread', () => {
    expect(render(makeNotification())).toContain('Unread');
    expect(render(makeNotification())).toContain('bg-red-500');
    const read = render(makeNotification({ isRead: true }));
    expect(read).not.toContain('Unread');
    expect(read).not.toContain('bg-red-500');
  });

  it('renders a sensible relative time for older notifications', () => {
    const html = render(makeNotification({ createdAt: Date.now() - 5 * 60 * 1000 }));
    expect(html).toContain('5m ago');
  });

  it('calls onActivate when the actor link is clicked', () => {
    const onActivate = vi.fn();
    const n = makeNotification();
    const el = NotificationItem({ notification: n, onActivate, onMarkRead: noop });
    const anchor = firstAnchor(el);
    (anchor.props.onClick as () => void)();
    expect(onActivate).toHaveBeenCalledWith(n);
  });
});

// --- LIKE ------------------------------------------------------------------

describe('NotificationItem — LIKE', () => {
  const like = (): NotificationRow =>
    makeNotification({
      type: 'LIKE',
      title: '@nova liked your post',
      message: 'Python API Example',
      pasteId: 'p123',
      link: '/p/p123',
      actor: { id: 'u2', username: 'nova', displayName: 'Nova', avatarUrl: null },
    });

  it('links the actor profile and the exact liked post', () => {
    const html = render(like());
    expect(html).toContain('href="/u/nova"');
    expect(html).toContain('liked your post');
    expect(html).toContain('href="/p/p123"');
    expect(html).toContain('Python API Example');
  });

  it('calls onActivate when the post link is clicked', () => {
    const onActivate = vi.fn();
    const n = like();
    const el = NotificationItem({ notification: n, onActivate, onMarkRead: noop });
    let anchor: HostEl | null = null;
    walk(el, (x) => {
      if (x.type === 'a' && x.props.href === '/p/p123') anchor = x;
    });
    (anchor!.props.onClick as () => void)();
    expect(onActivate).toHaveBeenCalledWith(n);
  });
});

// --- NEW_POST --------------------------------------------------------------

describe('NotificationItem — NEW_POST', () => {
  const newPost = (): NotificationRow =>
    makeNotification({
      type: 'NEW_POST',
      title: '@alex made a new post',
      message: 'Python API Example',
      pasteId: 'p456',
      link: '/p/p456',
      actor: { id: 'u3', username: 'alex', displayName: 'Alex', avatarUrl: null },
    });

  it('renders the embedded preview linked to the exact post', () => {
    const html = render(newPost());
    expect(html).toContain('href="/u/alex"');
    expect(html).toContain('made a new post');
    expect(html).toContain('href="/p/p456"');
    expect(html).toContain('Python API Example');
    expect(html).toContain('View post');
  });
});

// --- ADMIN -----------------------------------------------------------------

describe('NotificationItem — ADMIN', () => {
  it('renders the stored title, message and link without an actor', () => {
    const html = render(
      makeNotification({
        type: 'ADMIN',
        title: 'VibeBin v2 is live',
        message: 'New themes and stickers.',
        link: '/p/announce',
        pasteId: null,
        actor: null,
      }),
    );
    expect(html).toContain('VibeBin v2 is live');
    expect(html).toContain('New themes and stickers.');
    expect(html).toContain('href="/p/announce"');
    expect(html).not.toContain('href="/u/');
  });

  it('offers an explicit Mark as read control when there is no link to open', () => {
    const n = makeNotification({
      type: 'ADMIN',
      title: 'Scheduled maintenance',
      message: 'Downtime on Sunday.',
      link: null,
      pasteId: null,
      actor: null,
    });
    const html = render(n);
    expect(html).toContain('Mark as read');

    const onMarkRead = vi.fn();
    const el = NotificationItem({ notification: n, onActivate: noop, onMarkRead });
    const btn = firstButton(el);
    (btn.props.onClick as () => void)();
    expect(onMarkRead).toHaveBeenCalledWith(n);
  });

  it('hides the Mark as read control once the ADMIN row is read', () => {
    const html = render(
      makeNotification({
        type: 'ADMIN',
        title: 'Scheduled maintenance',
        link: null,
        pasteId: null,
        actor: null,
        isRead: true,
      }),
    );
    expect(html).not.toContain('Mark as read');
  });
});

// --- Structure -------------------------------------------------------------

describe('NotificationItem — markup hygiene', () => {
  const nestedAnchor = /<a\b[^>]*>((?!<\/a>)[\s\S])*<a\b/;
  const buttonWrappingAnchor = /<button\b[^>]*>((?!<\/button>)[\s\S])*<a\b/;
  const anchorWrappingButton = /<a\b[^>]*>((?!<\/a>)[\s\S])*<button\b/;

  it('never nests interactive elements inside each other', () => {
    const cases = [
      makeNotification(),
      makeNotification({
        type: 'LIKE',
        title: '@nova liked your post',
        message: 'Post',
        pasteId: 'p123',
        link: '/p/p123',
        actor: { id: 'u2', username: 'nova', displayName: null, avatarUrl: null },
      }),
      makeNotification({
        type: 'NEW_POST',
        title: '@alex made a new post',
        message: 'Post',
        pasteId: 'p456',
        link: '/p/p456',
        actor: { id: 'u3', username: 'alex', displayName: null, avatarUrl: null },
      }),
      makeNotification({ type: 'ADMIN', title: 'T', link: null, pasteId: null, actor: null }),
    ];
    for (const n of cases) {
      const html = render(n);
      expect(html).not.toMatch(nestedAnchor);
      expect(html).not.toMatch(buttonWrappingAnchor);
      expect(html).not.toMatch(anchorWrappingButton);
    }
  });
});
