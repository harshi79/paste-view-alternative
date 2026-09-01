// @vitest-environment jsdom
/**
 * Focused frontend tests for the UNIFIED post reaction control
 * (corrected TODO 2 — UI only).
 *
 * ONE control, ONE reaction per user: the ❤️ Like is the first/default
 * reaction option and there is NO separate Like button. These exercise
 * the ReactionBar / ReactionPicker client components against a fake of
 * the unified reactions API (/api/pastes/:id/reactions: GET state,
 * POST { reaction }, DELETE) and the EXISTING sticker system
 * (/api/stickers → StickerImage). No backend, DB or Admin Broadcast
 * behaviour is involved — the broadcast suites in this folder keep
 * guarding that picker untouched.
 *
 * Covers: one control / no Like button · current reaction shown on the
 * toggle (emoji + actual sticker) · picker (❤️ first, standards,
 * stickers) · select ❤️ · select 🔥 replaces ❤️ · sticker replaces emoji
 * · select current removes it · exactly one selected reaction at any
 * time · counts combine like + reactions · sticker chips render through
 * StickerImage · optimistic replace · rollback · concurrency guard ·
 * guest redirect · mid-session 401 · open/close (click, outside, Escape,
 * Close button, touch-sized tiles) · Bookmark regression · the Admin
 * Broadcast StickerPicker still works.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentProps, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ReactionBar from '@/components/ReactionBar';
import ReactionPicker, { STANDARD_REACTIONS } from '@/components/ReactionPicker';
import StickerPicker from '@/components/StickerPicker';
import BookmarkButton from '@/components/BookmarkButton';

type Sticker = { token: string; url: string | null; emoji: string | null; label: string };

const PASTE = 'post123456';
const REACTIONS_URL = `/api/pastes/${PASTE}/reactions`;

const STICKERS: Sticker[] = [
  { token: ':wave:', url: 'https://example.com/wave.gif', emoji: '👋', label: 'Wave' },
  { token: ':dance:', url: null, emoji: '🕺', label: 'Dance' },
];

type Srv = { counts: Map<string, number>; mine: string | null };

function snapshot(srv: Srv) {
  const counts = [...srv.counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reaction, count]) => ({ reaction, count }));
  return {
    counts,
    total: counts.reduce((sum, c) => sum + c.count, 0),
    mine: srv.mine,
    authenticated: true,
  };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

let srv: Srv;
/** When set, the next mutation waits on it (lets tests observe pending state). */
let mutationGate: Promise<void> | null = null;
let mutationMode: 'ok' | 'fail' | '401' | 'reject' = 'ok';
let likeCalls = 0;
let bookmarked = false;

