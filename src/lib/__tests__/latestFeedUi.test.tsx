// @vitest-environment jsdom
/**
 * Latest feed UI — loading, empty, error, post cards, and the existing
 * unified reaction + bookmark controls on feed cards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      React.createElement('a', { href: props.href, className: props.className }, props.children as React.ReactNode),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/latest',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import LatestFeed from '@/components/LatestFeed';
import PasteCard from '@/components/PasteCard';
import type { LatestPasteCard } from '@/lib/feed';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, json: async () => body } as Response;
}

function makeRow(overrides: Partial<LatestPasteCard> = {}): LatestPasteCard {
  return {
    id: 'feed1',
    title: 'Hello feed',
    titleColor: null,
    language: 'javascript',
    views: 4,
    likesCount: 1,
    createdAt: Date.now(),
    expiresAt: null,
    pinned: false,
    preview: 'console.log("hi")',
    author: { username: 'nova', displayName: 'Nova', avatarUrl: null },
    reactionCounts: [{ reaction: '❤️', count: 2 }],
    mineReaction: null,
    bookmarked: false,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/api/stickers')) return jsonResponse({ stickers: [] });
    if (url.includes('/api/pastes/') && url.includes('/reactions')) {
      return jsonResponse({ counts: [{ reaction: '❤️', count: 2 }], mine: null, total: 2 });
    }
    if (url.includes('/api/pastes/') && url.includes('/bookmark')) {
      return jsonResponse({ ok: true, bookmarked: true, created: true });
    }
    return jsonResponse({ pastes: [], nextCursor: null, hasMore: false });
  });
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

describe('LatestFeed UI', () => {
  it('renders posts from the initial page', async () => {
    const row = makeRow();
    await mount(
      createElement(LatestFeed, {
        initial: { pastes: [row], nextCursor: null, hasMore: false },
        guest: true,
      }),
    );
    expect(container.textContent).toContain('Hello feed');
    expect(container.textContent).toContain('Nova');
    expect(container.textContent).toContain('console.log("hi")');
    expect(container.querySelector('[data-paste-card="feed1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/p/feed1"]')).not.toBeNull();
  });

  it('shows the empty state when there are no posts', async () => {
    await mount(
      createElement(LatestFeed, {
        initial: { pastes: [], nextCursor: null, hasMore: false },
      }),
    );
    expect(container.textContent).toContain('No posts yet');
    expect(container.querySelector('a[href="/paste"]')).not.toBeNull();
  });

  it('shows an error state with retry when the feed request fails', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/api/pastes/latest')) {
        return jsonResponse({ error: 'nope' }, { ok: false, status: 500 });
      }
      return jsonResponse({});
    });
    await mount(createElement(LatestFeed, {}));
    expect(container.textContent).toContain("Couldn't load latest posts");
    const retry = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try again'),
    );
    expect(retry).not.toBeNull();

    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/api/pastes/latest')) {
        return jsonResponse({ pastes: [makeRow({ title: 'Recovered' })], nextCursor: null, hasMore: false });
      }
      if (url.includes('/api/stickers')) return jsonResponse({ stickers: [] });
      if (url.includes('/reactions')) return jsonResponse({ counts: [], mine: null, total: 0 });
      return jsonResponse({});
    });
    await act(async () => {
      retry!.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await flush();
    expect(container.textContent).toContain('Recovered');
  });

  it('load-more does not introduce duplicate posts', async () => {
    const first = makeRow({ id: 'a', title: 'First', createdAt: 200 });
    const second = makeRow({ id: 'b', title: 'Second', createdAt: 100 });
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes('/api/pastes/latest') && url.includes('cursor=')) {
        return jsonResponse({ pastes: [second, first], nextCursor: null, hasMore: false });
      }
      if (url.includes('/api/stickers')) return jsonResponse({ stickers: [] });
      if (url.includes('/reactions')) return jsonResponse({ counts: [], mine: null, total: 0 });
      return jsonResponse({});
    });
    await mount(
      createElement(LatestFeed, {
        initial: { pastes: [first], nextCursor: '200_a', hasMore: true },
      }),
    );
    const loadMore = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load more'),
    )!;
    await act(async () => {
      loadMore.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    const cards = container.querySelectorAll('[data-paste-card]');
    const ids = Array.from(cards).map((el) => el.getAttribute('data-paste-card'));
    expect(ids).toEqual(['a', 'b']);
    expect(ids.filter((id) => id === 'a')).toHaveLength(1);
  });
});

describe('feed cards keep the unified reaction + bookmark UI', () => {
  it('renders ReactionBar and BookmarkButton, not a separate Like button', async () => {
    await mount(
      createElement(PasteCard, {
        interactive: true,
        paste: {
          id: 'card1',
          title: 'Card title',
          titleColor: null,
          language: 'python',
          views: 3,
          createdAt: new Date('2024-02-02T00:00:00Z'),
          preview: 'print("ok")',
          author: { username: 'demo', displayName: 'Demo User', avatarUrl: null },
          reactionCounts: [{ reaction: '❤️', count: 2 }],
          mineReaction: null,
          bookmarked: false,
          guest: false,
        },
      }),
    );
    expect(container.querySelector('button[data-current-reaction]')).not.toBeNull();
    expect(container.textContent).toContain('Save');
    const likeButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => /like/i.test(b.textContent ?? '') || /like/i.test(b.getAttribute('aria-label') ?? ''),
    );
    expect(likeButtons).toEqual([]);
    // Buttons must not be nested inside the title link.
    const titleLink = container.querySelector('a[href="/p/card1"]');
    expect(titleLink).not.toBeNull();
    expect(titleLink!.querySelector('button')).toBeNull();
  });

  it('bookmark control still POSTs to the existing bookmark API', async () => {
    await mount(
      createElement(PasteCard, {
        interactive: true,
        paste: {
          id: 'card2',
          title: 'Save me',
          titleColor: null,
          language: 'plaintext',
          views: 0,
          createdAt: new Date(),
          preview: 'text',
          bookmarked: false,
          guest: false,
        },
      }),
    );
    const save = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Save'))!;
    await act(async () => {
      save.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();
    expect(
      fetchMock.mock.calls.some(
        (c) => String(c[0]).includes('/api/pastes/card2/bookmark') && (c[1] as { method?: string })?.method === 'POST',
      ),
    ).toBe(true);
  });
});
