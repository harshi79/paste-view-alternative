/**
 * Seed / bootstrap resurrection tests (audit TASK #4).
 *
 * Bug under test: admin-deleted seeded stickers/tags used to be resurrected
 * on the next server/database restart, because the bootstrap logic re-inserted
 * EVERY seed row on every boot (the unique token/label could not conflict with
 * an already-deleted row, so it came back with a fresh id).
 *
 * Fix: an explicit initialization marker (`app_meta` row `seed:initialized`)
 * records that first-install seed data was already applied. After that, a
 * restart is a no-op for seeding — admin deletions are permanent.
 *
 * These tests run against a throwaway local SQLite database (the libSQL
 * fallback `file:local.db`, pointed at a temp dir before the first DB access).
 * `getDb()` performs the genuine first boot (boot 1). Subsequent "boots" are
 * simulated by calling the app's own `seedIfEmpty` directly against the same
 * already-initialized handle — exactly what a restart would do against the
 * persisted database file.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Point the local fallback database at a throwaway dir and keep any
// remote-database env vars from leaking into the suite. Must run before the
// first getDb() call.
const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-seed-test-'));
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

import { eq, sql } from 'drizzle-orm';
import { getDb, type DB } from '@/lib/db';
import { seedIfEmpty } from '@/lib/db/seed';
import { stickers, tags, appMeta } from '@/lib/db/schema';
import { createAdminSession } from '@/lib/auth';
import {
  POST as createTag,
  GET as listTags,
  PATCH as patchTag,
  DELETE as deleteTag,
} from '@/app/api/admin/tags/route';
import {
  POST as createSticker,
  DELETE as deleteSticker,
} from '@/app/api/admin/stickers/route';

const SEED_STICKER_TOKENS = [
  ':wave:',
  ':fire:',
  ':rocket:',
  ':sparkles:',
  ':100:',
  ':ok:',
  ':tada:',
  ':bug:',
  ':heart:',
  ':anime-hug:',
  ':anime-kiss:',
  ':anime-pat:',
  ':anime-blush:',
  ':anime-cry:',
  ':anime-wink:',
  ':anime-happy:',
  ':anime-dance:',
  ':anime-cuddle:',
  ':anime-wave:',
];
const SEED_TAG_LABELS = ['Founder', 'Verified', 'OG', 'Bug Hunter', 'Top 100'];

let db: DB;

beforeAll(async () => {
  // Genuine first boot against a brand-new database.
  db = await getDb();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function countStickers(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(stickers);
  return Number(rows[0]?.n ?? 0);
}
async function countTags(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(tags);
  return Number(rows[0]?.n ?? 0);
}
async function stickerByToken(token: string) {
  const [row] = await db
    .select()
    .from(stickers)
    .where(eq(stickers.token, token))
    .limit(1);
  return row ?? null;
}
async function tagByLabel(label: string) {
  const [row] = await db.select().from(tags).where(eq(tags.label, label)).limit(1);
  return row ?? null;
}
async function seedStickerCount(): Promise<number> {
  let n = 0;
  for (const t of SEED_STICKER_TOKENS) if (await stickerByToken(t)) n++;
  return n;
}
async function seedTagCount(): Promise<number> {
  let n = 0;
  for (const l of SEED_TAG_LABELS) if (await tagByLabel(l)) n++;
  return n;
}

describe('fresh database first install', () => {
  it('seed stickers appear on a fresh database', async () => {
    expect(await countStickers()).toBe(SEED_STICKER_TOKENS.length);
    for (const t of SEED_STICKER_TOKENS) {
      expect(await stickerByToken(t)).not.toBeNull();
    }
  });

  it('seed tags appear on a fresh database', async () => {
    expect(await countTags()).toBe(SEED_TAG_LABELS.length);
    for (const l of SEED_TAG_LABELS) {
      expect(await tagByLabel(l)).not.toBeNull();
    }
  });

  it('records the initialization marker after the first boot', async () => {
    const [row] = await db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, 'seed:initialized'))
      .limit(1);
    expect(row).not.toBeUndefined();
    expect(row?.value).toBe('1');
  });
});

describe('existing seed rows survive a restart', () => {
  it('an existing seed sticker remains after bootstrap again', async () => {
    expect(await stickerByToken(':wave:')).not.toBeNull();
    await seedIfEmpty(db); // boot 2
    expect(await stickerByToken(':wave:')).not.toBeNull();
  });

  it('an existing seed tag remains after bootstrap again', async () => {
    expect(await tagByLabel('Founder')).not.toBeNull();
    await seedIfEmpty(db); // boot 3
    expect(await tagByLabel('Founder')).not.toBeNull();
  });
});

describe('deleted seed rows stay deleted after a restart', () => {
  it('deleting one seeded sticker keeps it deleted across bootstrap', async () => {
    const target = await stickerByToken(':fire:');
    expect(target).not.toBeNull();
    await db.delete(stickers).where(eq(stickers.id, target!.id));

    await seedIfEmpty(db); // boot after deletion

    expect(await stickerByToken(':fire:')).toBeNull();
    // Every other seed sticker is untouched.
    expect(await seedStickerCount()).toBe(SEED_STICKER_TOKENS.length - 1);
  });

  it('deleting one seeded tag keeps it deleted across bootstrap', async () => {
    const target = await tagByLabel('Verified');
    expect(target).not.toBeNull();
    await db.delete(tags).where(eq(tags.id, target!.id));

    await seedIfEmpty(db); // boot after deletion

    expect(await tagByLabel('Verified')).toBeNull();
    expect(await seedTagCount()).toBe(SEED_TAG_LABELS.length - 1);
  });

  it('deleting ALL seeded stickers keeps them deleted across bootstrap', async () => {
    // Remove every remaining seed sticker.
    for (const t of SEED_STICKER_TOKENS) {
      const row = await stickerByToken(t);
      if (row) await db.delete(stickers).where(eq(stickers.id, row.id));
    }
    expect(await seedStickerCount()).toBe(0);

    await seedIfEmpty(db); // boot after deletion

    expect(await seedStickerCount()).toBe(0);
  });

  it('deleting ALL seeded tags keeps them deleted across bootstrap', async () => {
    for (const l of SEED_TAG_LABELS) {
      const row = await tagByLabel(l);
      if (row) await db.delete(tags).where(eq(tags.id, row.id));
    }
    expect(await seedTagCount()).toBe(0);

    await seedIfEmpty(db); // boot after deletion

    expect(await seedTagCount()).toBe(0);
  });
});

describe('custom data is preserved', () => {
  it('a custom sticker added by an admin survives repeated bootstrap calls', async () => {
    const customToken = ':custom-unit-test:';
    await db.insert(stickers).values({
      id: 'custom-sticker-id',
      token: customToken,
      url: 'https://example.com/custom.png',
      emoji: null,
      label: 'Custom',
      createdAt: new Date(),
    });

    for (let i = 0; i < 3; i++) await seedIfEmpty(db); // several boots

    const row = await stickerByToken(customToken);
    expect(row).not.toBeNull();
    expect(row?.id).toBe('custom-sticker-id');
    // No seed sticker was resurrected by the boots either.
    expect(await seedStickerCount()).toBe(0);
  });

  it('a custom tag added by an admin survives repeated bootstrap calls', async () => {
    await db.insert(tags).values({
      id: 'custom-tag-id',
      label: 'CustomTag',
      color: '#123456',
      effect: 'neon',
      createdAt: new Date(),
    });

    for (let i = 0; i < 3; i++) await seedIfEmpty(db); // several boots

    const row = await tagByLabel('CustomTag');
    expect(row).not.toBeNull();
    expect(row?.id).toBe('custom-tag-id');
    expect(await seedTagCount()).toBe(0);
  });
});

describe('no duplicate rows across repeated bootstrap calls', () => {
  it('repeated bootstrap calls do not create extra rows', async () => {
    const beforeStickers = await countStickers();
    const beforeTags = await countTags();

    for (let i = 0; i < 5; i++) await seedIfEmpty(db);

    expect(await countStickers()).toBe(beforeStickers);
    expect(await countTags()).toBe(beforeTags);
  });
});

describe('existing admin CRUD still works after the fix', () => {
  it('admin can create, update, and delete a tag', async () => {
    cookieJar.clear();
    await createAdminSession();
    expect(cookieJar.has('vb_admin')).toBe(true);

    // Create
    const created = await createTag(
      new Request('http://localhost/api/admin/tags', {
        method: 'POST',
        body: JSON.stringify({ label: 'CRUDTest', color: '#abcdef', effect: 'gold' }),
      }),
    );
    expect(created.status).toBe(200);
    const createdJson = (await created.json()) as { tag: { id: string; label: string; color: string } };
    expect(createdJson.tag.label).toBe('CRUDTest');

    // Update (PATCH)
    const patched = await patchTag(
      new Request('http://localhost/api/admin/tags', {
        method: 'PATCH',
        body: JSON.stringify({ id: createdJson.tag.id, color: '#ffffff' }),
      }),
    );
    expect(patched.status).toBe(200);
    const patchedJson = (await patched.json()) as { tag: { color: string } };
    expect(patchedJson.tag.color).toBe('#ffffff');

    // List shows it
    const listed = await listTags();
    const listedJson = (await listed.json()) as { tags: { label: string }[] };
    expect(listedJson.tags.some((t) => t.label === 'CRUDTest')).toBe(true);

    // Delete
    const deleted = await deleteTag(
      new Request(`http://localhost/api/admin/tags?id=${createdJson.tag.id}`, {
        method: 'DELETE',
      }),
    );
    expect(deleted.status).toBe(200);
    expect(await tagByLabel('CRUDTest')).toBeNull();
  });

  it('admin can create and delete a sticker', async () => {
    cookieJar.clear();
    await createAdminSession();

    const created = await createSticker(
      new Request('http://localhost/api/admin/stickers', {
        method: 'POST',
        body: JSON.stringify({
          token: ':crud-sticker:',
          url: 'https://example.com/x.png',
          label: 'CRUD Sticker',
        }),
      }),
    );
    expect(created.status).toBe(200);
    expect(await stickerByToken(':crud-sticker:')).not.toBeNull();

    const [row] = await db
      .select()
      .from(stickers)
      .where(eq(stickers.token, ':crud-sticker:'))
      .limit(1);
    const deleted = await deleteSticker(
      new Request(`http://localhost/api/admin/stickers?id=${row!.id}`, {
        method: 'DELETE',
      }),
    );
    expect(deleted.status).toBe(200);
    expect(await stickerByToken(':crud-sticker:')).toBeNull();
  });
});
