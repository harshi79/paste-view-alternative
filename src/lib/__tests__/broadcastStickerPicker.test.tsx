// @vitest-environment jsdom
/**
 * Focused tests for the Sticker picker on the Admin Broadcast composer.
 *
 * Scope is strictly the picker UI + token insertion behaviour. The sticker
 * data is pulled from the EXISTING `/api/stickers` endpoint (via the
 * composer's already-loaded pack, exactly like the live preview), and the
 * inserted token is the same `:wave:` shortcode the BroadcastMessage
 * renderer understands. Notification backend / database / delivery are
 * intentionally untouched and asserted to remain unchanged.
 *
 * Note on caching: `@/lib/stickerPack` keeps a module-level cache, so the
 * composer's pack is shared across `it` blocks in this file (the same
 * behaviour the existing adminBroadcast suite relies on). The empty / error
 * *visual* states are therefore exercised on the isolated `StickerPicker`
 * component, which fetches `/api/stickers` fresh on every mount and is the
 * exact component the composer renders — while composer-level tests verify
 * insertion, cursor, preview and that broadcasting still works.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import BroadcastAdminClient from '@/components/BroadcastAdminClient';
import StickerPicker from '@/components/StickerPicker';

type Sticker = { token: string; url: string | null; emoji: string | null; label: string };

const STICKERS: Sticker[] = [
  { token: ':wave:', url: 'https://example.com/wave.gif', emoji: '👋', label: 'Wave' },
  { token: ':fire:', url: null, emoji: '🔥', label: 'Fire' },
];

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

/** Routes fetch by URL: /api/stickers -> sticker response, everything else -> admin notify. */
function makeFetch(stickerResponse: { stickers?: Sticker[] } | 'reject', recipients = 7) {
  return vi.fn(async (url: string | URL | Request, _init?: unknown) => {
    const u = String(url);
    if (u.includes('/api/stickers')) {
      if (stickerResponse === 'reject') throw new Error('network down');
      return jsonResponse(stickerResponse);
    }
    if (u.includes('/api/admin/notifications')) {
      return jsonResponse({ ok: true, broadcastId: 'b1', recipients });
    }
    return jsonResponse({});
  });
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = makeFetch({ stickers: STICKERS });
  vi.stubGlobal('fetch', fetchMock);
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

async function render(userCount = 12) {
  await act(async () => {
    root.render(createElement(BroadcastAdminClient, { userCount }));
  });
  await flush();
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('no value setter');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Sets the message textarea value (and optional selection) in a controlled way. */
async function setMessage(text: string, selStart?: number, selEnd?: number) {
  const el = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
  await act(async () => {
    setInputValue(el, text);
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
  if (selStart != null) {
    el.selectionStart = selStart;
    el.selectionEnd = selEnd ?? selStart;
  }
}

async function setTitle(text: string) {
  await act(async () => {
    setInputValue(container.querySelector('#broadcast-title') as HTMLInputElement, text);
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
}

async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
}

function stickerButton() {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Sticker',
  )!;
}

function picker() {
  return container.querySelector('#broadcast-sticker-picker');
}

function stickerTile(token: string) {
  return container.querySelector(`[data-sticker-token="${token}"]`);
}

async function outsideClick() {
  await act(async () => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
  await flush();
}

function sendButton() {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Send to everyone'),
  );
}

function confirmButton() {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    /Confirm send|Sending/.test(b.textContent ?? ''),
  );
}

describe('Admin Broadcast — Sticker button', () => {
  it('1. renders a Sticker button near the Message field', async () => {
    await render();
    const btn = stickerButton();
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-controls')).toBe('broadcast-sticker-picker');
    // It lives inside the same composer form as the Message textarea.
    const messageField = container.querySelector('#broadcast-message');
    expect(messageField).not.toBeNull();
    expect(btn.closest('form')?.contains(messageField!)).toBe(true);
  });
});

describe('Admin Broadcast — Sticker picker open/close', () => {
  it('2. opens the picker showing the existing sticker data', async () => {
    await render();
    await click(stickerButton());
    expect(picker()).not.toBeNull();
    expect(stickerTile(':wave:')).not.toBeNull();
    expect(stickerTile(':fire:')).not.toBeNull();
    // Each tile is a real button with an accessible label.
    expect(stickerTile(':wave:')?.getAttribute('aria-label')).toContain(':wave:');
    // aria-expanded flips to true while open.
    expect(stickerButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('3. closes on outside click', async () => {
    await render();
    await click(stickerButton());
    expect(picker()).not.toBeNull();
    await outsideClick();
    expect(picker()).toBeNull();
  });

  it('4. closes on Escape', async () => {
    await render();
    await click(stickerButton());
    expect(picker()).not.toBeNull();
    await pressEscape();
    expect(picker()).toBeNull();
  });

  it('closes when the Sticker button is clicked again', async () => {
    await render();
    await click(stickerButton());
    expect(picker()).not.toBeNull();
    await click(stickerButton());
    expect(picker()).toBeNull();
  });
});

describe('Admin Broadcast — sticker insertion', () => {
  it('5. clicking a sticker inserts the correct token and closes the picker', async () => {
    await render();
    await setMessage('Hello everyone');
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    const el = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
    expect(el.value).toContain(':wave:');
    // Selecting a sticker closes the popover (the composer wires onClose).
    expect(picker()).toBeNull();
  });

  it('6. inserts the token at the current cursor position (middle)', async () => {
    await render();
    // "Hello | everyone" — caret sits between the two spaces.
    await setMessage('Hello  everyone', 6 /* after "Hello " */);
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    const el = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
    expect(el.value).toBe('Hello :wave: everyone');
  });

  it('7. replaces a selected range with the sticker token', async () => {
    await render();
    // "Hello |everyone|"  (everyone spans indices 6..13, so end = 14)
    await setMessage('Hello everyone', 6, 14);
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    const el = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
    expect(el.value).toBe('Hello :wave:');
  });

  it('8. places the caret immediately after the inserted token', async () => {
    await render();
    await setMessage('Hello everyone', 6);
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    const el = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
    // "Hello :wave:" -> caret at 12 (after the 6-char token).
    expect(el.selectionStart).toBe(12);
    expect(el.selectionEnd).toBe(12);
  });

  it('preserves existing text and works at start / end / empty / multiline', async () => {
    await render();
    const el = () => container.querySelector('#broadcast-message') as HTMLTextAreaElement;

    // cursor at start
    await setMessage('everyone', 0);
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    expect(el().value).toBe(':wave:everyone');
    expect(el().selectionStart).toBe(6);

    // cursor at end
    await setMessage('everyone');
    await click(stickerButton());
    await click(stickerTile(':fire:')!);
    expect(el().value).toBe('everyone:fire:');

    // empty message
    await setMessage('');
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    expect(el().value).toBe(':wave:');

    // multiline message, caret inside the second line (after "line ")
    await setMessage('line one\nline two', 14 /* after "line " in the second line */);
    await click(stickerButton());
    await click(stickerTile(':fire:')!);
    expect(el().value).toBe('line one\nline :fire:two');
  });

  it('9. existing message text is preserved around the insertion', async () => {
    await render();
    // "Hello |everyone|" (everyone spans indices 6..13, so end = 14)
    await setMessage('Hello everyone', 6, 14);
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    const el = container.querySelector('#broadcast-message') as HTMLTextAreaElement;
    expect(el.value.startsWith('Hello :wave:')).toBe(true);
    expect(el.value).toBe('Hello :wave:');
  });

  it('10. the live preview reflects the inserted sticker immediately', async () => {
    await render();
    await setMessage('Hello everyone', 6);
    await click(stickerButton());
    await click(stickerTile(':wave:')!);
    // Preview now shows the actual sticker image for :wave: (label "Wave").
    const previewImg = container.querySelector('img[alt="Wave"]');
    expect(previewImg).not.toBeNull();
    // And the text around it is preserved in the preview.
    expect(container.textContent).toContain('Hello');
  });
});

describe('Admin Broadcast — picker never breaks the composer', () => {
  it('11. an open picker does not block sending a broadcast', async () => {
    await render();
    await setTitle('Maintenance');
    await setMessage('Brief downtime');
    // Open the picker and leave it open.
    await click(stickerButton());
    expect(picker()).not.toBeNull();
    // Send + confirm while the picker is open.
    await click(sendButton()!);
    await click(confirmButton()!);
    expect(container.textContent).toContain('Sent to 7 recipients.');
  });

  it('12. a failed sticker load still leaves the composer fully functional', async () => {
    // Force /api/stickers to fail; the composer must keep working.
    fetchMock = makeFetch('reject');
    vi.stubGlobal('fetch', fetchMock);
    await render();
    await setTitle('Hi');
    await setMessage('Everyone');
    await click(sendButton()!);
    await click(confirmButton()!);
    expect(container.textContent).toContain('Sent to 7 recipients.');
    expect((container.querySelector('#broadcast-message') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('Admin Broadcast — backend behaviour unchanged', () => {
  it('13. still POSTs { title, message } to /api/admin/notifications and shows recipients', async () => {
    await render();
    await setTitle('Maintenance');
    await setMessage('VibeBin will be briefly offline.');
    await click(sendButton()!);
    await click(confirmButton()!);
    // The sticker pack pre-load also calls fetch, but its module-level cache
    // means only the admin POST happens in this render — keep the assertion
    // focused on the request that matters.
    const adminCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/admin/notifications'));
    expect(adminCalls.length).toBe(1);
    const [url, init] = adminCalls[0];
    expect(url).toBe('/api/admin/notifications');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      title: 'Maintenance',
      message: 'VibeBin will be briefly offline.',
    });
    expect(JSON.parse(init.body).link).toBeUndefined();
    expect(container.textContent).toContain('Sent to 7 recipients.');
  });

  it('14. the confirmation dialog is unaffected by the picker', async () => {
    await render();
    await setTitle('Hi');
    await setMessage('Everyone');
    await click(sendButton()!);
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(container.textContent).toContain('Send to everyone?');
    // The picker never opened, proving it does not interfere.
    expect(picker()).toBeNull();
  });
});

describe('StickerPicker (isolated — exact empty / error / ready states)', () => {
  async function renderPicker(
    props: { onSelect?: (t: string) => void; onClose?: () => void; pack?: Sticker[] | null } = {},
  ) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let r: Root;
    await act(async () => {
      r = createRoot(host);
      r.render(
        createElement(StickerPicker, {
          onSelect: props.onSelect ?? (() => {}),
          onClose: props.onClose ?? (() => {}),
          pack: props.pack,
        }),
      );
    });
    await flush();
    return { host, r: r! };
  }

  it('shows the ready state from the existing /api/stickers data', async () => {
    const { host, r } = await renderPicker({ pack: STICKERS });
    const tiles = host.querySelectorAll('[data-sticker-token]');
    expect(tiles.length).toBe(2);
    expect(host.querySelector('[data-sticker-token=":wave:"]')).not.toBeNull();
    expect(host.querySelector('[data-sticker-token=":fire:"]')).not.toBeNull();
    r.unmount();
    host.remove();
  });

  it('12a. empty pack shows a non-technical "No stickers available" state and stays usable', async () => {
    const onSelect = vi.fn();
    const { host, r } = await renderPicker({ pack: [], onSelect });
    expect(host.textContent).toContain('No stickers available');
    // It is still a dialog with an explicit close control.
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      (host.querySelector('button[aria-label="Close sticker picker"]') as HTMLElement).click();
    });
    await flush();
    expect(onSelect).not.toHaveBeenCalled();
    r.unmount();
    host.remove();
  });

  it('12b. failed load shows a friendly error state and does not crash', async () => {
    fetchMock = makeFetch('reject');
    vi.stubGlobal('fetch', fetchMock);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => {
      r.render(createElement(StickerPicker, { onSelect: () => {}, onClose: () => {} }));
    });
    // Flush the (rejected) fetch resolution inside act.
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
      await new Promise((res) => setTimeout(res, 0));
    });
    expect(host.textContent).toContain("Couldn’t load stickers");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      r.unmount();
      host.remove();
    });
  });

  it('calls onSelect with the token when a sticker is chosen', async () => {
    const onSelect = vi.fn();
    const { host, r } = await renderPicker({ pack: STICKERS, onSelect });
    await act(async () => {
      (host.querySelector('[data-sticker-token=":fire:"]') as HTMLElement).click();
    });
    await flush();
    expect(onSelect).toHaveBeenCalledWith(':fire:');
    r.unmount();
    host.remove();
  });
});
