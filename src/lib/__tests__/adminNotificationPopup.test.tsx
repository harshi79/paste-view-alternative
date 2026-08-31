// @vitest-environment jsdom
/**
 * ADMIN notification popup tests.
 *
 * Clicking an ADMIN notification title opens a modal with the full
 * broadcast message rendered through the existing pipeline (stickers,
 * emoji shortcuts, clickable links), while the compact row itself never
 * shows the body. Covers open, sticker/link rendering, unsafe-scheme
 * rejection, line-break preservation, mobile-friendly sizing, and all
 * three close paths (X, Escape, click-outside).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import NotificationItem from '@/components/NotificationItem';
import type { NotificationRow } from '@/lib/notifications';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function makeAdmin(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-admin',
    type: 'ADMIN',
    title: 'Important Update',
    message: 'Hey everyone :wave:\n\nCheck out https://example.com',
    link: null,
    pasteId: null,
    isRead: false,
    createdAt: Date.now(),
    actor: null,
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let onActivate: (n: NotificationRow) => void;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onActivate = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ stickers: [] })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount(n: NotificationRow = makeAdmin()) {
  const r = root!;
  await act(async () => {
    r.render(
      createElement(NotificationItem, { notification: n, onActivate, onMarkRead: () => {} }),
    );
  });
  await flush();
}

async function openPopup() {
  const titleBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Important Update'),
  ) as HTMLButtonElement;
  expect(titleBtn).not.toBeUndefined();
  await act(async () => {
    titleBtn.click();
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

describe('ADMIN notification popup', () => {
  it('shows only the title in the compact row, then the full message in the dialog', async () => {
    await mount();
    // Compact row: title + metadata, no message body.
    expect(container!.textContent).toContain('Important Update');
    expect(container!.textContent).toContain('@Admin');
    expect(container!.textContent).not.toContain('Hey everyone');
    expect(dialog()).toBeNull();

    await openPopup();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('Important Update');
    expect(dialog()!.textContent).toContain('Hey everyone');
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
  });

  it('marks the notification read when the title opens the popup', async () => {
    const n = makeAdmin();
    await mount(n);
    await openPopup();
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(n);
  });

  it('renders stickers/emoji from the message via the existing pipeline', async () => {
    await mount();
    await openPopup();
    // With an empty pack (stubbed /api/stickers), :wave: resolves through
    // the existing emoji shortcut — exactly like the paste editor preview.
    expect(dialog()!.textContent).toContain('👋');
  });

  it('renders a URL inside the message as a clickable, safe link', async () => {
    await mount();
    await openPopup();
    const link = dialog()!.querySelector('a[href="https://example.com"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toContain('noopener noreferrer');
  });

  it('never turns unsafe URL schemes into links', async () => {
    await mount(
      makeAdmin({ message: 'Inspect javascript:alert(1) and data:text/html,hi' }),
    );
    await openPopup();
    expect(dialog()!.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(dialog()!.querySelector('a[href^="data:"]')).toBeNull();
    // They remain inert plain text.
    expect(dialog()!.textContent).toContain('javascript:alert(1)');
  });

  it('preserves line breaks and normal text', async () => {
    await mount();
    await openPopup();
    const paragraphs = Array.from(dialog()!.querySelectorAll('p'));
    const texts = paragraphs.map((p) => p.textContent);
    expect(texts).toContain('Hey everyone 👋');
    expect(texts).toContain('Check out https://example.com');
  });

  it('is mobile-friendly (max-width + scrollable body, not fixed width)', async () => {
    await mount();
    await openPopup();
    const dlg = dialog()!;
    expect(dlg.className).toContain('max-w-lg');
    expect(dlg.className).toContain('w-full');
    expect(dlg.className).toContain('max-h-[82dvh]');
    // The outer scrim fills the viewport on any screen size.
    const scrim = dlg.parentElement;
    expect(scrim!.className).toContain('fixed inset-0');
    expect(scrim!.className).toContain('p-4');
  });

  it('closes when the X button is clicked', async () => {
    await mount();
    await openPopup();
    const closeBtn = Array.from(dialog()!.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Close broadcast',
    ) as HTMLButtonElement;
    expect(closeBtn).not.toBeUndefined();
    await act(async () => {
      closeBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(dialog()).toBeNull();
  });

  it('closes when Escape is pressed', async () => {
    await mount();
    await openPopup();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(dialog()).toBeNull();
  });

  it('closes when clicking outside the dialog', async () => {
    await mount();
    await openPopup();
    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(dialog()).toBeNull();
  });

  it('does not close when clicking inside the dialog body', async () => {
    await mount();
    await openPopup();
    const body = dialog()!.querySelector('div.overflow-y-auto') as HTMLElement;
    await act(async () => {
      body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(dialog()).not.toBeNull();
  });
});