async function fakeFetch(
  input: unknown,
  init?: { method?: string; body?: string },
): Promise<Response> {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url.includes('/api/stickers') && method === 'GET') {
    return jsonResponse({ stickers: STICKERS });
  }
  if (url.includes(REACTIONS_URL)) {
    if (method === 'GET') return jsonResponse(snapshot(srv));
    if (method === 'POST' || method === 'DELETE') {
      if (mutationGate) await mutationGate;
      if (mutationMode === 'reject') throw new Error('network down');
      if (mutationMode === '401') {
        return jsonResponse({ error: 'Not signed in.' }, { ok: false, status: 401 });
      }
      if (mutationMode === 'fail') {
        return jsonResponse({ error: 'Could not update reaction.' }, { ok: false, status: 500 });
      }
      if (method === 'POST') {
        // Unified contract: { reaction } selects/replaces (idempotent).
        const body = JSON.parse(init?.body ?? '{}') as { reaction?: string; toggle?: unknown };
        expect(body.toggle, 'the UI uses POST { reaction } to select, not the legacy toggle').toBeUndefined();
        const reaction = String(body.reaction);
        const previous = srv.mine;
        if (previous === reaction) {
          return jsonResponse({
            ok: true, reaction, active: true, created: false, removed: false, previous,
            ...snapshot(srv),
          });
        }
        if (previous) srv.counts.set(previous, (srv.counts.get(previous) ?? 1) - 1);
        srv.mine = reaction;
        srv.counts.set(reaction, (srv.counts.get(reaction) ?? 0) + 1);
        return jsonResponse({
          ok: true, reaction, active: true, created: previous === null, removed: false, previous,
          ...snapshot(srv),
        });
      }
      // DELETE removes the current reaction.
      const previous = srv.mine;
      if (previous) {
        srv.counts.set(previous, (srv.counts.get(previous) ?? 1) - 1);
        srv.mine = null;
      }
      return jsonResponse({
        ok: true, reaction: previous, active: false, created: false, removed: !!previous, previous,
        ...snapshot(srv),
      });
    }
  }
  if (url.includes(`/api/pastes/${PASTE}/like`)) {
    likeCalls += 1; // the unified UI must never touch the like endpoint
    return jsonResponse({ ok: true, count: 1, liked: true });
  }
  if (url.includes(`/api/pastes/${PASTE}/bookmark`)) {
    bookmarked = method === 'POST';
    return jsonResponse({ ok: true, bookmarked, created: bookmarked });
  }
  return jsonResponse({});
}

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  srv = { counts: new Map(), mine: null };
  mutationGate = null;
  mutationMode = 'ok';
  likeCalls = 0;
  bookmarked = false;
  fetchMock = vi.fn(fakeFetch);
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
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount(el: ReactElement) {
  await act(async () => {
    root.render(el);
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

/** The ONE reaction toggle — carries the current (or default ❤️) glyph. */
function toggleButton(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>('button[data-current-reaction]');
  if (!btn) throw new Error('no reaction toggle found');
  return btn;
}

function picker(): Element | null {
  return container.querySelector('#post-reaction-picker');
}

async function openPicker() {
  await click(toggleButton());
}

/** Compare attribute values in JS — emoji never go through selector escaping. */
function findIn(root: ParentNode, selector: string, attr: string, value: string): Element | null {
  for (const el of Array.from(root.querySelectorAll(selector))) {
    if (el.getAttribute(attr) === value) return el;
  }
  return null;
}

function option(reaction: string): Element | null {
  const panel = picker();
  if (!panel) return null;
  return findIn(panel, '[data-reaction-option]', 'data-reaction-option', reaction);
}

function chip(reaction: string): Element | null {
  return findIn(container, '[data-reaction-chip]', 'data-reaction-chip', reaction);
}

function chips(): Element[] {
  return Array.from(container.querySelectorAll('[data-reaction-chip]'));
}

function activeChips(): Element[] {
  return chips().filter((c) => c.getAttribute('aria-pressed') === 'true');
}

function mutationCalls(): Array<{ method: string; body?: Record<string, unknown> }> {
  return fetchMock.mock.calls
    .filter((c) => String(c[0]).includes(REACTIONS_URL))
    .filter((c) => ['POST', 'DELETE'].includes((c[1] as { method?: string } | undefined)?.method ?? ''))
    .map((c) => {
      const init = c[1] as { method?: string; body?: string };
      return {
        method: init.method ?? '',
        body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
      };
    });
}

function bar(props: Partial<ComponentProps<typeof ReactionBar>> = {}) {
  return createElement(ReactionBar, {
    pasteId: PASTE,
    initialCounts: props.initialCounts ?? [],
    initialMine: props.initialMine ?? null,
    guest: props.guest ?? false,
  });
}

/**
 * Records location.href writes without letting jsdom attempt real
 * navigation. Only `window.location` is intercepted — everything else
 * proxies to the real jsdom window (methods bound to it).
 */
function stubWindowLocation(): { hrefs: string[] } {
  const hrefs: string[] = [];
  const real = window;
  const fakeLocation = {
    get href() {
      return hrefs.length ? hrefs[hrefs.length - 1] : real.location.href;
    },
    set href(v: string) {
      hrefs.push(v);
    },
    assign(v: string) {
      hrefs.push(v);
    },
  };
  const proxy = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'location') return fakeLocation;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  vi.stubGlobal('window', proxy);
  return { hrefs };
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

describe('ReactionBar — ONE unified control (no separate Like button)', () => {
  it('1. renders exactly one reaction toggle, defaulting to ❤️, with no Like button anywhere', async () => {
    await mount(bar());
    const btn = toggleButton();
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('post-reaction-picker');
    expect(btn.getAttribute('aria-label')).toBe('React to this paste');
    expect(btn.getAttribute('data-current-reaction')).toBe(''); // no reaction yet
    expect(btn.textContent).toContain('❤️'); // the Like is the default option

    // ONE control only — and no separate Like/Unlike button beside it.
    expect(container.querySelectorAll('button[data-current-reaction]')).toHaveLength(1);
    const likeButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => /like/i.test(b.textContent ?? '') || /like/i.test(b.getAttribute('aria-label') ?? ''),
    );
    expect(likeButtons).toEqual([]);
    expect(likeCalls).toBe(0);
  });

  it('2. the toggle shows the user’s current reaction (emoji)', async () => {
    srv = { counts: new Map([['🔥', 5]]), mine: '🔥' };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 5 }], initialMine: '🔥' }));
    expect(toggleButton().textContent).toContain('🔥');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('🔥');
    expect(toggleButton().getAttribute('aria-label')).toBe('Change reaction (current 🔥)');
  });

  it('2b. the toggle renders a sticker reaction as the actual sticker image', async () => {
    srv = { counts: new Map([[':wave:', 2]]), mine: ':wave:' };
    await mount(bar({ initialCounts: [{ reaction: ':wave:', count: 2 }], initialMine: ':wave:' }));
    const stickerToggle = toggleButton();
    expect(stickerToggle.getAttribute('data-current-reaction')).toBe(':wave:');
    // An animated sticker reaction renders as the actual sticker image —
    // never the raw ':wave:' token.
    expect(stickerToggle.querySelector('img[src="https://example.com/wave.gif"]')).not.toBeNull();
    expect(stickerToggle.textContent).not.toContain(':wave:');
  });

  it('3. clicking the toggle opens the popover; clicking again / Close closes it', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()).not.toBeNull();
    expect(picker()?.getAttribute('role')).toBe('dialog');
    expect(picker()?.getAttribute('aria-label')).toBe('Reaction picker');
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true');

    await click(toggleButton());
    expect(picker()).toBeNull();

    await openPicker();
    await click(findIn(picker()!, 'button', 'aria-label', 'Close reaction picker')!);
    expect(picker()).toBeNull();
  });

  it('4. the standard reactions appear with ❤️ (the Like) first, in order', async () => {
    await mount(bar());
    await openPicker();
    const tiles = Array.from(picker()!.querySelectorAll('[data-reaction-option]')).filter(
      (t) => !t.hasAttribute('data-sticker-token'),
    );
    expect(tiles.map((t) => t.getAttribute('data-reaction-option'))).toEqual([
      '❤️',
      '🔥',
      '😂',
      '😮',
      '😢',
      '💀',
      '👀',
    ]);
    expect(STANDARD_REACTIONS).toEqual(['❤️', '🔥', '😂', '😮', '😢', '💀', '👀']);
  });

  it('5. the Custom section shows the existing sticker pack as touch-sized tiles', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()?.textContent).toContain('Custom');
    expect(option(':wave:')).not.toBeNull();
    expect(option(':dance:')).not.toBeNull();
    const waveTile = option(':wave:')!;
    expect(waveTile.getAttribute('data-sticker-token')).toBe(':wave:');
    expect(waveTile.getAttribute('aria-label')).toContain(':wave:');
    expect(waveTile.className).toContain('min-h-[44px]');
    expect(waveTile.querySelector('img[src="https://example.com/wave.gif"]')).not.toBeNull();
    const danceTile = option(':dance:')!;
    expect(danceTile.querySelector('img')).toBeNull();
    expect(danceTile.textContent).toContain('🕺');
  });

  it('15. outside click closes the picker', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()).not.toBeNull();
    await outsideClick();
    expect(picker()).toBeNull();
  });

  it('16. Escape closes the picker and returns focus to the toggle', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()).not.toBeNull();
    await pressEscape();
    expect(picker()).toBeNull();
    expect(document.activeElement).toBe(toggleButton());
  });
});

