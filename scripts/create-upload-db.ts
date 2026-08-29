#!/usr/bin/env tsx
/**
 * Creates a local SQLite database file ready to upload to Turso
 * via their web dashboard "Upload SQLite file" feature.
 *
 * Run: npx tsx scripts/create-upload-db.ts
 * Output: vibebin.db (upload this file to Turso)
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import * as schema from '../src/lib/db/schema';
import { unlinkSync, existsSync } from 'node:fs';

const DB_FILE = 'vibebin.db';

// Remove old file if exists
if (existsSync(DB_FILE)) unlinkSync(DB_FILE);
if (existsSync(DB_FILE + '-wal')) unlinkSync(DB_FILE + '-wal');
if (existsSync(DB_FILE + '-shm')) unlinkSync(DB_FILE + '-shm');

async function main() {
  console.log('🔨 Creating SQLite database file for Turso upload...\n');

  const client = createClient({ url: `file:${DB_FILE}` });
  const db = drizzle(client, { schema });

  // Enable foreign keys
  await db.run(sql`PRAGMA foreign_keys = ON`);

  // Create all tables
  console.log('📦 Creating tables...');
  const statements = [
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
  ];

  for (const stmt of statements) {
    await db.run(sql.raw(stmt));
  }
  console.log('✅ All tables created\n');

  // Seed demo data
  console.log('🌱 Seeding demo data...');
  const now = Date.now();
  const HOUR = 3600 * 1000;

  const demoHash = bcrypt.hashSync('demo1234', 10);
  const novaHash = bcrypt.hashSync('novapass1', 10);

  const demoId = randomUUID();
  const novaId = randomUUID();

  await db.insert(schema.users).values([
    { id: demoId, username: 'demo', passwordHash: demoHash, createdAt: new Date(now) },
    { id: novaId, username: 'nova', passwordHash: novaHash, createdAt: new Date(now) },
  ]);

  await db.insert(schema.profiles).values([
    {
      userId: demoId,
      displayName: 'Demo User',
      bio: 'Just exploring the app. Try the rich-text editor and the new name effects.',
      avatarUrl: '/demo/avatar.jpg',
      bannerUrl: '/demo/banner.jpg',
      bannerType: 'image',
      nameFrom: '#a78bfa',
      nameTo: '#f472b6',
      nameStyle: 'gradient',
      nameEffect: 'shimmer',
      accent: '#8b5cf6',
      links: [
        { label: 'Website', url: 'https://example.com', color: '#8b5cf6' },
        { label: 'GitHub', url: 'https://github.com', color: '#22d3ee' },
      ],
    },
    {
      userId: novaId,
      displayName: 'Nova',
      bio: 'Neon and clean code.',
      avatarUrl: null,
      bannerUrl: null,
      bannerType: 'image',
      nameFrom: '#22d3ee',
      nameTo: '#4ade80',
      nameStyle: 'gradient',
      nameEffect: 'neon',
      accent: '#22d3ee',
      links: [{ label: 'Discord', url: 'https://discord.com', color: '#f472b6' }],
    },
  ]);

  await db.insert(schema.pastes).values([
    {
      id: 'welcometovb',
      userId: demoId,
      title: 'Welcome',
      titleColor: '#a78bfa',
      format: 'plain',
      content: `Welcome to VibeBin — a free PasteView alternative.\n\nSign in with the demo account:\n    username: demo\n    password: demo1234`,
      language: 'markdown',
      visibility: 'public',
      pinned: true,
      views: 1337,
      createdAt: new Date(now - 40 * HOUR),
    },
    {
      id: 'fizzbuzzdemo',
      userId: demoId,
      title: 'FizzBuzz',
      content: `function fizzbuzz(n) {\n  for (let i = 1; i <= n; i++) {\n    const out = (i % 3 ? '' : 'Fizz') + (i % 5 ? '' : 'Buzz');\n    console.log(out || i);\n  }\n}\nfizzbuzz(100);`,
      language: 'javascript',
      visibility: 'public',
      views: 214,
      createdAt: new Date(now - 26 * HOUR),
    },
    {
      id: 'py-oneliner',
      userId: novaId,
      title: 'Python one-liner',
      content: `sentence = "hello world from vibebin"\nprint(' '.join(w[::-1] for w in sentence.split()))`,
      language: 'python',
      visibility: 'public',
      views: 87,
      createdAt: new Date(now - 8 * HOUR),
    },
  ]);

  // Tags
  const seedTags = [
    { label: 'Founder', color: '#fbbf24', effect: 'gold' },
    { label: 'Verified', color: '#22d3ee', effect: 'neon' },
    { label: 'OG', color: '#a78bfa', effect: 'shimmer' },
    { label: 'Bug Hunter', color: '#f87171', effect: 'fire' },
    { label: 'Top 100', color: '#4ade80', effect: 'rainbow' },
  ];
  for (const t of seedTags) {
    await db.insert(schema.tags).values({ id: randomUUID(), ...t, createdAt: new Date(now) });
  }

  // Stickers
  function pngStickerUrl(label: string, bg: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="40" text-anchor="middle" font-size="28" font-family="system-ui">${label}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  const seedStickers = [
    { token: ':wave:', url: pngStickerUrl('👋', '#a78bfa'), emoji: '👋', label: 'Wave' },
    { token: ':fire:', url: pngStickerUrl('🔥', '#f97316'), emoji: '🔥', label: 'Fire' },
    { token: ':rocket:', url: pngStickerUrl('🚀', '#22d3ee'), emoji: '🚀', label: 'Rocket' },
    { token: ':sparkles:', url: pngStickerUrl('✨', '#facc15'), emoji: '✨', label: 'Sparkles' },
    { token: ':100:', url: pngStickerUrl('💯', '#ef4444'), emoji: '💯', label: '100' },
    { token: ':ok:', url: pngStickerUrl('👌', '#4ade80'), emoji: '👌', label: 'OK' },
    { token: ':tada:', url: pngStickerUrl('🎉', '#f472b6'), emoji: '🎉', label: 'Tada' },
    { token: ':bug:', url: pngStickerUrl('🐛', '#84cc16'), emoji: '🐛', label: 'Bug' },
    { token: ':heart:', url: pngStickerUrl('❤️', '#f87171'), emoji: '❤️', label: 'Heart' },
    { token: ':anime-hug:', url: null, emoji: '🤗', label: 'Anime hug' },
    { token: ':anime-kiss:', url: null, emoji: '😘', label: 'Anime kiss' },
    { token: ':anime-pat:', url: null, emoji: '🖐️', label: 'Anime pat' },
    { token: ':anime-blush:', url: null, emoji: '😊', label: 'Anime blush' },
    { token: ':anime-cry:', url: null, emoji: '😢', label: 'Anime cry' },
    { token: ':anime-wink:', url: null, emoji: '😉', label: 'Anime wink' },
    { token: ':anime-happy:', url: null, emoji: '😄', label: 'Anime happy' },
    { token: ':anime-dance:', url: null, emoji: '💃', label: 'Anime dance' },
    { token: ':anime-cuddle:', url: null, emoji: '🥰', label: 'Anime cuddle' },
    { token: ':anime-wave:', url: null, emoji: '👋', label: 'Anime wave' },
  ];
  for (const s of seedStickers) {
    await db.insert(schema.stickers).values({ id: randomUUID(), ...s, createdAt: new Date(now) });
  }

  // Print summary
  const counts = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.users),
    db.select({ n: sql<number>`count(*)` }).from(schema.profiles),
    db.select({ n: sql<number>`count(*)` }).from(schema.pastes),
    db.select({ n: sql<number>`count(*)` }).from(schema.tags),
    db.select({ n: sql<number>`count(*)` }).from(schema.stickers),
  ]);

  console.log('\n📊 Database contents:');
  console.log(`  users:     ${counts[0][0].n}`);
  console.log(`  profiles:  ${counts[1][0].n}`);
  console.log(`  pastes:    ${counts[2][0].n}`);
  console.log(`  tags:      ${counts[3][0].n}`);
  console.log(`  stickers:  ${counts[4][0].n}`);

  console.log(`\n✅ File created: ${DB_FILE}`);
  console.log('   Upload this file to Turso via their web dashboard!');
}

main().catch(console.error);
