/**
 * Post reaction tests (backend foundation).
 *
 * Covers the reaction DB + API contract:
 * - guests cannot add / remove reactions (401); guest GET still returns
 *   public counts with an empty `mine`
 * - the acting user id comes from the SESSION only — a client-supplied
 *   user_id in the body is ignored
 * - add / remove a reaction (remove is permanent and idempotent)
 * - duplicate prevention: the same reaction twice never creates a second
 *   row (API level and DB level)
 * - multiple DIFFERENT reactions by one user on one post coexist
 * - invalid reaction values are rejected server-side (400) and nothing is
 *   written: plain text, HTML, URLs, unknown sticker tokens, several
 *   emoji, empty/missing/non-string values, over-long input
 * - sticker reactions are stored as their existing canonical token
 *   (':wave:'), never rendered HTML
 * - missing post → 404, expired post → 410
 * - user isolation: one user can never remove another user's reaction
 * - counts are correct and grouped per reaction
 * - FK cascades clean reactions up with the paste or the user
 *
 * Same harness as the bookmark suite: a throwaway local SQLite database
 * (the libSQL `file:local.db` fallback pointed at a temp dir before the
 * first DB access) seeded by the app's own `seedIfEmpty` (users: demo,
 * nova; sticker pack incl. ':wave:' and ':fire:').
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
import { pastes, profiles, reactions, users } from '@/lib/db/schema';
import { createSession, hashPassword } from '@/lib/auth';
import {
  MAX_REACTIONS_PER_USER_PER_PASTE,
  addReaction,
  getReactionCounts,
  getReactionState,
  getUserReactions,
  hasReaction,
  normalizeReactionInput,
  removeReaction,
  resolveReaction,
} from '@/lib/reactions';
import {
  GET as reactionsGET,
  POST as reactionsPOST,
  DELETE as reactionsDELETE,
} from '@/app/api/pastes/[id]/reactions/route';

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
// Validation (pure + sticker-pack backed)
// ------------------------------------------------------------------
describe('reaction validation', () => {
  it('accepts a single emoji grapheme and canonicalizes sticker tokens', () => {
    expect(normalizeReactionInput('🔥')).toBe('🔥');
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
      req(`/api/pastes/${paste.id}/reactions?reaction=%F0%9F%94%A5`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(del.status).toBe(401);

    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('lets a guest read public counts but never another user’s selections', async () => {
    const paste = await createPaste(nova.id);
    await addReaction(nova.id, paste.id, '🔥');
    await addReaction(demo.id, paste.id, '🔥');
    await addReaction(demo.id, paste.id, ':wave:');

    cookieJar.clear();
    const res = await reactionsGET(req(`/api/pastes/${paste.id}/reactions`), paramsOf(paste.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
    expect(body.mine).toEqual([]);
    expect(body.total).toBe(3);
    expect(body.counts).toEqual([
      { reaction: '🔥', count: 2 },
      { reaction: ':wave:', count: 1 },
    ]);
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
    expect((await res.json()).mine).toEqual(['🔥']);

    // The row belongs to the SESSION user, not the spoofed one.
    expect(await hasReaction(demo.id, paste.id, '🔥')).toBe(true);
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(false);
  });
});

// ------------------------------------------------------------------
// Add / remove / duplicates / multiple
// ------------------------------------------------------------------
describe('reaction API — add and remove', () => {
  it('adds a reaction and reports the new state', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const res = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reaction).toBe('🔥');
    expect(body.active).toBe(true);
    expect(body.created).toBe(true);
    expect(body.counts).toEqual([{ reaction: '🔥', count: 1 }]);
    expect(body.total).toBe(1);
    expect(body.mine).toEqual(['🔥']);

    const state = await reactionsGET(req(`/api/pastes/${paste.id}/reactions`), paramsOf(paste.id));
    const view = await state.json();
    expect(view.authenticated).toBe(true);
    expect(view.mine).toEqual(['🔥']);
  });

  it('removes a reaction permanently and idempotently', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(1);

    const res = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(true);
    expect(body.active).toBe(false);
    expect(body.mine).toEqual([]);
    expect(body.counts).toEqual([]);
    expect(body.total).toBe(0);
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);

    // Removing it again is a safe no-op.
    const again = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions?reaction=%F0%9F%94%A5`, 'DELETE'),
      paramsOf(paste.id),
    );
    expect(again.status).toBe(200);
    expect((await again.json()).removed).toBe(false);
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('toggles a reaction off and on with toggle: true', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    const on = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: ':wave:', toggle: true }),
      paramsOf(paste.id),
    );
    expect((await on.json()).active).toBe(true);

    const off = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: ':wave:', toggle: true }),
      paramsOf(paste.id),
    );
    const offBody = await off.json();
    expect(offBody.active).toBe(false);
    expect(offBody.removed).toBe(true);
    expect(offBody.mine).toEqual([]);
    expect(await rowCount(eq(reactions.pasteId, paste.id))).toBe(0);
  });

  it('never creates duplicate rows for the same reaction', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const first = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect((await first.json()).created).toBe(true);

    for (let i = 0; i < 3; i++) {
      const dup = await reactionsPOST(
        req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🔥' }),
        paramsOf(paste.id),
      );
      expect(dup.status).toBe(200);
      const body = await dup.json();
      expect(body.active).toBe(true); // still reacted…
      expect(body.created).toBe(false); // …but nothing inserted
      expect(body.counts).toEqual([{ reaction: '🔥', count: 1 }]);
    }

    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(1);

    // Library level too, and casing cannot smuggle a duplicate in.
    expect((await addReaction(demo.id, paste.id, '🔥')).ok).toBe(true);
    const canonical = await resolveReaction(':WAVE:');
    await addReaction(demo.id, paste.id, canonical!);
    await addReaction(demo.id, paste.id, canonical!);
    expect(await getUserReactions(demo.id, paste.id)).toEqual(['🔥', ':wave:']);

    // The DB itself refuses a duplicate insert (composite primary key).
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

  it('lets one user hold several different reactions on one post', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    for (const reaction of ['🔥', '👍', ':wave:', ':fire:']) {
      const res = await reactionsPOST(
        req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction }),
        paramsOf(paste.id),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).created).toBe(true);
    }
    const mine = await getUserReactions(demo.id, paste.id);
    expect(mine.sort()).toEqual(['fire', 'wave'].map((t) => `:${t}:`).concat(['👍', '🔥']).sort());
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, demo.id))),
    ).toBe(4);

    // Removing one leaves the others intact.
    await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE', { reaction: '👍' }),
      paramsOf(paste.id),
    );
    const left = await getUserReactions(demo.id, paste.id);
    expect(left).not.toContain('👍');
    expect(left).toContain('🔥');
    expect(left).toContain(':wave:');
    expect(left).toContain(':fire:');
  });

  it('caps how many different reactions one user may hold on one post', async () => {
    const spammer = await createUser('reactspam');
    const paste = await createPaste(nova.id);
    const pool = [
      '🔥','👍','👎','😀','😎','🥳','🤩','😇','🤠','🫡',
      '😴','⚡','✨','🌟','💫','🌈','🌊','🙌','👀','💪',
    ];
    expect(pool).toHaveLength(MAX_REACTIONS_PER_USER_PER_PASTE);
    for (const reaction of pool) {
      expect((await addReaction(spammer.id, paste.id, reaction)).ok).toBe(true);
    }
    const overflow = await addReaction(spammer.id, paste.id, '🫶');
    expect(overflow).toEqual({ ok: false, reason: 'limit' });

    await createSession({ id: spammer.id, username: spammer.username });
    const res = await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: '🤝' }),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(409);
    expect(
      await rowCount(and(eq(reactions.pasteId, paste.id), eq(reactions.userId, spammer.id))),
    ).toBe(MAX_REACTIONS_PER_USER_PER_PASTE);
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

  it('stores sticker reactions as the canonical token, never rendered HTML', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);
    await reactionsPOST(
      req(`/api/pastes/${paste.id}/reactions`, 'POST', { reaction: ':WAVE:' }),
      paramsOf(paste.id),
    );

    const db = await getDb();
    const rows = await db
      .select({ reaction: reactions.reaction })
      .from(reactions)
      .where(eq(reactions.pasteId, paste.id));
    expect(rows.map((r) => r.reaction)).toEqual([':wave:']);
    for (const row of rows) {
      expect(row.reaction).not.toMatch(/[<>]/);
      expect(row.reaction).not.toMatch(/https?:/i);
    }
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
          req('/api/pastes/no-such-paste/reactions?reaction=%F0%9F%94%A5', 'DELETE'),
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
    await addReaction(demo.id, expired.id, '🔥');
    const del = await reactionsDELETE(
      req(`/api/pastes/${expired.id}/reactions`, 'DELETE', { reaction: '🔥' }),
      paramsOf(expired.id),
    );
    expect(del.status).toBe(200);
    expect((await del.json()).removed).toBe(true);
  });
});

// ------------------------------------------------------------------
// Isolation + counts
// ------------------------------------------------------------------
describe('reaction API — user isolation and counts', () => {
  it('one user cannot remove another user’s reaction', async () => {
    const paste = await createPaste(nova.id);
    await addReaction(nova.id, paste.id, '🔥');
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(true);

    await loginAs('demo');
    const res = await reactionsDELETE(
      req(`/api/pastes/${paste.id}/reactions`, 'DELETE', { reaction: '🔥' }),
      paramsOf(paste.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(false); // demo had no such reaction
    expect(body.mine).toEqual([]);
    expect(body.counts).toEqual([{ reaction: '🔥', count: 1 }]); // nova's row survives
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(true);

    // …and the library layer is keyed on the caller too.
    const { removed } = await removeReaction(demo.id, paste.id, '🔥');
    expect(removed).toBe(false);
    expect(await hasReaction(nova.id, paste.id, '🔥')).toBe(true);
  });

  it('counts aggregate every user, `mine` stays per-user', async () => {
    const paste = await createPaste(demo.id);
    const carol = await createUser('reactcarol');

    await addReaction(demo.id, paste.id, '🔥');
    await addReaction(nova.id, paste.id, '🔥');
    await addReaction(carol.id, paste.id, '🔥');
    await addReaction(nova.id, paste.id, ':wave:');
    await addReaction(carol.id, paste.id, ':wave:');
    await addReaction(carol.id, paste.id, '👍');

    expect(await getReactionCounts(paste.id)).toEqual([
      { reaction: '🔥', count: 3 },
      { reaction: ':wave:', count: 2 },
      { reaction: '👍', count: 1 },
    ]);

    await loginAs('nova');
    const res = await reactionsGET(req(`/api/pastes/${paste.id}/reactions`), paramsOf(paste.id));
    const body = await res.json();
    expect(body.total).toBe(6);
    expect(body.mine.sort()).toEqual([':wave:', '🔥'].sort());

    await loginAs('demo');
    const demoView = await reactionsGET(
      req(`/api/pastes/${paste.id}/reactions`),
      paramsOf(paste.id),
    );
    expect((await demoView.json()).mine).toEqual(['🔥']);

    // Counts drop by exactly one when a single user withdraws.
    await removeReaction(carol.id, paste.id, '🔥');
    const after = await getReactionState(paste.id, carol.id);
    expect(after.counts).toEqual(
      expect.arrayContaining([
        { reaction: '🔥', count: 2 },
        { reaction: ':wave:', count: 2 },
        { reaction: '👍', count: 1 },
      ]),
    );
    expect(after.total).toBe(5);
    expect(after.mine.sort()).toEqual([':wave:', '👍'].sort());

    // Reactions on one post never leak into another.
    const other = await createPaste(demo.id);
    expect(await getReactionCounts(other.id)).toEqual([]);
    expect(await getReactionState(other.id, demo.id)).toEqual({
      counts: [],
      total: 0,
      mine: [],
    });
  });
});

// ------------------------------------------------------------------
// Cascades
// ------------------------------------------------------------------
describe('reaction cascades', () => {
  it('removes reactions when the paste is deleted', async () => {
    const db = await getDb();
    const doomed = await createPaste(nova.id);
    await addReaction(demo.id, doomed.id, '🔥');
    await addReaction(nova.id, doomed.id, ':wave:');
    expect(await rowCount(eq(reactions.pasteId, doomed.id))).toBe(2);

    await db.delete(pastes).where(eq(pastes.id, doomed.id));
    expect(await rowCount(eq(reactions.pasteId, doomed.id))).toBe(0);
  });

  it('removes a user’s reactions when the user is deleted', async () => {
    const db = await getDb();
    const temp = await createUser('reacttemp');
    const target = await createPaste(nova.id, { title: 'Survivor' });
    await addReaction(temp.id, target.id, '🔥');
    expect(await rowCount(eq(reactions.userId, temp.id))).toBe(1);

    await db.delete(users).where(eq(users.id, temp.id));
    expect(await rowCount(eq(reactions.userId, temp.id))).toBe(0);
    const [stillThere] = await db.select().from(pastes).where(eq(pastes.id, target.id)).limit(1);
    expect(stillThere.title).toBe('Survivor');
  });
});