describe('ReactionBar — ONE reaction per user, end to end', () => {
  it('6. selecting ❤️ from the picker works (the Like as a reaction)', async () => {
    await mount(bar());
    await openPicker();
    await click(option('❤️')!);
    expect(picker()).toBeNull(); // select → close
    expect(mutationCalls()).toEqual([{ method: 'POST', body: { reaction: '❤️' } }]);
    expect(chip('❤️')).not.toBeNull();
    expect(chip('❤️')?.getAttribute('aria-pressed')).toBe('true');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('❤️');
    expect(likeCalls).toBe(0); // never the old like endpoint
  });

  it('7. selecting 🔥 REPLACES ❤️ (never stacks)', async () => {
    srv = { counts: new Map([['❤️', 24], ['🔥', 8]]), mine: '❤️' };
    await mount(
      bar({
        initialCounts: [
          { reaction: '❤️', count: 24 },
          { reaction: '🔥', count: 8 },
        ],
        initialMine: '❤️',
      }),
    );
    await openPicker();
    await click(option('🔥')!);
    expect(mutationCalls()).toEqual([{ method: 'POST', body: { reaction: '🔥' } }]);

    // ❤️ 23 · 🔥 9 — counts reconciled, still one chip each.
    expect(chip('❤️')?.textContent).toContain('23');
    expect(chip('🔥')?.textContent).toContain('9');
    expect(chips()).toHaveLength(2);
    // Exactly ONE selected reaction at any time.
    expect(activeChips()).toHaveLength(1);
    expect(activeChips()[0]?.getAttribute('data-reaction-chip')).toBe('🔥');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('🔥');
  });

  it('8. selecting a sticker REPLACES the emoji reaction (canonical token sent)', async () => {
    srv = { counts: new Map([['🔥', 1]]), mine: '🔥' };
    await mount(
      bar({ initialCounts: [{ reaction: '🔥', count: 1 }], initialMine: '🔥' }),
    );
    await openPicker();
    await click(option(':wave:')!);
    expect(picker()).toBeNull(); // select → close
    expect(mutationCalls()).toEqual([{ method: 'POST', body: { reaction: ':wave:' } }]);
    expect(chip('🔥')).toBeNull(); // 🔥 disappeared
    // The chip AND the toggle render the actual sticker, never the token.
    expect(chip(':wave:')?.querySelector('img[src="https://example.com/wave.gif"]')).not.toBeNull();
    expect(toggleButton().querySelector('img[src="https://example.com/wave.gif"]')).not.toBeNull();
    expect(activeChips()).toHaveLength(1);
  });

  it('9. selecting the CURRENT reaction removes it', async () => {
    srv = { counts: new Map([['🔥', 1]]), mine: '🔥' };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 1 }], initialMine: '🔥' }));
    await openPicker();
    await click(option('🔥')!);
    expect(mutationCalls()).toEqual([{ method: 'DELETE' }]);
    expect(chip('🔥')).toBeNull(); // count dropped to zero → chip gone
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('');
    expect(toggleButton().textContent).toContain('❤️'); // back to the default
    expect(srv.mine).toBeNull();
  });

  it('10. clicking a chip works the same way (toggle current / switch to it)', async () => {
    srv = { counts: new Map([['❤️', 3], ['🔥', 1]]), mine: '❤️' };
    await mount(
      bar({
        initialCounts: [
          { reaction: '❤️', count: 3 },
          { reaction: '🔥', count: 1 },
        ],
        initialMine: '❤️',
      }),
    );
    // Chip click switches ❤️ → 🔥 without opening the picker.
    await click(chip('🔥')!);
    expect(mutationCalls()).toEqual([{ method: 'POST', body: { reaction: '🔥' } }]);
    expect(activeChips()).toHaveLength(1);
    expect(activeChips()[0]?.getAttribute('data-reaction-chip')).toBe('🔥');

    // Clicking the now-active chip removes it.
    await click(chip('🔥')!);
    expect(mutationCalls()).toHaveLength(2);
    expect(mutationCalls()[1]).toEqual({ method: 'DELETE' });
    expect(activeChips()).toHaveLength(0);
    expect(toggleButton().textContent).toContain('❤️');
  });

  it('11. counts render as ONE unified set (the ❤️ count IS the like count)', async () => {
    srv = {
      counts: new Map([
        ['❤️', 24],
        ['🔥', 8],
        ['😂', 5],
        ['👀', 2],
      ]),
      mine: '🔥',
    };
    await mount(bar({ initialCounts: [{ reaction: '😂', count: 1 }], initialMine: null }));
    await flush(); // mount-time GET reconciles to 24 / 8 / 5 / 2
    expect(chip('❤️')?.textContent).toContain('24');
    expect(chip('🔥')?.textContent).toContain('8');
    expect(chip('😂')?.textContent).toContain('5');
    expect(chip('👀')?.textContent).toContain('2');
    expect(chips()).toHaveLength(4); // one chip per reaction, no duplicates

    // Toggling off and on again never produces a second chip.
    await click(chip('🔥')!);
    await openPicker();
    await click(option('🔥')!);
    expect(chips()).toHaveLength(4);
    expect(chips().filter((c) => c.getAttribute('data-reaction-chip') === '🔥')).toHaveLength(1);
  });

  it('12. sticker chips render through StickerImage, never raw tokens', async () => {
    srv = {
      counts: new Map([
        [':wave:', 3],
        [':dance:', 1],
      ]),
      mine: null,
    };
    await mount(
      bar({
        initialCounts: [
          { reaction: ':wave:', count: 3 },
          { reaction: ':dance:', count: 1 },
        ],
      }),
    );
    const wave = chip(':wave:')!;
    expect(wave.querySelector('img[src="https://example.com/wave.gif"]')).not.toBeNull();
    expect(wave.querySelector('img')?.getAttribute('alt')).toBe('Wave');
    expect(wave.textContent).not.toContain(':wave:'); // no raw token, count only
    expect(wave.textContent).toContain('3');
    const dance = chip(':dance:')!;
    expect(dance.querySelector('img')).toBeNull();
    expect(dance.textContent).toContain('🕺'); // pack emoji fallback, not the token
    expect(dance.textContent).not.toContain(':dance:');
  });

  it('fetches the current reaction state on mount and reconciles it', async () => {
    srv = { counts: new Map([['😮', 2]]), mine: '😮' };
    await mount(bar()); // SSR had nothing
    expect(chip('😮')?.textContent).toContain('2');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('😮');
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes(REACTIONS_URL)).length,
    ).toBeGreaterThan(0);
  });
});

