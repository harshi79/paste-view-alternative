// @vitest-environment jsdom
/**
 * Focused frontend tests for post reactions (TODO 2 — UI only).
 *
 * These exercise the new ReactionBar / ReactionPicker client components
 * against a fake of the EXISTING TODO 1 reactions API
 * (/api/pastes/:id/reactions: GET state, POST { reaction, toggle:true }),
 * and the EXISTING sticker system (/api/stickers → StickerImage). No
 * backend, DB or Admin Broadcast behaviour is involved — the broadcast
 * suites in this folder keep guarding that picker untouched.
 *
 * Covers (job checklist 1–19; 20 = the untouched StickerPicker mounted
 * directly here + its full existing suite in the npm test run):
 *   renders React button · opens/closes picker (click, outside click,
 *   Escape) · standard reactions · custom sticker tiles from the existing
 *   pack · click selects via the existing API (emoji + canonical token) ·
 *   active/selected state · click removes · multiple different reactions ·
 *   counts render, one chip per reaction · sticker chips render through
 *   StickerImage (never raw tokens) · optimistic update · rollback on
 *   failure · duplicate/concurrent click guard · guest redirect to
 *   /register · mid-session 401 · Like + Bookmark regressions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentProps, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ReactionBar from '@/components/ReactionBar';
import ReactionPicker, { STANDARD_REACTIONS } from '@/components/ReactionPicker';
import StickerPicker from '@/components/StickerPicker';
import LikeButton from '@/components/LikeButton';
import BookmarkButton from '@/components/BookmarkButton';

type Sticker = { token: string; url: string | null; emoji: string | null; label: string };

const PASTE = 'post123456';
const REACTIONS_URL = `/api/pastes/${PASTE}/reactions`;

const STICKERS: Sticker[] = [
  { token: ':wave:', url: 'https://example.com/wave.gif', emoji: '👋', label: 'Wave' },
  { token: ':dance:', url: null, emoji: '🕺', label: 'Dance' },
];

type Srv = { counts: Map<string, number>; mine: Set<string> };

function snapshot(srv: Srv) {
  const counts = [...srv.counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reaction, count]) => ({ reaction, count }));
  return {
    counts,
    total: counts.reduce((sum, c) => sum + c.count, 0),
    mine: [...srv.mine],
    authenticated: true,
  };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

let srv: Srv;
/** When set, the next POST waits on it (lets tests observe pending state). */
let postGate: Promise<void> | null = null;
let postMode: 'ok' | 'fail' | '401' | 'reject' = 'ok';
let likeLiked = false;
let likeCount = 4;
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
    if (method === 'POST') {
      if (postGate) await postGate;
      if (postMode === 'reject') throw new Error('network down');
      if (postMode === '401') {
        return jsonResponse({ error: 'Not signed in.' }, { ok: false, status: 401 });
      }
      if (postMode === 'fail') {
        return jsonResponse({ error: 'Could not update reaction.' }, { ok: false, status: 500 });
      }
      const body = JSON.parse(init?.body ?? '{}') as { reaction?: string; toggle?: boolean };
      expect(body.toggle, 'the UI must use the existing toggle endpoint').toBe(true);
      const reaction = String(body.reaction);
      let active: boolean;
      if (srv.mine.has(reaction)) {
        srv.mine.delete(reaction);
        srv.counts.set(reaction, (srv.counts.get(reaction) ?? 1) - 1);
        active = false;
      } else {
        srv.mine.add(reaction);
        srv.counts.set(reaction, (srv.counts.get(reaction) ?? 0) + 1);
        active = true;
      }
      return jsonResponse({
        ok: true,
        reaction,
        active,
        created: active,
        removed: !active,
        ...snapshot(srv),
      });
    }
  }
  if (url.includes(`/api/pastes/${PASTE}/like`)) {
    if (method === 'POST') {
      likeLiked = true;
      likeCount += 1;
    } else if (method === 'DELETE') {
      likeLiked = false;
      likeCount = Math.max(0, likeCount - 1);
    }
    return jsonResponse({ ok: true, liked: likeLiked, count: likeCount });
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
  srv = { counts: new Map(), mine: new Set() };
  postGate = null;
  postMode = 'ok';
  likeLiked = false;
  likeCount = 4;
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

function reactButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'React',
  );
  if (!btn) throw new Error('no React button found');
  return btn as HTMLButtonElement;
}

