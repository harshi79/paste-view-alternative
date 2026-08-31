// @vitest-environment jsdom
/**
 * Admin broadcast UI tests — the composer that POSTs to the existing
 * /api/admin/notifications endpoint. Backend is not modified here.
 *
 * Covers: fields (title + message only — no separate Link input), live
 * preview (stickers/emoji + clickable links from the message text),
 * confirmation-before-send, loading / double-submit protection, success
 * (recipient count), error, and the request body the existing API
 * expects (which no longer contains a `link`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import BroadcastAdminClient, { MAX_MESSAGE, MAX_TITLE } from '@/components/BroadcastAdminClient';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async () => jsonResponse({ ok: true, broadcastId: 'b1', recipients: 7 }));
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

async function fill(fields: { title?: string; message?: string }) {
  await act(async () => {
    if (fields.title !== undefined) {
      setInputValue(container.querySelector('#broadcast-title') as HTMLInputElement, fields.title);
    }
    if (fields.message !== undefined) {
      setInputValue(container.querySelector('#broadcast-message') as HTMLTextAreaElement, fields.message);
    }
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

describe('BroadcastAdminClient', () => {
  it('renders title + message only (no separate Link input) with preview and send control', async () => {
    await render();
    expect(container.querySelector('#broadcast-title')).not.toBeNull();
    expect(container.querySelector('#broadcast-message')).not.toBeNull();
    // The separate Link field is gone — URLs live inside the message.
    expect(container.querySelector('#broadcast-link')).toBeNull();
    expect(container.querySelector('input[name="link"]')).toBeNull();
    expect(container.textContent).toContain('Preview');
    expect(container.textContent).toContain('Send to everyone');
    expect(container.textContent).toContain('12');
    expect(sendButton()?.disabled).toBe(true);
    // Stacks on small screens, two columns on desktop.
    expect(container.innerHTML).toContain('grid-cols-1');
    expect(container.innerHTML).toContain('lg:grid-cols-');
  });

  it('updates the preview as the admin types', async () => {
    await render();
    await fill({ title: 'Maintenance', message: 'Brief downtime.' });
    expect(container.textContent).toContain('Maintenance');
    expect(container.textContent).toContain('Brief downtime.');
    expect(sendButton()?.disabled).toBe(false);
  });

  it('previews stickers/emoji and clickable links typed in the message', async () => {
    await render();
    await fill({ title: 'Hi', message: 'Hello :wave: — check https://example.com' });
    // :wave: resolves through the existing emoji shortcut when the pack is
    // empty (the stubbed /api/stickers returns no rows in these tests).
    expect(container.textContent).toContain('👋');
    const link = container.querySelector('a[href="https://example.com"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('never turns an unsafe URL scheme into a link in the preview', async () => {
    await render();
    await fill({ title: 'Careful', message: 'Click javascript:alert(1) or data:text/html,hi' });
    // The schemes stay inert plain text — no href is ever produced.
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('a[href^="data:"]')).toBeNull();
    expect(container.textContent).toContain('javascript:alert(1)');
  });

  it('asks for confirmation and does not POST until confirmed', async () => {
    await render();
    await fill({ title: 'Hi', message: 'Everyone' });
    await click(sendButton()!);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Send to everyone?');
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(confirmButton()).not.toBeNull();
  });

  it('POSTs { title, message } to /api/admin/notifications and shows the recipient count', async () => {
    await render();
    await fill({ title: 'Maintenance', message: 'VibeBin will be briefly offline.' });
    await click(sendButton()!);
    await click(confirmButton()!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/notifications');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    // No separate `link` field is sent anymore — URLs live in `message`.
    expect(JSON.parse(init.body)).toEqual({
      title: 'Maintenance',
      message: 'VibeBin will be briefly offline.',
    });
    expect(JSON.parse(init.body).link).toBeUndefined();
    expect(container.textContent).toContain('Sent to 7 recipients.');
    expect((container.querySelector('#broadcast-title') as HTMLInputElement).value).toBe('');
  });

  it('sends a URL typed inside the message as message text (never as a link field)', async () => {
    await render();
    await fill({ title: 'Read this', message: 'Details at https://example.com' });
    await click(sendButton()!);
    await click(confirmButton()!);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ title: 'Read this', message: 'Details at https://example.com' });
    expect(body.link).toBeUndefined();
  });

  it('shows the API error and does not claim success', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'Forbidden.' }, { ok: false, status: 403 }));
    await render();
    await fill({ title: 'Hi', message: 'Everyone' });
    await click(sendButton()!);
    await click(confirmButton()!);
    expect(container.textContent).toContain('Forbidden.');
    expect(container.textContent).not.toContain('Sent to');
  });

  it('protects against double-submit while a request is in flight', async () => {
    let resolveFetch: ((v: Response) => void) | null = null;
    fetchMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveFetch = res;
        }),
    );
    await render();
    await fill({ title: 'Hi', message: 'Everyone' });
    await click(sendButton()!);
    const confirm = confirmButton()!;
    await act(async () => {
      confirm.click();
    });
    expect(container.textContent).toContain('Sending…');
    expect(confirmButton()?.disabled).toBe(true);
    await act(async () => {
      confirm.click();
      confirm.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch!(jsonResponse({ ok: true, broadcastId: 'b2', recipients: 3 }));
    });
    await flush();
    expect(container.textContent).toContain('Sent to 3 recipients.');
  });

  it('lets Cancel drop the confirmation without sending', async () => {
    await render();
    await fill({ title: 'Hi', message: 'Everyone' });
    await click(sendButton()!);
    const cancel = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
    await click(cancel);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Send to everyone');
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
