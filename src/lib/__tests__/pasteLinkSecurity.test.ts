/**
 * Stored-XSS defense for rich paste link marks.
 *
 * The rich renderer puts a `link` mark's value straight into an <a href>.
 * The editor is safe, but POST /api/pastes must not trust a hand-crafted
 * RichDoc. These tests pin the shared server-side gate
 * (`isSafeLinkValue` / `richDocLinksAreSafe`) and then prove at the API
 * boundary that a malicious link is rejected with 400 and never persisted,
 * while legitimate rich pastes — normal links, stickers, emoji, font/size/
 * color — are stored byte-for-byte.
 *
 * The route handler chain is exercised against an in-memory SQLite
 * database: `getDb` is mocked to return it and `getSessionUser` to null
 * (no cookie store in a vitest process).
 */
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';
import {
  isSafeLinkValue,
  richDocLinksAreSafe,
  type InlineMark,
  type RichDoc,
  type RichLine,
} from '@/lib/pasteFormat';

const { testDb } = vi.hoisted(() => {
  const state: { db?: LibSQLDatabase<typeof schema> } = {};
  return { testDb: state };
});

vi.mock('@/lib/db', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('@/lib/db/schema');
  const client = createClient({ url: 'file::memory:' });
  const db = drizzle(client, { schema });
  testDb.db = db;
  return { getDb: async () => db };
});

vi.mock('@/lib/auth', () => ({
  getSessionUser: async () => null,
  hashPassword: async (password: string) => password,
}));

import { POST } from '@/app/api/pastes/route';

function db(): LibSQLDatabase<typeof schema> {
  if (!testDb.db) throw new Error('test db not initialized');
  return testDb.db;
}