function picker(): Element | null {
  return container.querySelector('#post-reaction-picker');
}

async function openPicker() {
  await click(reactButton());
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

function reactionPosts(): Array<{ reaction: string; toggle: boolean }> {
  return fetchMock.mock.calls
    .filter(
      (c) =>
        String(c[0]).includes(REACTIONS_URL) &&
        (c[1] as { method?: string } | undefined)?.method === 'POST',
    )
    .map((c) => JSON.parse(String((c[1] as { body?: string }).body)));
}

function bar(props: Partial<ComponentProps<typeof ReactionBar>> = {}) {
  return createElement(ReactionBar, {
    pasteId: PASTE,
    initialCounts: props.initialCounts ?? [],
    initialMine: props.initialMine ?? [],
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

describe('ReactionBar — button + picker', () => {
  it('1. renders a compact React button next to the post actions', async () => {
    await mount(bar());
    const btn = reactButton();
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe('post-reaction-picker');
    expect(btn.getAttribute('aria-label')).toBe('React to this paste');
  });

  it('2. clicking React opens the popover; clicking again / the Close button closes it', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()).not.toBeNull();
    expect(picker()?.getAttribute('role')).toBe('dialog');
    expect(picker()?.getAttribute('aria-label')).toBe('Reaction picker');
    expect(reactButton().getAttribute('aria-expanded')).toBe('true');

    await click(reactButton());
    expect(picker()).toBeNull();

    await openPicker();
    await click(findIn(picker()!, 'button', 'aria-label', 'Close reaction picker')!);
    expect(picker()).toBeNull();
  });

  it('3. the standard reactions appear (fixed set, in order)', async () => {
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

  it('4. the Custom section shows the existing sticker pack as tiles', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()?.textContent).toContain('Custom');
    expect(option(':wave:')).not.toBeNull();
    expect(option(':dance:')).not.toBeNull();
    // Tiles render through the existing StickerImage renderer.
    const waveTile = option(':wave:')!;
    expect(waveTile.getAttribute('data-sticker-token')).toBe(':wave:');
    expect(waveTile.getAttribute('aria-label')).toContain(':wave:');
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

  it('16. Escape closes the picker and returns focus to the React button', async () => {
    await mount(bar());
    await openPicker();
    expect(picker()).not.toBeNull();
    await pressEscape();
    expect(picker()).toBeNull();
    expect(document.activeElement).toBe(reactButton());
  });
});

describe('ReactionBar — reactions against the existing API', () => {
  it('5. clicking a standard reaction toggles it through the existing reactions API and closes the picker', async () => {
    await mount(bar());
    await openPicker();
    await click(option('🔥')!);
    expect(picker()).toBeNull(); // select → close
    expect(reactionPosts()).toEqual([{ reaction: '🔥', toggle: true }]);
    // …and the chip shows up.
    expect(chip('🔥')).not.toBeNull();
    expect(chip('🔥')?.textContent).toContain('1');
  });

  it('6. clicking a custom sticker sends its canonical :token: to the same API', async () => {
    await mount(bar());
    await openPicker();
    await click(option(':wave:')!);
    expect(reactionPosts()).toEqual([{ reaction: ':wave:', toggle: true }]);
    expect(chip(':wave:')).not.toBeNull();
  });

  it('7. the current user’s reactions are visually selected (chips + picker tiles)', async () => {
    srv = {
      counts: new Map([
        ['🔥', 5],
        [':wave:', 1],
      ]),
      mine: new Set(['🔥', ':wave:']),
    };
    await mount(
      bar({
        initialCounts: [
          { reaction: '🔥', count: 5 },
          { reaction: ':wave:', count: 1 },
        ],
        initialMine: ['🔥', ':wave:'],
      }),
    );
    const fireChip = chip('🔥')!;
    expect(fireChip.getAttribute('aria-pressed')).toBe('true');
    expect(fireChip.className).toContain('border-brand-400');
    expect(fireChip.getAttribute('title')).toBe('You reacted — click to remove');
    expect(chip(':wave:')?.getAttribute('aria-pressed')).toBe('true');

    await openPicker();
    expect(option('🔥')?.getAttribute('aria-pressed')).toBe('true');
    expect(option(':wave:')?.getAttribute('aria-pressed')).toBe('true');
    expect(option('💀')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('8. clicking an active reaction removes it', async () => {
    srv = { counts: new Map([['🔥', 1]]), mine: new Set(['🔥']) };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 1 }], initialMine: ['🔥'] }));
    await click(chip('🔥')!);
    expect(reactionPosts()).toEqual([{ reaction: '🔥', toggle: true }]);
    expect(chip('🔥')).toBeNull(); // count dropped to zero → chip gone
    expect(srv.mine.size).toBe(0);
  });

  it('9. multiple DIFFERENT reactions can be held at once (one chip each)', async () => {
    await mount(bar());
    await openPicker();
    await click(option('🔥')!);
    await openPicker();
    await click(option('😂')!);
    await openPicker();
    await click(option(':wave:')!);
    expect(chip('🔥')).not.toBeNull();
    expect(chip('😂')).not.toBeNull();
    expect(chip(':wave:')).not.toBeNull();
    expect(chips().length).toBe(3);
    expect(chips().filter((c) => c.getAttribute('aria-pressed') === 'true').length).toBe(3);
  });

  it('10. reaction counts render from the API state, one chip per reaction, never duplicated', async () => {
    srv = {
      counts: new Map([
        ['🔥', 12],
        ['😂', 4],
        ['👀', 2],
      ]),
      mine: new Set(['🔥']),
    };
    await mount(bar({ initialCounts: [{ reaction: '😂', count: 1 }] }));
    await flush(); // mount-time GET reconciles to 12 / 4 / 2
    expect(chip('🔥')?.textContent).toContain('12');
    expect(chip('😂')?.textContent).toContain('4');
    expect(chip('👀')?.textContent).toContain('2');
    expect(chips().length).toBe(3);
    // Toggling off and on again never produces a second chip.
    await click(chip('🔥')!);
    await click(chip('🔥')!);
    expect(chips().length).toBe(3);
    expect(findAllChipsFor('🔥')).toBe(1);
  });

  function findAllChipsFor(reaction: string): number {
    return chips().filter((c) => c.getAttribute('data-reaction-chip') === reaction).length;
  }

  it('11. custom sticker reactions render through StickerImage, never raw tokens', async () => {
    srv = {
      counts: new Map([
        [':wave:', 3],
        [':dance:', 1],
      ]),
      mine: new Set<string>(),
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
    srv = { counts: new Map([['😮', 2]]), mine: new Set<string>() };
    await mount(bar()); // SSR had nothing
    expect(chip('😮')?.textContent).toContain('2');
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes(REACTIONS_URL)).length,
    ).toBeGreaterThan(0);
  });
});

describe('ReactionBar — optimistic UI, failures, click guards', () => {
  it('12. the UI updates optimistically before the response and reconciles after', async () => {
    srv = { counts: new Map([['🔥', 12]]), mine: new Set<string>() };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 12 }] }));
    let release!: () => void;
    postGate = new Promise((r) => {
      release = r;
    });

    await click(chip('🔥')!);
    // Optimistic, while the request is still in flight:
    expect(chip('🔥')?.textContent).toContain('13');
    expect(chip('🔥')?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      release();
    });
    await flush();
    // Server state (also 13) keeps the chip, now authoritative.
    expect(chip('🔥')?.textContent).toContain('13');
    expect(srv.counts.get('🔥')).toBe(13);
  });

  it('13. a failed request rolls the optimistic change back (no stale fake counts)', async () => {
    srv = { counts: new Map([['🔥', 12]]), mine: new Set(['🔥']) };
    postMode = 'reject';
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 12 }], initialMine: ['🔥'] }));
    await click(chip('🔥')!); // optimistic remove
    await flush();
    // Rolled back: chip is present again with the original count + pressed.
    expect(chip('🔥')?.textContent).toContain('12');
    expect(chip('🔥')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('network down');
    expect(srv.counts.get('🔥')).toBe(12);

    // Server error responses also roll back and surface the server message.
    postMode = 'fail';
    await click(chip('🔥')!);
    await flush();
    expect(chip('🔥')?.textContent).toContain('12');
    expect(container.textContent).toContain('Could not update reaction.');
  });

  it('14. duplicate/concurrent clicks for the same reaction send exactly one request', async () => {
    srv = { counts: new Map([['🔥', 12]]), mine: new Set<string>() };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 12 }] }));
    let release!: () => void;
    postGate = new Promise((r) => {
      release = r;
    });

    await click(chip('🔥')!);
    // Two more clicks while the first is still in flight: no extra
    // requests and no double-counting.
    await act(async () => {
      chip('🔥')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      chip('🔥')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(reactionPosts().length).toBe(1);
    expect(chip('🔥')?.textContent).toContain('13');

    await act(async () => {
      release();
    });
    await flush();
    expect(chip('🔥')?.textContent).toContain('13');
    expect(reactionPosts().length).toBe(1);
    expect(srv.counts.get('🔥')).toBe(13);
  });

  it('a mid-session 401 rolls back and uses the register redirect', async () => {
    const { hrefs } = stubWindowLocation();
    srv = { counts: new Map([['🔥', 12]]), mine: new Set<string>() };
    postMode = '401';
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 12 }] }));
    await click(chip('🔥')!);
    await flush();
    expect(hrefs).toContain(`/register?next=${encodeURIComponent(`/p/${PASTE}`)}`);
    // The optimistic flip is undone even on the 401 path.
    expect(chip('🔥')?.getAttribute('aria-pressed')).toBe('false');
    expect(chip('🔥')?.textContent).toContain('12');
  });
});