describe('ReactionBar — optimistic UI, failures, click guards', () => {
  it('13. replacing a reaction updates optimistically and reconciles after', async () => {
    srv = { counts: new Map([['❤️', 12], ['🔥', 3]]), mine: '❤️' };
    await mount(
      bar({
        initialCounts: [
          { reaction: '❤️', count: 12 },
          { reaction: '🔥', count: 3 },
        ],
        initialMine: '❤️',
      }),
    );
    let release!: () => void;
    mutationGate = new Promise((r) => {
      release = r;
    });

    await click(chip('🔥')!);
    // Optimistic, while the request is still in flight: ❤️ 12→11, 🔥 3→4,
    // exactly one selected chip (🔥), toggle already shows 🔥.
    expect(chip('❤️')?.textContent).toContain('11');
    expect(chip('🔥')?.textContent).toContain('4');
    expect(activeChips()).toHaveLength(1);
    expect(activeChips()[0]?.getAttribute('data-reaction-chip')).toBe('🔥');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('🔥');

    await act(async () => {
      release();
    });
    await flush();
    // Server state agrees — authoritative now.
    expect(chip('❤️')?.textContent).toContain('11');
    expect(chip('🔥')?.textContent).toContain('4');
    expect(srv.counts.get('❤️')).toBe(11);
    expect(srv.counts.get('🔥')).toBe(4);
  });

  it('14. a failed request rolls the optimistic change back exactly', async () => {
    srv = { counts: new Map([['❤️', 12]]), mine: '❤️' };
    await mount(bar({ initialCounts: [{ reaction: '❤️', count: 12 }], initialMine: '❤️' }));

    // Network failure while switching ❤️ → 🔥.
    mutationMode = 'reject';
    await openPicker();
    await click(option('🔥')!);
    await flush();
    expect(chip('❤️')?.textContent).toContain('12'); // restored
    expect(chip('🔥')).toBeNull();
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('❤️');
    expect(activeChips()).toHaveLength(1);
    expect(container.textContent).toContain('network down');

    // Server error responses also roll back and surface the message.
    mutationMode = 'fail';
    await openPicker();
    await click(option('🔥')!);
    await flush();
    expect(chip('❤️')?.textContent).toContain('12');
    expect(chip('🔥')).toBeNull();
    expect(container.textContent).toContain('Could not update reaction.');

    // Removal failures roll back too.
    mutationMode = 'reject';
    await click(chip('❤️')!);
    await flush();
    expect(chip('❤️')?.textContent).toContain('12');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('❤️');
  });

  it('17. concurrent clicks while a request is in flight send exactly one request', async () => {
    srv = { counts: new Map([['❤️', 12]]), mine: '❤️' };
    await mount(bar({ initialCounts: [{ reaction: '❤️', count: 12 }], initialMine: '❤️' }));
    let release!: () => void;
    mutationGate = new Promise((r) => {
      release = r;
    });

    await openPicker();
    await act(async () => {
      option('🔥')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    // More clicks while the first is still in flight: no extra requests,
    // no impossible states (chip clicks + another picker click).
    await act(async () => {
      chip('🔥')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      chip('❤️')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mutationCalls()).toHaveLength(1);

    await act(async () => {
      release();
    });
    await flush();
    expect(mutationCalls()).toHaveLength(1);
    expect(chip('❤️')?.textContent).toContain('11');
    expect(chip('🔥')?.textContent).toContain('1');
    expect(activeChips()).toHaveLength(1);
    expect(srv.mine).toBe('🔥');
  });

  it('18. a mid-session 401 rolls back and uses the register redirect', async () => {
    const { hrefs } = stubWindowLocation();
    srv = { counts: new Map([['❤️', 12]]), mine: '❤️' };
    mutationMode = '401';
    await mount(bar({ initialCounts: [{ reaction: '❤️', count: 12 }], initialMine: '❤️' }));
    await click(chip('❤️')!);
    await flush();
    expect(hrefs).toContain(`/register?next=${encodeURIComponent(`/p/${PASTE}`)}`);
    // The optimistic removal is undone even on the 401 path.
    expect(chip('❤️')?.getAttribute('aria-pressed')).toBe('true');
    expect(chip('❤️')?.textContent).toContain('12');
    expect(toggleButton().getAttribute('data-current-reaction')).toBe('❤️');
  });
});

describe('ReactionBar — guest behavior (existing redirect convention)', () => {
  it('19. guests see counts; attempting to react redirects to /register with the post preserved', async () => {
    const { hrefs } = stubWindowLocation();
    srv = { counts: new Map([['🔥', 7]]), mine: null };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 7 }], guest: true }));
    // Counts stay readable for guests (display data, like the like count).
    expect(chip('🔥')?.textContent).toContain('7');

    // Opening the picker is fine — it is reacting that redirects.
    await openPicker();
    expect(picker()).not.toBeNull();
    await click(option('🔥')!);
    expect(hrefs).toContain(`/register?next=${encodeURIComponent(`/p/${PASTE}`)}`);
    // Guests never fire reaction writes (no silent fail, no optimistic state).
    expect(mutationCalls()).toHaveLength(0);
    expect(chip('🔥')?.getAttribute('aria-pressed')).toBe('false');
    expect(likeCalls).toBe(0);

    // Chips are the same flow.
    await click(chip('🔥')!);
    expect(hrefs.length).toBe(2);
    expect(mutationCalls()).toHaveLength(0);
  });
});