beforeAll(async () => {
  await db().run(sql`
    CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL DEFAULT 'Untitled',
      title_color TEXT,
      format TEXT NOT NULL DEFAULT 'plain',
      content TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'plaintext',
      visibility TEXT NOT NULL DEFAULT 'public',
      password_hash TEXT,
      expires_at INTEGER,
      pinned INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
});

beforeEach(async () => {
  await db().run(sql`DELETE FROM pastes`);
});

function doc(lines: RichLine[]): RichDoc {
  return { v: 1, lines };
}

function link(value: string, start = 0, end = 11): RichLine['marks'] {
  return [{ start, end, kind: 'link', value }];
}

/** A request exactly like the unified editor's submit payload. */
function pasteRequest(d: RichDoc): Request {
  return new Request('http://localhost/api/pastes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Link safety test',
      format: 'rich',
      language: 'plaintext',
      visibility: 'public',
      expiresIn: 'never',
      content: JSON.stringify(d),
    }),
  });
}

async function storedRows() {
  return db().select().from(schema.pastes);
}

// ------------------------------------------------------------------
// Unit: the shared URL gate
// ------------------------------------------------------------------

describe('isSafeLinkValue — server-side link-mark URL gate', () => {
  it('accepts http:// and https:// links (scheme case-insensitive)', () => {
    expect(isSafeLinkValue('https://example.com')).toBe(true);
    expect(isSafeLinkValue('http://example.com')).toBe(true);
    expect(isSafeLinkValue('HTTPS://EXAMPLE.COM/path?q=1#frag')).toBe(true);
    expect(isSafeLinkValue('https://sub.example.com/a/b?x=1&y=2')).toBe(true);
  });

  it('keeps the editor’s own non-executable mailto/tel links working', () => {
    expect(isSafeLinkValue('mailto:me@z.org')).toBe(true);
    expect(isSafeLinkValue('tel:+1-555-0100')).toBe(true);
  });

  it('rejects executable and dangerous schemes in any casing', () => {
    expect(isSafeLinkValue('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkValue('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeLinkValue('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeLinkValue('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeLinkValue('file:///etc/passwd')).toBe(false);
    expect(isSafeLinkValue('blob:https://example.com/x')).toBe(false);
    expect(isSafeLinkValue('filesystem:https://example.com/x')).toBe(false);
  });

  it('rejects whitespace / control-character bypasses', () => {
    expect(isSafeLinkValue(' javascript:alert(1)')).toBe(false);
    expect(isSafeLinkValue('\tjavascript:alert(1)')).toBe(false);
    expect(isSafeLinkValue('\njavascript:alert(1)')).toBe(false);
    expect(isSafeLinkValue('\u0000javascript:alert(1)')).toBe(false);
    // Tab inside the scheme would be stripped by the URL parser.
    expect(isSafeLinkValue('java\tscript:alert(1)')).toBe(false);
    expect(isSafeLinkValue('\u00a0javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed, empty and scheme-less values', () => {
    expect(isSafeLinkValue('')).toBe(false);
    expect(isSafeLinkValue('   ')).toBe(false);
    expect(isSafeLinkValue('//example.com')).toBe(false);
    expect(isSafeLinkValue('example.com')).toBe(false);
    expect(isSafeLinkValue('https://')).toBe(false);
    expect(isSafeLinkValue('http:/example.com')).toBe(false);
    expect(isSafeLinkValue('https:/example.com')).toBe(false);
    expect(isSafeLinkValue('http:example.com')).toBe(false);
    expect(isSafeLinkValue('http://?q=1')).toBe(false);
    expect(isSafeLinkValue('https://exa mple.com')).toBe(false);
    expect(isSafeLinkValue('not a url')).toBe(false);
    expect(isSafeLinkValue(42)).toBe(false);
    expect(isSafeLinkValue(null)).toBe(false);
    expect(isSafeLinkValue(undefined)).toBe(false);
    expect(isSafeLinkValue({})).toBe(false);
  });
});

describe('richDocLinksAreSafe — doc-level gate', () => {
  it('accepts docs whose link marks are all safe (values untouched)', () => {
    const d = doc([
      {
        text: 'a https://example.com b',
        marks: [{ start: 2, end: 21, kind: 'link', value: 'https://example.com' }],
      },
      {
        text: 'mail me@z.org',
        marks: [{ start: 5, end: 14, kind: 'link', value: 'mailto:me@z.org' }],
      },
    ]);
    expect(richDocLinksAreSafe(d)).toBe(true);
  });

  it('rejects when any link mark is unsafe, without touching sticker/emoji marks', () => {
    const d = doc([
      {
        text: ':wave: visit javascript:alert(1)',
        marks: [
          { start: 0, end: 6, kind: 'sticker', value: ':wave:' },
          { start: 13, end: 31, kind: 'link', value: 'javascript:alert(1)' },
        ],
      },
    ]);
    expect(richDocLinksAreSafe(d)).toBe(false);
  });

  it('ignores sticker/emoji marks and font/size/color formatting', () => {
    const d = doc([
      {
        text: 'styled :wave: :)',
        font: 'serif',
        size: 32,
        color: '#ff0000',
        marks: [
          { start: 7, end: 13, kind: 'sticker', value: ':wave:' },
          { start: 14, end: 16, kind: 'emoji', value: '🙂' },
        ],
      },
    ]);
    expect(richDocLinksAreSafe(d)).toBe(true);
  });

  it('skips malformed mark shapes defensively (renderer ignores them too)', () => {
    expect(
      richDocLinksAreSafe(doc([{ text: 'x', marks: 'nope' as unknown as InlineMark[] }])),
    ).toBe(true);
    expect(
      richDocLinksAreSafe(doc([{ text: 'x', marks: [null as unknown as InlineMark] }])),
    ).toBe(true);
    expect(richDocLinksAreSafe(doc([{ text: 'x' }]))).toBe(true);
  });

  it('rejects non-string link values (hand-crafted garbage)', () => {
    const d = doc([
      { text: 'x y', marks: [{ start: 0, end: 1, kind: 'link', value: 42 as unknown as string }] },
    ]);
    expect(richDocLinksAreSafe(d)).toBe(false);
  });
});

// ------------------------------------------------------------------
// API boundary: rejection before storage + legitimate pastes intact
// ------------------------------------------------------------------

describe('POST /api/pastes — link validation at the API boundary', () => {
  it('stores a legitimate rich paste with normal links byte-for-byte', async () => {
    const d = doc([
      {
        text: 'see https://example.com and http://example.org',
        font: 'serif',
        marks: [
          { start: 4, end: 23, kind: 'link', value: 'https://example.com' },
          { start: 28, end: 47, kind: 'link', value: 'http://example.org' },
        ],
      },
      {
        text: 'mail me@z.org',
        marks: [{ start: 5, end: 14, kind: 'link', value: 'mailto:me@z.org' }],
      },
    ]);

    const res = await POST(pasteRequest(d));
    expect(res.status).toBe(200);

    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].format).toBe('rich');
    // Legitimate link values are preserved unchanged.
    expect(JSON.parse(rows[0].content)).toEqual(d);
  });

  it('stores sticker/emoji/font/size/color formatting untouched', async () => {
    const d = doc([
      {
        text: ':wave: :) hi',
        font: 'comic',
        size: 24,
        color: '#00ff00',
        marks: [
          { start: 0, end: 6, kind: 'sticker', value: ':wave:' },
          { start: 7, end: 9, kind: 'emoji', value: '🙂' },
        ],
      },
    ]);

    const res = await POST(pasteRequest(d));
    expect(res.status).toBe(200);

    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].content)).toEqual(d);
  });

  const malicious: ReadonlyArray<readonly [label: string, value: string]> = [
    ['javascript:', 'javascript:alert(1)'],
    ['mixed-case javascript:', 'JaVaScRiPt:alert(1)'],
    ['leading-space javascript:', ' javascript:alert(1)'],
    ['leading-tab javascript:', '\tjavascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['malformed url', 'http:/example.com'],
    ['protocol-relative url', '//example.com'],
    ['empty value', ''],
  ];

  for (const [label, value] of malicious) {
    it(`rejects a ${label} link with 400 and persists nothing`, async () => {
      const d = doc([{ text: 'click here', marks: link(value, 0, 10) }]);

      const res = await POST(pasteRequest(d));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid link in paste content.' });

      // Nothing was stored — the malicious value never reaches the DB.
      expect(await storedRows()).toHaveLength(0);
    });
  }

  it('rejects a doc where only one of several links is malicious', async () => {
    const d = doc([
      {
        text: 'safe https://example.com evil javascript:alert(1)',
        marks: [
          { start: 5, end: 24, kind: 'link', value: 'https://example.com' },
          { start: 30, end: 48, kind: 'link', value: 'javascript:alert(1)' },
        ],
      },
    ]);

    const res = await POST(pasteRequest(d));
    expect(res.status).toBe(400);
    expect(await storedRows()).toHaveLength(0);
  });

  it('does not store the malicious value even when embedded among safe marks', async () => {
    const d = doc([
      {
        text: ':wave: javascript:alert(1)',
        font: 'mono',
        size: 14,
        color: '#aabbcc',
        marks: [
          { start: 0, end: 6, kind: 'sticker', value: ':wave:' },
          { start: 7, end: 25, kind: 'link', value: 'javascript:alert(1)' },
        ],
      },
    ]);

    const res = await POST(pasteRequest(d));
    expect(res.status).toBe(400);

    const rows = await storedRows();
    expect(rows).toHaveLength(0);
    expect(rows.some((r) => r.content.includes('javascript:alert(1)'))).toBe(false);
  });
});
