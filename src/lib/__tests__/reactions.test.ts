/**
 * UNIFIED post reaction tests (corrected TODO 1 backend).
 *
 * ONE reaction per user per post — the ❤️ Like is just one value:
 * - database: single-row guarantee (PK), replacement, removal,
 *   multi-user counts, FK cascades
 * - API: guest reads vs 401 mutations, session-only identity, add ❤️,
 *   add an alternative, replace ❤️→🔥→😂→sticker, idempotent re-select,
 *   toggle-off, DELETE removes the current reaction, user isolation,
 *   invalid sticker rejection, missing/expired posts
 * - like compatibility: POST /like selects ❤️ (never a second record),
 *   DELETE /like removes only ❤️, GET /like count === ❤️ count
 *   (reactions + retained anonymous likes), guests get 401
 * - notifications: POST /like keeps the existing LIKE notification
 *   behavior; the reactions API creates none
 *
 * Same harness as the bookmark suite: a throwaway local SQLite database
 * (the libSQL `file:local.db` fallback pointed at a temp dir before the
 * first DB access) seeded by the app's own `seedIfEmpty` (users: demo,
 * nova; sticker pack incl. ':wave:' and ':fire:'). The likes → ❤️
 * migration itself has a dedicated suite (reactionsMigration.test.ts).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-reactions-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.AUTH_SECRET = 'unit-test-secret-0123456789-abcdef0123456789';

// --- In-memory cookie store standing in for the Next request scope --------
const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

import { getDb } from '@/lib/db';
import {
  likes,
  notifications,
  pastes,
  profiles,
  reactions,
  users,
} from '@/lib/db/schema';
import { createSession, hashPassword } from '@/lib/auth';
import {
  HEART_REACTION,
  getReactionCounts,
  getReactionState,
  getUserReaction,
  hasReaction,
  normalizeReactionInput,
  removeReaction,
  resolveReaction,
  setReaction,
  toggleReaction,
} from '@/lib/reactions';
import { likeActor } from '@/lib/likes';
import {
  GET as reactionsGET,
  POST as reactionsPOST,
  DELETE as reactionsDELETE,
} from '@/app/api/pastes/[id]/reactions/route';
import {
  GET as likeGET,
  POST as likePOST,
  DELETE as likeDELETE,
} from '@/app/api/pastes/[id]/like/route';

async function createUser(username: string) {
  const db = await getDb();
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username,
      passwordHash: await hashPassword('password123'),
      createdAt: new Date(),
    })
    .returning();
  await db.insert(profiles).values({ userId: user.id, displayName: username.toUpperCase() });
  return user;
}

async function userByUsername(username: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`fixture user missing: ${username}`);
  return u;
}

let pasteSeq = 0;
async function createPaste(
  ownerId: string | null,
  overrides: Partial<typeof pastes.$inferInsert> = {},
) {
  const db = await getDb();
  pasteSeq += 1;
  const [paste] = await db
    .insert(pastes)
    .values({
      id: `rct-paste-${pasteSeq}`,
      userId: ownerId,
      title: `Reactable ${pasteSeq}`,
      format: 'plain',
      content: 'content',
      language: 'plaintext',
      visibility: 'public',
      createdAt: new Date(),
      ...overrides,
    })
    .returning();
  return paste;
}

async function loginAs(username: string) {
  const u = await userByUsername(username);
  await createSession({ id: u.id, username: u.username });
}

function req(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function rowCount(where: ReturnType<typeof eq> | undefined = undefined): Promise<number> {
  const db = await getDb();
  const q = db.select({ n: sql<number>`count(*)` }).from(reactions);
  const [row] = where ? await q.where(where) : await q;
  return Number(row?.n ?? 0);
}

async function likesCountOf(pasteId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ likesCount: pastes.likesCount })
    .from(pastes)
    .where(eq(pastes.id, pasteId))
    .limit(1);
  return Number(row?.likesCount ?? 0);
}

let demo: { id: string; username: string };
let nova: { id: string; username: string };

beforeAll(async () => {
  await getDb();
  demo = await userByUsername('demo');
  nova = await userByUsername('nova');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ------------------------------------------------------------------
// Validation (pure + sticker-pack backed) — unchanged contract
// ------------------------------------------------------------------
describe('reaction validation', () => {
  it('accepts a single emoji grapheme (incl. ❤️) and canonicalizes sticker tokens', () => {
    expect(normalizeReactionInput('🔥')).toBe('🔥');
    expect(normalizeReactionInput(HEART_REACTION)).toBe('❤️');
    expect(normalizeReactionInput(' 👍 ')).toBe('👍');
    expect(normalizeReactionInput('👍🏽')).toBe('👍🏽'); // skin tone modifier = 1 grapheme
    expect(normalizeReactionInput('🇯🇵')).toBe('🇯🇵'); // flag = 1 grapheme
    expect(normalizeReactionInput(':wave:')).toBe(':wave:');
    expect(normalizeReactionInput(':WAVE:')).toBe(':wave:');
  });

  it('rejects anything that is not one emoji or a sticker token', () => {
    const rejected: unknown[] = [
      '',
      '   ',
      'like',
      'wave',
      '<img src=x onerror=alert(1)>',
      '<b>🔥</b>',
      'https://example.com/x.gif',
      'data:image/png;base64,AAAA',
      '🔥🔥',
      '🔥👍',
      ':wave',
      'wave:',
      ':wave:extra',
      ':' + 'a'.repeat(40) + ':',
      'a'.repeat(64),
      '\u0000',
      null,
      undefined,
      42,
      {},
      ['🔥'],
    ];
    for (const value of rejected) {
      expect(normalizeReactionInput(value)).toBeNull();
    }
  });

  it('only resolves sticker tokens that exist in the pack', async () => {
    expect(await resolveReaction(':wave:')).toBe(':wave:');
    expect(await resolveReaction(':WAVE:')).toBe(':wave:');
    expect(await resolveReaction(':definitely-not-a-sticker:')).toBeNull();
    expect(await resolveReaction('🔥')).toBe('🔥');
  });
});

// ------------------------------------------------------------------
// Unified model — DB level guarantees
// ------------------------------------------------------------------
describe('unified reactions — database model', () => {
  it('stores exactly one reaction row per user per paste', async () => {
    const paste = await createPaste(nova.id);
    expect(await setReaction(demo.id, paste.id, HEART_REACTION)).toMatchObject({
      ok: true,
      active: true,
      created: true,
      previous: null,
      replaced: false,
    });
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);
    expect(await getUserReaction(demo.id, paste.id)).toBe('❤️');
  });

  it('replaces the previous reaction atomically (never two rows)', async () => {
    const paste = await createPaste(nova.id);
    await setReaction(demo.id, paste.id, HEART_REACTION);
    const result = await setReaction(demo.id, paste.id, '🔥');
    expect(result).toMatchObject({ created: false, previous: '❤️', replaced: true });

    // ❤️ → 🔥
    expect(await getUserReaction(demo.id, paste.id)).toBe('🔥');
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);
    expect(await getReactionCounts(paste.id)).toEqual([{ reaction: '🔥', count: 1 }]);

    // 🔥 → sticker
    await setReaction(demo.id, paste.id, ':wave:');
    expect(await getUserReaction(demo.id, paste.id)).toBe(':wave:');
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);

    // The database itself refuses a second row for the same user+paste.
    const db = await getDb();
    await expect(
      db.insert(reactions).values({
        userId: demo.id,
        pasteId: paste.id,
        reaction: '🔥',
        createdAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('removes the current reaction permanently and idempotently', async () => {
    const paste = await createPaste(nova.id);
    await setReaction(demo.id, paste.id, '😂');
    const removed = await removeReaction(demo.id, paste.id);
    expect(removed).toMatchObject({ active: false, removed: true, previous: '😂' });
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);

    const again = await removeReaction(demo.id, paste.id);
    expect(again).toMatchObject({ removed: false, previous: null });
  });

  it('keeps multiple users independent and counts them together', async () => {
    const paste = await createPaste(demo.id);
    const carol = await createUser('reactcarol');
    await setReaction(demo.id, paste.id, HEART_REACTION);
    await setReaction(nova.id, paste.id, HEART_REACTION);
    await setReaction(carol.id, paste.id, '🔥');
    await setReaction(carol.id, paste.id, '👀'); // replaces carol's 🔥

    expect(await getReactionCounts(paste.id)).toEqual([
      { reaction: '❤️', count: 2 },
      { reaction: '👀', count: 1 },
    ]);
    expect(await getUserReaction(carol.id, paste.id)).toBe('👀');

    const state = await getReactionState(paste.id, nova.id);
    expect(state.total).toBe(3);
    expect(state.mine).toBe('❤️');

    // Reactions on one post never leak into another.
    const other = await createPaste(demo.id);
    expect(await getReactionState(other.id, demo.id)).toEqual({
      counts: [],
      total: 0,
      mine: null,
    });
  });

  it('toggles: selecting the current reaction removes it, another replaces it', async () => {
    const paste = await createPaste(nova.id);
    await setReaction(demo.id, paste.id, '🔥');

    const replace = await toggleReaction(demo.id, paste.id, ':wave:');
    expect(replace).toMatchObject({ active: true, removed: false, previous: '🔥' });
    expect(await getUserReaction(demo.id, paste.id)).toBe(':wave:');

    const off = await toggleReaction(demo.id, paste.id, ':wave:');
    expect(off).toMatchObject({ active: false, removed: true, previous: ':wave:' });
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('maintains likes_count as the ❤️ count across every transition', async () => {
    const paste = await createPaste(nova.id);
    expect(await likesCountOf(paste.id)).toBe(0);

    await setReaction(demo.id, paste.id, HEART_REACTION);
    expect(await likesCountOf(paste.id)).toBe(1);

    // ❤️ → 🔥: the user un-liked.
    await setReaction(demo.id, paste.id, '🔥');
    expect(await likesCountOf(paste.id)).toBe(0);

    // 🔥 → ❤️: they liked again.
    await setReaction(demo.id, paste.id, HEART_REACTION);
    expect(await likesCountOf(paste.id)).toBe(1);

    await removeReaction(demo.id, paste.id);
    expect(await likesCountOf(paste.id)).toBe(0);
  });
});

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------
describe('reaction API — authentication', () => {
  it('rejects guest mutations with 401 and writes nothing', async () => {
    cookieJar.clear();
    const paste = await createPaste(nova.id);

    const post = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect(post.status).toBe(401);
    expect((await post.json()).error).toBeTruthy();

    const del = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(del.status).toBe(401);

    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('lets a guest read public counts; mine is null, never another user’s', async () => {
    const paste = await createPaste(nova.id);
    await setReaction(nova.id, paste.id, '🔥');
    await setReaction(demo.id, paste.id, '🔥');

    cookieJar.clear();
    const res = await reactionsGET(req(`/api/pastes/${paste.id}/reactions`), paramsOf(paste.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.mine).toBeNull();
    expect(body.total).toBe(2);
    expect(body.counts).toEqual([{ reaction: '🔥', count: 2 }]);
  });

  it('derives the user from the session and ignores a client-supplied user_id', async () => {
    const paste = await createPaste(nova.id);
    await loginAs('demo');

    const res = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', {
        reaction: '🔥',
        // Spoof attempts — none of these are ever read by the API.
        user_id: nova.id,
        userId: nova.id,
        actor: nova.id,
      }),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).mine).toBe('🔥');

    // The row belongs to the SESSION user, not the spoofed one.
    expect(await hasReaction(demo.id, paste.id, '🔥')).toBe(true);
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(false);
  });
});

// ------------------------------------------------------------------
// The unified select / replace / remove contract
// ------------------------------------------------------------------
describe('reaction API — one reaction per user', () => {
  it('adds ❤️ (the like) and reports the new state', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const res = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: HEART_REACTION }),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reaction).toBe('❤️');
    expect(body.active).toBe(true);
    expect(body.created).toBe(true);
    expect(body.counts).toEqual([{ reaction: '❤️', count: 1 }]);
    expect(body.total).toBe(1);
    expect(body.mine).toBe('❤️');

    const state = await reactionsGET(req(`/api/pastes/${paste.id}/reactions`), paramsOf(paste.id));
    const view = await state.json();
    expect(view.authenticated).toBe(true);
    expect(view.mine).toBe('❤️');
  });

  it('replaces ❤️ with 🔥, 🔥 with 😂, and an emoji with a sticker — never two rows', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const heart = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: HEART_REACTION }),
      paramsOf(paste.id),
    );
    expect((await heart.json()).counts).toEqual([{ reaction: '❤️', count: 1 }]);

    // ❤️ → 🔥
    const fire = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    const fireBody = await fire.json();
    expect(fireBody.replaced ?? fireBody.previous).toBe('❤️');
    expect(fireBody.mine).toBe('🔥');
    expect(fireBody.counts).toEqual([{ reaction: '🔥', count: 1 }]);
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);

    // 🔥 → 😂
    const laugh = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '😂' }),
      paramsOf(paste.id),
    );
    expect((await laugh.json()).counts).toEqual([{ reaction: '😂', count: 1 }]);

    // 😂 → :wave: (canonical sticker token, stored lowercase)
    const wave = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: ':WAVE:' }),
      paramsOf(paste.id),
    );
    const waveBody = await wave.json();
    expect(waveBody.mine).toBe(':wave:');
    expect(waveBody.counts).toEqual([{ reaction: ':wave:', count: 1 }]);

    const db = await getDb();
    const rows = await db
      .select({ reaction: reactions.reaction })
      .from(reactions)
      .where(eq(reactions.pasteId, paste.id));
    expect(rows).toEqual([{ reaction: ':wave:' }]);
    for (const row of rows) {
      expect(row.reaction).not.toMatch(/[<>]/);
      expect(row.reaction).not.toMatch(/https?:/i);
    }
  });

  it('re-selecting the current reaction is an idempotent no-op', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );

    for (let i = 0; i < 3; i++) {
      const dup = await reactionsPOST(
        req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
        paramsOf(paste.id),
      );
      expect(dup.status).toBe(200);
      const body = await dup.json();
      expect(body.active).toBe(true); // still reacted…
      expect(body.created).toBe(false); // …but nothing inserted
      expect(body.previous).toBe('🔥');
      expect(body.counts).toEqual([{ reaction: '🔥', count: 1 }]);
    }
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);
  });

  it('toggle: true removes the current reaction and selects another one', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const on = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: ':wave:', toggle: true }),
      paramsOf(paste.id),
    );
    expect((await on.json()).active).toBe(true);

    // Toggling a DIFFERENT reaction replaces (never stacks).
    const swap = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥', toggle: true }),
      paramsOf(paste.id),
    );
    const swapBody = await swap.json();
    expect(swapBody.active).toBe(true);
    expect(swapBody.mine).toBe('🔥');
    expect(swapBody.counts).toEqual([{ reaction: '🔥', count: 1 }]);

    // Toggling the CURRENT reaction removes it.
    const off = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥', toggle: true }),
      paramsOf(paste.id),
    );
    const offBody = await off.json();
    expect(offBody.active).toBe(false);
    expect(offBody.removed).toBe(true);
    expect(offBody.mine).toBeNull();
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('DELETE removes the user’s current reaction (param tolerated), idempotently', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(1);

    // Without a param.
    const res = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(true);
    expect(body.previous).toBe('🔥');
    expect(body.mine).toBeNull();
    expect(body.counts).toEqual([]);
    expect(body.total).toBe(0);
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);

    // Removing again is a safe no-op (with a legacy-style param too).
    const again = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions?reaction=%F0%9F%94%A5`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(again.status).toBe(200);
    expect((await again.json()).removed).toBe(false);
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('counts reconcile when one user switches (❤️ 24 → ❤️ 23, 🔥 +1)', async () => {
    const paste = await createPaste(nova.id);
    const others = await Promise.all([
      createUser('reactm1'),
      createUser('reactm2'),
      createUser('reactm3'),
    ]);
    await setReaction(demo.id, paste.id, HEART_REACTION);
    for (const u of others) await setReaction(u.id, paste.id, HEART_REACTION);
    expect(await getReactionCounts(paste.id)).toEqual([{ reaction: '❤️', count: 4 }]);

    await setReaction(demo.id, paste.id, '🔥');
    expect(await getReactionCounts(paste.id)).toEqual([
      { reaction: '❤️', count: 3 },
      { reaction: '🔥', count: 1 },
    ]);
  });
});

// ------------------------------------------------------------------
// Invalid values / missing / expired posts
// ------------------------------------------------------------------
describe('reaction API — rejected input', () => {
  it('rejects invalid reaction values with 400 and stores nothing', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const bad: unknown[] = [
      'like',
      '<b>🔥</b>',
      '<img src=x onerror=alert(1)>',
      'https://example.com/fire.gif',
      ':not-a-real-sticker:',
      '🔥🔥',
      '',
      42,
      null,
    ];
    for (const reaction of bad) {
      const res = await reactionsPOST(
        req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction }),
        paramsOf(paste.id),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }

    // Missing body / missing field are rejected the same way.
    const noBody = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST'),
      paramsOf(paste.id),
    );
    expect(noBody.status).toBe(400);
    const noField = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { nope: '🔥' }),
      paramsOf(paste.id),
    );
    expect(noField.status).toBe(400);

    const delBad = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions?reaction=%3Cscript%3E`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(delBad.status).toBe(400);

    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('returns 404 for a missing post and 410 for an expired one', async () => {
    await loginAs('demo');

    for (const call of [
      () =>
        reactionsGET(req('/api/pastes/no-such-paste/reactions'), paramsOf('no-such-paste')),
      () =>
        reactionsPOST(
          req('/api/pastes/no-such-paste/reactions', 'POST', { reaction: '🔥' }),
          paramsOf('no-such-paste'),
        ),
      () =>
        reactionsDELETE(
          req('/api/pastes/no-such-paste/reactions', 'DELETE'),
          paramsOf('no-such-paste'),
        ),
    ]) {
      const res = await call();
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBeTruthy();
    }

    const expired = await createPaste(nova.id, { expiresAt: new Date(Date.now() - 60_000) });
    const post = await reactionsPOST(
      req(`/api/pastes/${expired.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(expired.id),
    );
    expect(post.status).toBe(410);
    const get = await reactionsGET(
      req(`/api/pastes/${expired.id}/reactions`),
      paramsOf(expired.id),
    );
    expect(get.status).toBe(410);
    expect(await rowCount(eq(reactions.pasteId, expired.id))).toBe(0);

    // Removing a reaction from an expired post stays possible (same
    // convention as unlike/unbookmark) so clients can always clean up.
    await setReaction(demo.id, expired.id, '🔥');
    const del = await reactionsDELETE(
      req(`/api/pastes/${expired.id}/reactions`, 'DELETE'),
      paramsOf(expired.id),
    );
    expect(del.status).toBe(200);
    expect((await del.json()).removed).toBe(true);
  });
});

// ------------------------------------------------------------------
// Isolation
// ------------------------------------------------------------------
describe('reaction API — user isolation', () => {
  it('one user cannot remove or overwrite another user’s reaction', async () => {
    const paste = await createPaste(nova.id);
    await setReaction(nova.id, paste.id, '🔥');
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(true);

    await loginAs('demo');
    const res = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(false); // demo had no reaction
    expect(body.mine).toBeNull();
    expect(body.counts).toEqual([{ reaction: '🔥', count: 1 }]); // nova's row survives
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(true);

    // …and the library layer is keyed on the caller too.
    const { removed } = await removeReaction(demo.id, paste.id);
    expect(removed).toBe(false);
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(true);
  });
});

// ------------------------------------------------------------------
// Like compatibility — /like delegates to the unified ❤️ reaction
// ------------------------------------------------------------------
describe('like compatibility endpoint', () => {
  it('POST /like selects the ❤️ reaction and creates no second record', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const res = await likePOST(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.liked).toBe(true);
    expect(body.count).toBe(1);

    // The ONLY record is the ❤️ reaction row.
    expect(await getUserReaction(demo.id, paste.id)).toBe('❤️');
    const db = await getDb();
    const likeRows = await db
      .select({ id: likes.id })
      .from(likes)
      .where(eq(likes.pasteId, paste.id));
    expect(likeRows).toHaveLength(0); // no separate like row, ever
    expect(await likesCountOf(paste.id)).toBe(1);

    // The reactions API and the like API agree.
    const state = await getReactionState(paste.id, demo.id);
    expect(state.mine).toBe('❤️');
    expect(state.counts).toEqual([{ reaction: '❤️', count: 1 }]);
    const get = await likeGET(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    expect(await get.json()).toEqual({ count: 1, liked: true });
  });

  it('POST /like replaces the user’s current reaction with ❤️', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    await setReaction(demo.id, paste.id, '🔥');

    const res = await likePOST(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    const body = await res.json();
    expect(body.liked).toBe(true);
    expect(body.count).toBe(1);
    expect(await getUserReaction(demo.id, paste.id)).toBe('❤️');
    expect(await getReactionCounts(paste.id)).toEqual([{ reaction: '❤️', count: 1 }]);
  });

  it('repeated POST /like is idempotent', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    for (let i = 0; i < 3; i++) {
      const res = await likePOST(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
      expect(res.status).toBe(200);
    }
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);
    expect(await likesCountOf(paste.id)).toBe(1);
  });

  it('DELETE /like removes ❤️ — and only ❤️', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    await likePOST(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));

    const res = await likeDELETE(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 0, liked: false });
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);

    // Unlike never touches a non-❤️ reaction.
    await setReaction(demo.id, paste.id, '🔥');
    const keep = await likeDELETE(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    expect((await keep.json()).liked).toBe(false);
    expect(await getUserReaction(demo.id, paste.id)).toBe('🔥');
  });

  it('guests: GET works (read-only, legacy ip like still reported), mutations are 401', async () => {
    const paste = await createPaste(nova.id);
    await setReaction(demo.id, paste.id, HEART_REACTION);

    cookieJar.clear();
    // The mocked headers() is empty, so getClientIp() resolves to the
    // '0.0.0.0' fallback — hash THAT, exactly like the route will.
    const ip = '0.0.0.0';
    const actor = likeActor(undefined, ip);
    // A pre-unification anonymous like by this visitor.
    const db = await getDb();
    await db.insert(likes).values({
      id: randomUUID(),
      pasteId: paste.id,
      userId: null,
      ipHash: actor.ipHash ?? null,
      createdAt: new Date(),
    });

    // GET with that visitor's IP: liked (legacy row) and the unified count
    // (❤️ reaction + retained anonymous like) — never two truths.
    const get = new Request(`http://localhost/api/pastes/${paste.id}/like`);
    const state = await likeGET(get, paramsOf(paste.id));
    expect(await state.json()).toEqual({ count: 2, liked: true });
    expect(await getReactionCounts(paste.id)).toEqual([{ reaction: '❤️', count: 2 }]);

    const post = await likePOST(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    expect(post.status).toBe(401);
    const del = await likeDELETE(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    expect(del.status).toBe(401);
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(1); // only demo's ❤️
  });
});

// ------------------------------------------------------------------
// Notifications — existing LIKE behavior preserved, none added
// ------------------------------------------------------------------
describe('reactions and like notifications', () => {
  it('POST /like still notifies the owner exactly once (existing behavior)', async () => {
    const paste = await createPaste(nova.id);
    await loginAs('demo');
    for (let i = 0; i < 2; i++) {
      await likePOST(req(`/api/pastes/${paste.id}/like`), paramsOf(paste.id));
    }
    const db = await getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.pasteId, paste.id), eq(notifications.type, 'LIKE')));
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(nova.id);
    expect(rows[0].actorUserId).toBe(demo.id);
  });

  it('the reactions API creates NO notifications (TODO 3 is out of scope)', async () => {
    const paste = await createPaste(nova.id);
    await loginAs('demo');
    await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: HEART_REACTION }),
      paramsOf(paste.id),
    );
    await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE'),
      paramsOf(paste.id),
    );
    const db = await getDb();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.pasteId, paste.id));
    expect(rows).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// Cascades
// ------------------------------------------------------------------
describe('reaction cascades', () => {
  it('removes reactions when the paste is deleted', async () => {
    const db = await getDb();
    const doomed = await createPaste(nova.id);
    await setReaction(demo.id, doomed.id, '🔥');
    await setReaction(nova.id, doomed.id, ':wave:');
    expect(await rowCount(eq(reactions.pasteId, doomed.id))).toBe(2);

    await db.delete(pastes).where(eq(pastes.id, doomed.id));
    expect(await rowCount(eq(reactions.pasteId, doomed.id))).toBe(0);
  });

  it('removes a user’s reaction when the user is deleted', async () => {
    const db = await getDb();
    const temp = await createUser('reacttemp');
    const target = await createPaste(nova.id, { title: 'Survivor' });
    await setReaction(temp.id, target.id, '🔥');
    expect(await rowCount(eq(reactions.userId, temp.id))).toBe(1);

    await db.delete(users).where(eq(users.id, temp.id));
    expect(await rowCount(eq(reactions.userId, temp.id))).toBe(0);
    const [stillThere] = await db.select().from(pastes).where(eq(pastes.id, target.id)).limit(1);
    expect(stillThere.title).toBe('Survivor');
  });
});
