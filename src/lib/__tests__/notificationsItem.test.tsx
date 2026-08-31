// @vitest-environment jsdom
/**
 * Notification UI tests (Chat 2) — presentational row contract.
 *
 * NotificationItem renders the exact strings the API returned
 * (title/message/link) and links them to their real targets:
 *   FOLLOW   → "@username follows you", username links to /u/<username>
 *   LIKE     → actor profile link + the exact post linked to /p/<id>
 *   NEW_POST → actor profile link + embedded preview of the exact post
 *   ADMIN    → compact title-only row ("@Admin · time"), title opens the
 *              full message popup
 *
 * Markup shape is asserted with renderToStaticMarkup; click behavior is
 * driven with real DOM (createRoot + act) since the ADMIN popup uses
 * hooks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
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

import NotificationItem from '@/components/NotificationItem';
import type { NotificationRow } from '@/lib/notifications';

const noop = () => {};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

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

// --- real-DOM helpers for interaction tests ---------------------------------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ stickers: [] })));
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  vi.unstubAllGlobals();
});

async function mount(n: NotificationRow, onActivate: (n: NotificationRow) => void = noop) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const r = createRoot(container);
  root = r;
  await act(async () => {
    r.render(createElement(NotificationItem, { notification: n, onActivate, onMarkRead: noop }));
  });
  await act(async () => {
    await new Promise((r2) => setTimeout(r2, 0));
  });
}

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });
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

  it('calls onActivate when the actor link is clicked', async () => {
    const onActivate = vi.fn();
    const n = makeNotification();
    await mount(n, onActivate);
    const anchor = container!.querySelector('a[href="/u/yori"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    await click(anchor);
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

  it('calls onActivate when the post link is clicked', async () => {
    const onActivate = vi.fn();
    const n = like();
    await mount(n, onActivate);
    const anchor = container!.querySelector('a[href="/p/p123"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    await click(anchor);
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
  const admin = (overrides: Partial<NotificationRow> = {}): NotificationRow =>
    makeNotification({
      type: 'ADMIN',
      title: 'VibeBin v2 is live',
      message: 'New themes and stickers. https://example.com :wave:',
      link: null,
      pasteId: null,
      actor: null,
      ...overrides,
    });

  it('shows only the clickable title + @Admin metadata — never the full message', () => {
    const html = render(admin());
    expect(html).toContain('VibeBin v2 is live');
    expect(html).toContain('@Admin');
    expect(html).toContain('just now');
    // The compact row must NOT expose the broadcast body.
    expect(html).not.toContain('New themes and stickers');
    expect(html).not.toContain('href="https://example.com"');
    expect(html).not.toContain(':wave:');
    expect(html).not.toContain('href="/u/');
  });

  it('makes the title a button (never a link) and marks the row read on click', async () => {
    const onActivate = vi.fn();
    const n = admin();
    await mount(n, onActivate);
    const titleBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('VibeBin v2 is live'),
    ) as HTMLButtonElement;
    expect(titleBtn).not.toBeUndefined();
    // The compact row has no anchors at all (message/link are hidden).
    expect(container!.querySelector('a')).toBeNull();
    await click(titleBtn);
    expect(onActivate).toHaveBeenCalledWith(n);
  });

  it('offers no explicit Mark as read control (the title click covers it)', () => {
    expect(render(admin())).not.toContain('Mark as read');
    expect(render(admin({ isRead: true }))).not.toContain('Mark as read');
  });

  it('keeps the same compact contract for the center variant', () => {
    const html = render(admin(), noop, noop);
    expect(html).toContain('VibeBin v2 is live');
    expect(html).toContain('@Admin');
    expect(html).not.toContain('New themes and stickers');
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