describe('ReactionBar — guest behavior (existing redirect convention)', () => {
  it('17. guests see counts; attempting to react redirects to /register with the post preserved', async () => {
    const { hrefs } = stubWindowLocation();
    srv = { counts: new Map([['🔥', 7]]), mine: new Set<string>() };
    await mount(bar({ initialCounts: [{ reaction: '🔥', count: 7 }], guest: true }));
    // Counts stay readable for guests (display data, like the like count).
    expect(chip('🔥')?.textContent).toContain('7');

    // Opening the picker is fine — it is reacting that redirects.
    await openPicker();
    expect(picker()).not.toBeNull();
    await click(option('🔥')!);
    expect(hrefs).toContain(`/register?next=${encodeURIComponent(`/p/${PASTE}`)}`);
    // Guests never fire reaction writes (no silent fail, no optimistic state).
    expect(reactionPosts().length).toBe(0);
    expect(chip('🔥')?.getAttribute('aria-pressed')).toBe('false');

    // Chips are the same flow.
    await click(chip('🔥')!);
    expect(hrefs.length).toBe(2);
    expect(reactionPosts().length).toBe(0);
  });
});

describe('existing post controls and the Admin Broadcast picker keep working', () => {
  it('18. the Like button still works unchanged', async () => {
    await mount(
      createElement(LikeButton, { pasteId: PASTE, initialCount: likeCount, initialLiked: false }),
    );
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Like'),
    )!;
    expect(btn.textContent).toContain('4');
    await click(btn);
    expect(
      fetchMock.mock.calls.some(
        (c) =>
          String(c[0]).includes(`/api/pastes/${PASTE}/like`) &&
          (c[1] as { method?: string } | undefined)?.method === 'POST',
      ),
    ).toBe(true);
    expect(container.textContent).toContain('Liked');
    expect(container.textContent).toContain('5');
  });

  it('19. the Bookmark button still works unchanged', async () => {
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

  it('20. the Admin Broadcast StickerPicker component is unaffected', async () => {
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
  it('reports selection and close without touching the broadcast picker', async () => {
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
          mine: ['🔥'],
          onSelect: (reaction: string) => picked.push(reaction),
          onClose: () => {
            closed += 1;
          },
        }),
      );
    });
    await flush();
    expect(findIn(host, 'button', 'data-reaction-option', '🔥')?.getAttribute('aria-pressed')).toBe('true');
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
