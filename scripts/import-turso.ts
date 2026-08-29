#!/usr/bin/env tsx
/**
 * Import script: JSON files → Turso (libSQL/SQLite)
 *
 * This script reads the JSON files exported from Neon and imports them
 * into a Turso database, converting PostgreSQL types to SQLite types.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... tsx scripts/import-turso.ts
 *
 * Or for local development:
 *   tsx scripts/import-turso.ts   (uses file:local.db)
 *
 * Prerequisites:
 *   - Run export-neon.ts first to generate the exports/ directory
 *   - Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for remote Turso
 */

import { readFileSync, existsSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';

const BATCH_SIZE = 100;

function getClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    console.log('🔌 Connecting to Turso remote database...');
    return createClient({ url: tursoUrl, authToken: tursoToken });
  }

  console.log('🔌 Using local SQLite database (file:local.db)...');
  return createClient({ url: 'file:local.db' });
}

function loadExport(name: string): any[] {
  const path = `exports/${name}.json`;
  if (!existsSync(path)) {
    console.warn(`⚠️  ${path} not found, skipping`);
    return [];
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Convert a PostgreSQL timestamp (Date or ISO string) to millisecond epoch.
 */
function toTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

/**
 * Convert a PostgreSQL boolean to SQLite integer (0/1).
 */
function toBool(value: unknown): number {
  if (value === true || value === 1 || value === 'true' || value === 't') return 1;
  return 0;
}

/**
 * Convert a JSONB array to a JSON string.
 */
function toJsonString(value: unknown): string {
  if (typeof value === 'string') {
    // Already a string — try to parse and re-serialize to ensure valid JSON
    try {
      JSON.parse(value);
      return value;
    } catch {
      return '[]';
    }
  }
  return JSON.stringify(value ?? []);
}

async function createSchema(client: Client) {
  console.log('🏗️  Creating schema...');

  const statements = [
    `PRAGMA foreign_keys = OFF`,  // Temporarily disable for import speed

    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      username_changed_at INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS signup_ips (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ip TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS signup_ips_ip_idx ON signup_ips (ip)`,

    `CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      bio TEXT NOT NULL DEFAULT '',
      bio_enabled INTEGER NOT NULL DEFAULT 1,
      avatar_url TEXT,
      banner_url TEXT,
      banner_type TEXT NOT NULL DEFAULT 'image',
      name_from TEXT NOT NULL DEFAULT '#a78bfa',
      name_to TEXT NOT NULL DEFAULT '#22d3ee',
      name_style TEXT NOT NULL DEFAULT 'gradient',
      name_effect TEXT NOT NULL DEFAULT 'none',
      effect_speed INTEGER NOT NULL DEFAULT 50,
      effect_intensity INTEGER NOT NULL DEFAULT 60,
      accent TEXT NOT NULL DEFAULT '#8b5cf6',
      links TEXT NOT NULL DEFAULT '[]',
      views INTEGER NOT NULL DEFAULT 0,
      status_emoji TEXT NOT NULL DEFAULT '',
      status_text TEXT NOT NULL DEFAULT ''
    )`,

    `CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)`,

    `CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
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
    )`,
    `CREATE INDEX IF NOT EXISTS pastes_user_idx ON pastes (user_id)`,
    `CREATE INDEX IF NOT EXISTS pastes_created_idx ON pastes (created_at)`,

    `CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS likes_paste_idx ON likes (paste_id)`,
    `CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_user_idx ON likes (paste_id, user_id) WHERE user_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_ip_idx ON likes (paste_id, ip_hash) WHERE ip_hash IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#a78bfa',
      effect TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS user_tags (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, tag_id)
    )`,

    `CREATE TABLE IF NOT EXISTS stickers (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      url TEXT,
      emoji TEXT,
      label TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`,

    `PRAGMA foreign_keys = ON`,
  ];

  for (const stmt of statements) {
    await client.execute(stmt);
  }
  console.log('✅ Schema created\n');
}

async function importBatch(
  client: Client,
  tableName: string,
  rows: any[],
  transform: (row: any) => Record<string, any>,
): Promise<{ imported: number; failed: number }> {
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const transformed = batch.map(transform);

    try {
      const transaction = await client.transaction('write');
      try {
        for (const row of transformed) {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((c) => row[c]);

          await transaction.execute({
            sql: `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
            args: values,
          });
          imported++;
        }
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (error) {
      // Fall back to row-by-row insertion for better error reporting
      for (const row of transformed) {
        try {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((c) => row[c]);

          await client.execute({
            sql: `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
            args: values,
          });
          imported++;
        } catch (err) {
          failed++;
        }
      }
    }
  }

  return { imported, failed };
}

async function main() {
  // Verify exports exist
  if (!existsSync('exports/export-summary.json')) {
    console.error('❌ No exports found! Run export-neon.ts first.');
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync('exports/export-summary.json', 'utf-8'));
  console.log('📊 Import target: Turso (libSQL/SQLite)');
  console.log('📋 Export source from:', summary.exportedAt);
  console.log('');

  const client = getClient();

  // Create schema
  await createSchema(client);

  console.log('📥 Importing data...\n');

  // Import in dependency order
  const users = loadExport('users');
  const userResult = await importBatch(client, 'users', users, (r) => ({
    id: r.id,
    username: r.username,
    password_hash: r.password_hash,
    created_at: toTimestampMs(r.created_at),
    username_changed_at: toTimestampMs(r.username_changed_at),
  }));
  console.log(`  users:          exported=${users.length}, imported=${userResult.imported}, failed=${userResult.failed}`);

  const signupIps = loadExport('signup_ips');
  const signupResult = await importBatch(client, 'signup_ips', signupIps, (r) => ({
    user_id: r.user_id,
    ip: r.ip,
    created_at: toTimestampMs(r.created_at),
  }));
  console.log(`  signup_ips:     exported=${signupIps.length}, imported=${signupResult.imported}, failed=${signupResult.failed}`);

  const profiles = loadExport('profiles');
  const profileResult = await importBatch(client, 'profiles', profiles, (r) => ({
    user_id: r.user_id,
    display_name: r.display_name ?? null,
    bio: r.bio ?? '',
    bio_enabled: toBool(r.bio_enabled),
    avatar_url: r.avatar_url ?? null,
    banner_url: r.banner_url ?? null,
    banner_type: r.banner_type ?? 'image',
    name_from: r.name_from ?? '#a78bfa',
    name_to: r.name_to ?? '#22d3ee',
    name_style: r.name_style ?? 'gradient',
    name_effect: r.name_effect ?? 'none',
    effect_speed: r.effect_speed ?? 50,
    effect_intensity: r.effect_intensity ?? 60,
    accent: r.accent ?? '#8b5cf6',
    links: toJsonString(r.links),
    views: r.views ?? 0,
    status_emoji: r.status_emoji ?? '',
    status_text: r.status_text ?? '',
  }));
  console.log(`  profiles:       exported=${profiles.length}, imported=${profileResult.imported}, failed=${profileResult.failed}`);

  const passwordResets = loadExport('password_resets');
  const resetResult = await importBatch(client, 'password_resets', passwordResets, (r) => ({
    id: r.id,
    user_id: r.user_id,
    token_hash: r.token_hash,
    expires_at: toTimestampMs(r.expires_at),
    used_at: toTimestampMs(r.used_at),
    created_at: toTimestampMs(r.created_at),
  }));
  console.log(`  password_resets: exported=${passwordResets.length}, imported=${resetResult.imported}, failed=${resetResult.failed}`);

  const pastes = loadExport('pastes');
  const pasteResult = await importBatch(client, 'pastes', pastes, (r) => ({
    id: r.id,
    user_id: r.user_id ?? null,
    title: r.title ?? 'Untitled',
    title_color: r.title_color ?? null,
    format: r.format ?? 'plain',
    content: r.content,
    language: r.language ?? 'plaintext',
    visibility: r.visibility ?? 'public',
    password_hash: r.password_hash ?? null,
    expires_at: toTimestampMs(r.expires_at),
    pinned: toBool(r.pinned),
    views: r.views ?? 0,
    likes_count: r.likes_count ?? 0,
    created_at: toTimestampMs(r.created_at),
  }));
  console.log(`  pastes:         exported=${pastes.length}, imported=${pasteResult.imported}, failed=${pasteResult.failed}`);

  const likesData = loadExport('likes');
  const likesResult = await importBatch(client, 'likes', likesData, (r) => ({
    id: r.id,
    paste_id: r.paste_id,
    user_id: r.user_id ?? null,
    ip_hash: r.ip_hash ?? null,
    created_at: toTimestampMs(r.created_at),
  }));
  console.log(`  likes:          exported=${likesData.length}, imported=${likesResult.imported}, failed=${likesResult.failed}`);

  const tagsData = loadExport('tags');
  const tagsResult = await importBatch(client, 'tags', tagsData, (r) => ({
    id: r.id,
    label: r.label,
    color: r.color ?? '#a78bfa',
    effect: r.effect ?? '',
    created_at: toTimestampMs(r.created_at),
  }));
  console.log(`  tags:           exported=${tagsData.length}, imported=${tagsResult.imported}, failed=${tagsResult.failed}`);

  const userTagsData = loadExport('user_tags');
  const userTagsResult = await importBatch(client, 'user_tags', userTagsData, (r) => ({
    user_id: r.user_id,
    tag_id: r.tag_id,
  }));
  console.log(`  user_tags:      exported=${userTagsData.length}, imported=${userTagsResult.imported}, failed=${userTagsResult.failed}`);

  const stickersData = loadExport('stickers');
  const stickersResult = await importBatch(client, 'stickers', stickersData, (r) => ({
    id: r.id,
    token: r.token,
    url: r.url ?? null,
    emoji: r.emoji ?? null,
    label: r.label ?? '',
    created_at: toTimestampMs(r.created_at),
  }));
  console.log(`  stickers:       exported=${stickersData.length}, imported=${stickersResult.imported}, failed=${stickersResult.failed}`);

  // Summary
  console.log('\n📊 Import Summary:');
  console.log('='.repeat(70));
  const tableResults = [
    { name: 'users', exported: users.length, ...userResult },
    { name: 'signup_ips', exported: signupIps.length, ...signupResult },
    { name: 'profiles', exported: profiles.length, ...profileResult },
    { name: 'password_resets', exported: passwordResets.length, ...resetResult },
    { name: 'pastes', exported: pastes.length, ...pasteResult },
    { name: 'likes', exported: likesData.length, ...likesResult },
    { name: 'tags', exported: tagsData.length, ...tagsResult },
    { name: 'user_tags', exported: userTagsData.length, ...userTagsResult },
    { name: 'stickers', exported: stickersData.length, ...stickersResult },
  ];

  let allMatch = true;
  for (const t of tableResults) {
    const status = t.exported === t.imported && t.failed === 0 ? '✅' : '⚠️';
    if (t.exported !== t.imported || t.failed > 0) allMatch = false;
    console.log(`  ${status} ${t.name.padEnd(20)} exported=${t.exported}, imported=${t.imported}, failed=${t.failed}`);
  }
  console.log('='.repeat(70));

  if (allMatch) {
    console.log('\n✅ All rows imported successfully! Row counts match.');
  } else {
    console.log('\n⚠️  Some rows may have been skipped (duplicates or FK violations).');
    console.log('   Check the failed counts above.');
  }

  console.log('\n   Next step: Run validate-migration.ts to verify the data.\n');
}

main().catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
