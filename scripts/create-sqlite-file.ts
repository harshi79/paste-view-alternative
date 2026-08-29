#!/usr/bin/env tsx
/**
 * Creates a SQLite database file with the schema and seed data.
 * This file can be uploaded directly to Turso via the web dashboard.
 */

import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('🔨 Creating SQLite database file...\n');

  const client = createClient({
    url: 'file:vibebin-turso.db',
  });

  // Enable foreign keys
  await client.execute('PRAGMA foreign_keys = ON');

  console.log('📋 Creating schema...');

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
    await client.execute(stmt);
  }

  console.log('✅ Schema created\n');

  // Seed data
  console.log('🌱 Adding seed data...');

  const now = Date.now();
  const HOUR = 3600 * 1000;

  const DEMO_PASSWORD = 'demo1234';
  const NOVA_PASSWORD = 'novapass1';

  const demoHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const novaHash = bcrypt.hashSync(NOVA_PASSWORD, 10);

  const demoId = randomUUID();
  const novaId = randomUUID();

  // Users
  await client.execute({
    sql: 'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [demoId, 'demo', demoHash, now],
  });
  await client.execute({
    sql: 'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [novaId, 'nova', novaHash, now],
  });

  // Profiles
  await client.execute({
    sql: `INSERT INTO profiles (user_id, display_name, bio, avatar_url, banner_url, banner_type, name_from, name_to, name_style, name_effect, accent, links)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      demoId,
      'Demo User',
      'Just exploring the app. Try the rich-text editor and the new name effects.',
      '/demo/avatar.jpg',
      '/demo/banner.jpg',
      'image',
      '#a78bfa',
      '#f472b6',
      'gradient',
      'shimmer',
      '#8b5cf6',
      JSON.stringify([
        { label: 'Website', url: 'https://example.com', color: '#8b5cf6' },
        { label: 'GitHub', url: 'https://github.com', color: '#22d3ee' },
      ]),
    ],
  });

  await client.execute({
    sql: `INSERT INTO profiles (user_id, display_name, bio, name_from, name_to, name_style, name_effect, accent, links)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      novaId,
      'Nova',
      'Neon and clean code.',
      '#22d3ee',
      '#4ade80',
      'gradient',
      'neon',
      '#22d3ee',
      JSON.stringify([{ label: 'Discord', url: 'https://discord.com', color: '#f472b6' }]),
    ],
  });

  // Pastes
  const pastes = [
    {
      id: 'welcometovb',
      userId: demoId,
      title: 'Welcome',
      titleColor: '#a78bfa',
      format: 'plain',
      content: `Welcome to VibeBin — a free PasteView alternative.

* Paste code or text and get a shareable link instantly
* No account needed (guests welcome)
* Create a free account to unlock profile customization

Sign in with the demo account:
    username: demo
    password: ${DEMO_PASSWORD}`,
      language: 'markdown',
      visibility: 'public',
      pinned: 1,
      views: 1337,
      createdAt: now - 40 * HOUR,
    },
    {
      id: 'fizzbuzzdemo',
      userId: demoId,
      title: 'FizzBuzz',
      content: `function fizzbuzz(n) {
  for (let i = 1; i <= n; i++) {
    const out = (i % 3 ? '' : 'Fizz') + (i % 5 ? '' : 'Buzz');
    console.log(out || i);
  }
}

fizzbuzz(100);`,
      language: 'javascript',
      visibility: 'public',
      views: 214,
      createdAt: now - 26 * HOUR,
    },
    {
      id: 'py-oneliner',
      userId: novaId,
      title: 'Python one-liner',
      content: `# Reverse every word but keep the order
sentence = "hello world from vibebin"
print(' '.join(w[::-1] for w in sentence.split()))`,
      language: 'python',
      visibility: 'public',
      views: 87,
      createdAt: now - 8 * HOUR,
    },
  ];

  for (const p of pastes) {
    await client.execute({
      sql: `INSERT INTO pastes (id, user_id, title, title_color, format, content, language, visibility, pinned, views, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.id,
        p.userId,
        p.title,
        (p as any).titleColor ?? null,
        p.format ?? 'plain',
        p.content,
        p.language ?? 'plaintext',
        p.visibility ?? 'public',
        p.pinned ?? 0,
        p.views ?? 0,
        p.createdAt,
      ],
    });
  }

  // Tags
  const tags = [
    { label: 'Founder', color: '#fbbf24', effect: 'gold' },
    { label: 'Verified', color: '#22d3ee', effect: 'neon' },
    { label: 'OG', color: '#a78bfa', effect: 'shimmer' },
    { label: 'Bug Hunter', color: '#f87171', effect: 'fire' },
    { label: 'Top 100', color: '#4ade80', effect: 'rainbow' },
  ];

  for (const t of tags) {
    await client.execute({
      sql: 'INSERT INTO tags (id, label, color, effect, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [randomUUID(), t.label, t.color, t.effect, now],
    });
  }

  // Stickers
  function pngStickerUrl(label: string, bg: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="40" text-anchor="middle" font-size="28" font-family="system-ui">${label}</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  const stickers = [
    { token: ':wave:', url: pngStickerUrl('👋', '#a78bfa'), emoji: '👋', label: 'Wave' },
    { token: ':fire:', url: pngStickerUrl('🔥', '#f97316'), emoji: '🔥', label: 'Fire' },
    { token: ':rocket:', url: pngStickerUrl('🚀', '#22d3ee'), emoji: '🚀', label: 'Rocket' },
    { token: ':sparkles:', url: pngStickerUrl('✨', '#facc15'), emoji: '✨', label: 'Sparkles' },
    { token: ':100:', url: pngStickerUrl('💯', '#ef4444'), emoji: '💯', label: '100' },
    { token: ':heart:', url: pngStickerUrl('❤️', '#f87171'), emoji: '❤️', label: 'Heart' },
  ];

  for (const s of stickers) {
    await client.execute({
      sql: 'INSERT INTO stickers (id, token, url, emoji, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), s.token, s.url ?? null, s.emoji ?? null, s.label, now],
    });
  }

  console.log('✅ Seed data added\n');

  // Summary
  const counts = [
    'users',
    'profiles',
    'pastes',
    'tags',
    'stickers',
  ];

  console.log('📊 Database Summary:');
  console.log('='.repeat(40));
  for (const table of counts) {
    const result = await client.execute(`SELECT COUNT(*) as count FROM ${table}`);
    const count = result.rows[0]?.count ?? 0;
    console.log(`  ${table.padEnd(20)} ${count} rows`);
  }
  console.log('='.repeat(40));

  console.log('\n✅ SQLite file created: vibebin-turso.db');
  console.log('\n📤 Next step: Upload this file to Turso web dashboard:');
  console.log('   1. Go to https://turso.tech/app');
  console.log('   2. Click "Create Database"');
  console.log('   3. Choose "Upload SQLite file"');
  console.log('   4. Select vibebin-turso.db');
  console.log('   5. Copy the database URL and token\n');
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