describe('existing post controls and the Admin Broadcast picker keep working', () => {
  it('20. the Bookmark button still works unchanged', async () => {
    await mount(createElement(BookmarkButton, { pasteId: PASTE, initialBookmarked: false }));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save',
    )!;
    await click(btn);
    expect(
      fetchMock.mock.calls.some(
        (c) =>
          String(c[0]).includes(`/api/pastes/${PASTE}/bookmark`) &&
          (c[1] as { method?: string } | undefined)?.method === 'POST',
      ),
    ).toBe(true);
    expect(container.textContent).toContain('Saved');
  });

  it('21. the Admin Broadcast StickerPicker component is unaffected', async () => {
    const selected: string[] = [];
    let closeCalls = 0;
    const host = document.createElement('div');
    document.body.appendChild(host);
    let broadcastRoot: Root;
    await act(async () => {
      broadcastRoot = createRoot(host);
      broadcastRoot.render(
        createElement(StickerPicker, {
          pack: STICKERS,
          onSelect: (t: string) => selected.push(t),
          onClose: () => {
            closeCalls += 1;
          },
        }),
      );
    });
    await flush();
    expect(host.querySelector('#broadcast-sticker-picker')).not.toBeNull();
    expect(findIn(host, 'button', 'data-sticker-token', ':wave:')).not.toBeNull();
    await act(async () => {
      (findIn(host, 'button', 'data-sticker-token', ':wave:') as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(selected).toEqual([':wave:']); // still hands out the token shortcode
    await act(async () => {
      (findIn(host, 'button', 'aria-label', 'Close sticker picker') as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(closeCalls).toBe(1);
    await act(async () => {
      broadcastRoot!.unmount();
    });
    host.remove();
  });
});

describe('ReactionPicker — standalone contract (used by ReactionBar)', () => {
  it('reports selection and close; exactly one option can be selected', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const picked: string[] = [];
    let closed = 0;
    let r: Root;
    await act(async () => {
      r = createRoot(host);
      r.render(
        createElement(ReactionPicker, {
          pack: STICKERS,
          mine: '🔥',
          onSelect: (reaction: string) => picked.push(reaction),
          onClose: () => {
            closed += 1;
          },
        }),
      );
    });
    await flush();
    const pressed = Array.from(host.querySelectorAll('[data-reaction-option]')).filter(
      (t) => t.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toHaveLength(1); // ONE reaction — never several selected
    expect(pressed[0]?.getAttribute('data-reaction-option')).toBe('🔥');
    await act(async () => {
      (findIn(host, 'button', 'data-reaction-option', '👀') as HTMLElement).click();
      (findIn(host, 'button', 'data-reaction-option', ':dance:') as HTMLElement).click();
      await new Promise((r2) => setTimeout(r2, 0));
    });
    expect(picked).toEqual(['👀', ':dance:']);
    await act(async () => {
      (findIn(host, 'button', 'aria-label', 'Close reaction picker') as HTMLElement).click();
    });
    expect(closed).toBe(1);
    await act(async () => {
      r!.unmount();
    });
    host.remove();
  });
});
