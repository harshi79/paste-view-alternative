import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import {
  firstAvailableStickerToken,
  isTrustedGiphyGifUrl,
  isTrustedNekoGifUrl,
  persistImportedSticker,
  stickerTokenCandidate,
  stickerTokenStem,
} from '@/lib/stickerImport';
import { buildInlineMarks, isRichDoc, parsePasteContent, type RichDoc } from '@/lib/pasteFormat';

const client = createClient({ url: 'file::memory:' });
const db = drizzle(client, { schema });

beforeEach(async () => {
  await db.run(sql`DROP TABLE IF EXISTS stickers`);
  await db.run(sql`CREATE TABLE stickers (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    url TEXT,
    emoji TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
});

describe('persistent searched GIF import', () => {
  it('generates relevant valid tokens and deterministic collision suffixes', () => {
    expect(stickerTokenStem('Naruto Hug GIF by Anime Studio')).toBe('naruto-hug');
    expect(stickerTokenCandidate('naruto-hug', 1)).toBe(':naruto-hug:');
    expect(stickerTokenCandidate('naruto-hug', 2)).toBe(':naruto-hug-2:');
    expect(firstAvailableStickerToken('Naruto Hug GIF', new Set([':naruto-hug:', ':naruto-hug-2:'])))
      .toBe(':naruto-hug-3:');
    expect(/^:[a-z0-9_+-]{1,32}:$/.test(stickerTokenCandidate('x'.repeat(80), 200))).toBe(true);
  });

  it('adds a provider GIF permanently and reuses the same asset without duplicates', async () => {
    const asset = {
      url: 'https://media.giphy.com/media/abc/giphy.gif',
      label: 'Naruto Hug GIF',
      emoji: null,
      fallbackStem: 'giphy-abc',
    };
    const first = await persistImportedSticker(db, asset);
    const second = await persistImportedSticker(db, asset);
    expect(first.existing).toBe(false);
    expect(first.sticker.token).toBe(':naruto-hug:');
    expect(second.existing).toBe(true);
    expect(second.sticker.id).toBe(first.sticker.id);
    expect((await db.select().from(schema.stickers))).toHaveLength(1);
  });

  it('never overwrites a manual sticker and allocates a unique suffix on collision', async () => {
    await db.insert(schema.stickers).values({
      id: 'manual', token: ':naruto-hug:', url: 'https://example.com/manual.gif',
      emoji: '🤗', label: 'Manual', createdAt: new Date(1),
    });
    const imported = await persistImportedSticker(db, {
      url: 'https://media.giphy.com/media/new/giphy.gif', label: 'Naruto Hug GIF',
      emoji: null, fallbackStem: 'giphy-new',
    });
    expect(imported.sticker.token).toBe(':naruto-hug-2:');
    const rows = await db.select().from(schema.stickers);
    expect(rows.find((row) => row.id === 'manual')).toMatchObject({
      token: ':naruto-hug:', url: 'https://example.com/manual.gif', emoji: '🤗', label: 'Manual',
    });
  });

  it('persists only trusted provider URLs', () => {
    expect(isTrustedGiphyGifUrl('https://media3.giphy.com/media/abc/giphy.gif')).toBe(true);
    expect(isTrustedGiphyGifUrl('http://media.giphy.com/media/abc/giphy.gif')).toBe(false);
    expect(isTrustedGiphyGifUrl('https://giphy.com.evil.example/x.gif')).toBe(false);
    expect(isTrustedNekoGifUrl('https://nekos.best/api/v2/hug/example.gif', 'hug')).toBe(true);
    expect(isTrustedNekoGifUrl('https://evil.example/api/v2/hug/example.gif', 'hug')).toBe(false);
    expect(isTrustedNekoGifUrl('javascript:alert(1)', 'hug')).toBe(false);
  });

  it('stable imported token survives paste serialization/reload and resolves from the pack', async () => {
    const { sticker } = await persistImportedSticker(db, {
      url: 'https://media.giphy.com/media/reload/giphy.gif', label: 'Reload Dance GIF',
      emoji: null, fallbackStem: 'giphy-reload',
    });
    const doc: RichDoc = {
      v: 1,
      lines: [{
        text: `look ${sticker.token}`,
        marks: buildInlineMarks(`look ${sticker.token}`, new Set([sticker.token])),
      }],
    };
    const loaded = parsePasteContent('rich', JSON.stringify(doc));
    expect(isRichDoc(loaded)).toBe(true);
    if (isRichDoc(loaded)) {
      expect(loaded.lines[0].marks?.[0]).toMatchObject({ kind: 'sticker', value: sticker.token });
      expect(loaded.lines[0].stickerUrls).toBeUndefined();
    }
    const [fromPack] = await db.select().from(schema.stickers);
    expect(fromPack.url).toBe('https://media.giphy.com/media/reload/giphy.gif');
  });
});
