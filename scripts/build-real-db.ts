#!/usr/bin/env tsx
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { unlinkSync, existsSync, writeFileSync } from 'node:fs';
import * as schema from '../src/lib/db/schema';

const DB_FILE = 'vibebin.db';
for (const ext of ['', '-wal', '-shm']) {
  if (existsSync(DB_FILE + ext)) unlinkSync(DB_FILE + ext);
}

// Fix markdown-mangled URLs: [url](url) -> url
function fixUrl(v: string | null | undefined): string | null {
  if (!v) return v ?? null;
  // Strip markdown link format: [url](url)
  v = v.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2');
  // Strip trailing markdown artifacts
  v = v.replace(/\)$/, '');
  return v;
}

function fixLinks(links: any[]): any[] {
  if (!Array.isArray(links)) return [];
  return links.map(l => ({
    label: l.label || '',
    url: fixUrl(l.url) || '',
    color: l.color || '#8b5cf6',
  }));
}

async function main() {
  console.log('🔨 Building SQLite database with your real data...\n');

  const client = createClient({ url: `file:${DB_FILE}` });
  const db = drizzle(client, { schema });

  await db.run(sql`PRAGMA foreign_keys = ON`);

  // Create tables
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, username_changed_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS signup_ips (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, ip TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS signup_ips_ip_idx ON signup_ips (ip)`,
    `CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, display_name TEXT, bio TEXT NOT NULL DEFAULT '', bio_enabled INTEGER NOT NULL DEFAULT 1, avatar_url TEXT, banner_url TEXT, banner_type TEXT NOT NULL DEFAULT 'image', name_from TEXT NOT NULL DEFAULT '#a78bfa', name_to TEXT NOT NULL DEFAULT '#22d3ee', name_style TEXT NOT NULL DEFAULT 'gradient', name_effect TEXT NOT NULL DEFAULT 'none', effect_speed INTEGER NOT NULL DEFAULT 50, effect_intensity INTEGER NOT NULL DEFAULT 60, accent TEXT NOT NULL DEFAULT '#8b5cf6', links TEXT NOT NULL DEFAULT '[]', views INTEGER NOT NULL DEFAULT 0, status_emoji TEXT NOT NULL DEFAULT '', status_text TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)`,
    `CREATE TABLE IF NOT EXISTS pastes (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT 'Untitled', title_color TEXT, format TEXT NOT NULL DEFAULT 'plain', content TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'plaintext', visibility TEXT NOT NULL DEFAULT 'public', password_hash TEXT, expires_at INTEGER, pinned INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, likes_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS pastes_user_idx ON pastes (user_id)`,
    `CREATE INDEX IF NOT EXISTS pastes_created_idx ON pastes (created_at)`,
    `CREATE TABLE IF NOT EXISTS likes (id TEXT PRIMARY KEY, paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, ip_hash TEXT, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS likes_paste_idx ON likes (paste_id)`,
    `CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_user_idx ON likes (paste_id, user_id) WHERE user_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_ip_idx ON likes (paste_id, ip_hash) WHERE ip_hash IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#a78bfa', effect TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS user_tags (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (user_id, tag_id))`,
    `CREATE TABLE IF NOT EXISTS stickers (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, url TEXT, emoji TEXT, label TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
  ];
  for (const s of stmts) await db.run(sql.raw(s));
  console.log('✅ Schema created');

  function ts(d: string): number { return new Date(d).getTime(); }

  // ── USERS ──
  const users = [
    { id: '2da9ff77-bcfe-4ad6-86f3-47e9ffe0817b', username: 'demo', passwordHash: '$2b$10$y2X/0x3g9LKsMNbQU1I6fu7fTu1jWxSeBH1OXoTAYjUjww9Qi3Xxm', createdAt: '2026-08-28T15:12:50.91779+00:00' },
    { id: '763f8a37-94a3-465d-b37b-c24fa38794c8', username: 'nova', passwordHash: '$2b$10$nTefev9wMwI1qZyEzykFGekWTcUIIo04qRngA6vY5wkVeKOnNaCSq', createdAt: '2026-08-28T15:12:51.362674+00:00' },
    { id: '9c6fe730-f938-4abc-b183-770ba43d9550', username: 'Yori', passwordHash: '$2b$10$I.voBuqzdZX8YqptubP41OsBxP3VmpcotjzDYeCqvhy7L3VlOsAkC', createdAt: '2026-08-28T15:15:29.420573+00:00' },
    { id: '5e549a95-2e46-4ba2-9adc-22e5586067cf', username: 'Cool_name123', passwordHash: '$2b$10$tP7Kgo.WoxdC1fb5ixldRen5p3mL3ltPhTLdQDLmWT23rfcHVfNaq', createdAt: '2026-08-28T17:22:10.0951+00:00' },
    { id: '096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2', username: 'cosmofic', passwordHash: '$2b$10$HvaTeEQtB36M/CXz6eg9u.sSjOGK36gVUHuz0jKYbhB2w4h0yilAO', createdAt: '2026-08-28T17:25:49.337979+00:00' },
    { id: '11a8214d-81e3-4754-814a-26d10efbe444', username: 'FEARFLESH', passwordHash: '$2b$10$WW/5jAg6YfASs/sO.gIX9ua7sFIz1pIBtBUqFfM1QVL7m21nZ4giG', createdAt: '2026-08-28T17:42:04.620972+00:00' },
    { id: '8382c93d-2585-49fe-a7d8-a8ecad5077a5', username: 'indiapooper', passwordHash: '$2b$10$dKr6./8Lxx9OkPkLdPViie5wa4U85l4l4Amp79KB8OmDRUcfgVbpW', createdAt: '2026-08-28T17:52:59.5948+00:00' },
    { id: '25ef630c-c41a-44ec-94b1-a314bf2bb1e8', username: 'mahmoon', passwordHash: '$2b$10$.kxDawA3xyWkTJ07kowSE.T6R6z3JkVDFZMRMa3xuk2EZbEHjgNj6', createdAt: '2026-08-28T17:54:13.112978+00:00' },
    { id: '45e7030d-1dd2-4aec-b70a-627443851ddc', username: 'Bulletyhaj', passwordHash: '$2b$10$M9ouh0GWIbcC0Ia0BpLhuuAgnwxaL4hwZWmpNRSYzVxWSD.vRuaDy', createdAt: '2026-08-28T18:12:41.452587+00:00' },
    { id: '5cde6097-0ef9-42ab-b672-6713e0baa9ec', username: 'fffdddddddddd', passwordHash: '$2b$10$76zVvCR2Ip4R9UpTupMRFeVGsVgjO1.xx03FrX22C.BMHDxEgGkQ2', createdAt: '2026-08-28T22:17:08.433453+00:00' },
    { id: '8d37e207-e145-4c77-acb6-455b35a86e23', username: 'z0diax', passwordHash: '$2b$10$wwxSjdZvgAGZYiZFltMi5eRaMZUDO7hqyBqPU8kqVN3RoqkLwskJW', createdAt: '2026-08-28T23:37:17.689432+00:00' },
    { id: '17e8bee7-da34-4121-9a16-e132264ad4c9', username: 'Ichigo', passwordHash: '$2b$10$gqm9.oI6qsEgLkxvngmySO85EcDV6jKiCYYFZKTn80JgOHYvCbNTi', createdAt: '2026-08-28T17:35:29.594919+00:00' },
  ];

  for (const u of users) {
    await client.execute({
      sql: 'INSERT INTO users (id, username, password_hash, created_at, username_changed_at) VALUES (?, ?, ?, ?, ?)',
      args: [u.id, u.username, u.passwordHash, ts(u.createdAt), null],
    });
  }
  console.log(`  users: ${users.length} rows`);

  // ── PROFILES ──
  const profiles = [
    { userId: '2da9ff77-bcfe-4ad6-86f3-47e9ffe0817b', displayName: 'Demo User', bio: 'Just exploring VibeBin — click "Customize profile" vibes.\nTry uploading an avatar, a banner and a name effect!', bioEnabled: true, avatarUrl: '/demo/avatar.jpg', bannerUrl: '/demo/banner.jpg', bannerType: 'image', nameFrom: '#a78bfa', nameTo: '#f472b6', nameStyle: 'gradient', nameEffect: 'typewriter', accent: '#8b5cf6', links: [{ url: 'https://example.com', color: '#8b5cf6', label: 'Website' }, { url: 'https://github.com', color: '#22d3ee', label: 'GitHub' }], views: 0, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '763f8a37-94a3-465d-b37b-c24fa38794c8', displayName: 'Nova', bio: 'Neon dreams & clean code.', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#22d3ee', nameTo: '#4ade80', nameStyle: 'gradient', nameEffect: 'neon', accent: '#22d3ee', links: [{ url: 'https://discord.com', color: '#f472b6', label: 'Discord' }], views: 0, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '5e549a95-2e46-4ba2-9adc-22e5586067cf', displayName: 'Cool_name123', bio: 'Fuvk me', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#4ade80', nameTo: '#a78bfa', nameStyle: 'gradient', nameEffect: 'aurora', accent: '#8b5cf6', links: [], views: 0, effectSpeed: 23, effectIntensity: 100, statusEmoji: '', statusText: '' },
    { userId: '8382c93d-2585-49fe-a7d8-a8ecad5077a5', displayName: 'indiapooper', bio: '', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#a78bfa', nameTo: '#22d3ee', nameStyle: 'gradient', nameEffect: 'none', accent: '#8b5cf6', links: [], views: 0, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '9c6fe730-f938-4abc-b183-770ba43d9550', displayName: 'ʏᴏʀɪ', bio: 'ᴅᴇᴠʟᴏᴘᴇʀ 🤌', bioEnabled: true, avatarUrl: 'https://imglink.cc/cdn/kSHnr7RitJ.gif', bannerUrl: 'https://imglink.cc/cdn/-N8cgQqnS5.mp4', bannerType: 'video', nameFrom: '#22d3ee', nameTo: '#3b82f6', nameStyle: 'gradient', nameEffect: 'typewriter', accent: '#cdd2cb', links: [{ url: 'https://t.me/+y8EekRvqpnQzNjZl', color: '#00ffff', label: 'Telegram' }], views: 52, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2', displayName: 'cosmofic', bio: '🤧 kya hi bolu yar bas samjho ki beta tester hu', bioEnabled: true, avatarUrl: 'https://imglink.cc/cdn/MEJTJRamLS.gif', bannerUrl: 'https://imglink.cc/cdn/G2kUDinZeE.webp', bannerType: 'image', nameFrom: '#22d3ee', nameTo: '#3b82f6', nameStyle: 'gradient', nameEffect: 'rainbow', accent: '#613dff', links: [], views: 6, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '8d37e207-e145-4c77-acb6-455b35a86e23', displayName: 'z0diax', bio: '', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#a78bfa', nameTo: '#22d3ee', nameStyle: 'gradient', nameEffect: 'none', accent: '#8198fb', links: [], views: 1, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '45e7030d-1dd2-4aec-b70a-627443851ddc', displayName: 'Bulletyhaj', bio: '', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#a78bfa', nameTo: '#22d3ee', nameStyle: 'gradient', nameEffect: 'none', accent: '#8b5cf6', links: [], views: 1, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '25ef630c-c41a-44ec-94b1-a314bf2bb1e8', displayName: 'mahmoon', bio: 'mwehehe', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#f87171', nameTo: '#22d3ee', nameStyle: 'gradient', nameEffect: 'aurora', accent: '#00ffff', links: [], views: 1, effectSpeed: 50, effectIntensity: 100, statusEmoji: '', statusText: '' },
    { userId: '5cde6097-0ef9-42ab-b672-6713e0baa9ec', displayName: 'fffdddddddddd', bio: '', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#a78bfa', nameTo: '#22d3ee', nameStyle: 'gradient', nameEffect: 'none', accent: '#8b5cf6', links: [], views: 1, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
    { userId: '11a8214d-81e3-4754-814a-26d10efbe444', displayName: 'FEARFLESH', bio: '', bioEnabled: true, avatarUrl: null, bannerUrl: null, bannerType: 'image', nameFrom: '#4ade80', nameTo: '#a78bfa', nameStyle: 'solid', nameEffect: 'aurora', accent: '#8b5cf6', links: [], views: 2, effectSpeed: 40, effectIntensity: 42, statusEmoji: '', statusText: '' },
    { userId: '17e8bee7-da34-4121-9a16-e132264ad4c9', displayName: 'Ichigo', bio: 'Orewa!! Ichigo kurosaki 🥀', bioEnabled: true, avatarUrl: 'https://imglink.cc/cdn/6i_7m3k9Ue.jpg', bannerUrl: 'https://videotourl.com/videos/1787939151752-60eda470-8291-44f4-882d-96ae7a492d68.mp4', bannerType: 'video', nameFrom: '#a78bfa', nameTo: '#22d3ee', nameStyle: 'gradient', nameEffect: 'none', accent: '#8b5cf6', links: [], views: 9, effectSpeed: 50, effectIntensity: 60, statusEmoji: '', statusText: '' },
  ];

  for (const p of profiles) {
    await client.execute({
      sql: 'INSERT INTO profiles (user_id, display_name, bio, bio_enabled, avatar_url, banner_url, banner_type, name_from, name_to, name_style, name_effect, effect_speed, effect_intensity, accent, links, views, status_emoji, status_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [p.userId, p.displayName, p.bio, p.bioEnabled ? 1 : 0, p.avatarUrl, p.bannerUrl, p.bannerType, p.nameFrom, p.nameTo, p.nameStyle, p.nameEffect, p.effectSpeed, p.effectIntensity, p.accent, JSON.stringify(p.links), p.views, p.statusEmoji, p.statusText],
    });
  }
  console.log(`  profiles: ${profiles.length} rows`);

  // ── SIGNUP_IPS ──
  const signupIps = [
    { userId: '5e549a95-2e46-4ba2-9adc-22e5586067cf', ip: '72.9.243.24', createdAt: '2026-08-28T17:22:11.027928+00:00' },
    { userId: '096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2', ip: '152.58.31.32', createdAt: '2026-08-28T17:25:50.208392+00:00' },
    { userId: '17e8bee7-da34-4121-9a16-e132264ad4c9', ip: '157.37.190.237', createdAt: '2026-08-28T17:35:30.444195+00:00' },
    { userId: '11a8214d-81e3-4754-814a-26d10efbe444', ip: '157.41.224.186', createdAt: '2026-08-28T17:42:05.47937+00:00' },
    { userId: '8382c93d-2585-49fe-a7d8-a8ecad5077a5', ip: '112.202.57.117', createdAt: '2026-08-28T17:53:00.470435+00:00' },
    { userId: '25ef630c-c41a-44ec-94b1-a314bf2bb1e8', ip: '175.158.243.10', createdAt: '2026-08-28T17:54:13.988825+00:00' },
    { userId: '45e7030d-1dd2-4aec-b70a-627443851ddc', ip: '210.79.171.12', createdAt: '2026-08-28T18:12:42.33736+00:00' },
    { userId: '5cde6097-0ef9-42ab-b672-6713e0baa9ec', ip: '103.88.234.111', createdAt: '2026-08-28T22:17:09.293049+00:00' },
    { userId: '8d37e207-e145-4c77-acb6-455b35a86e23', ip: '104.28.220.26', createdAt: '2026-08-28T23:37:18.557288+00:00' },
  ];
  for (const s of signupIps) {
    await client.execute({ sql: 'INSERT INTO signup_ips (user_id, ip, created_at) VALUES (?, ?, ?)', args: [s.userId, s.ip, ts(s.createdAt)] });
  }
  console.log(`  signup_ips: ${signupIps.length} rows`);

  // ── TAGS ──
  const tags = [
    { id: '58aaf22f-6946-4077-a82f-290c349e77ed', label: 'Verified', color: '#22d3ee', effect: 'neon', createdAt: '2026-08-28T15:56:40.832408+00:00' },
    { id: 'dd381c6e-35f9-49c6-9b57-104f522b67be', label: 'OG', color: '#a78bfa', effect: 'shimmer', createdAt: '2026-08-28T15:56:41.285414+00:00' },
    { id: '1c56781e-0e9a-49ac-83d2-6644b7bfd6eb', label: 'Bug Hunter', color: '#f87171', effect: 'fire', createdAt: '2026-08-28T15:56:41.738732+00:00' },
    { id: 'acb132b2-f981-438d-a06e-6ae1e302826a', label: 'Top 100', color: '#4ade80', effect: 'rainbow', createdAt: '2026-08-28T15:56:42.191888+00:00' },
    { id: 'ea965e4a-29bd-4a86-816a-b4e2ae49c19f', label: 'Gay Lord', color: '#ff80ff', effect: 'rainbow', createdAt: '2026-08-28T17:31:43.390763+00:00' },
    { id: '67001a17-3084-48cb-889a-979f156523d7', label: 'Matrix', color: '#bbc4bb', effect: 'shimmer', createdAt: '2026-08-28T17:59:43.607465+00:00' },
    { id: '8005722f-c4c4-4705-bbc7-a2d001604c3e', label: 'ғᴏᴜɴᴅᴇʀ', color: '#8000ff', effect: 'gold', createdAt: '2026-08-28T15:56:40.376391+00:00' },
    { id: 'def89f85-4225-4064-b4d6-0e575f5f555d', label: 'Founder', color: '#fbbf24', effect: 'gold', createdAt: '2026-08-28T18:27:35.615586+00:00' },
  ];
  for (const t of tags) {
    await client.execute({ sql: 'INSERT INTO tags (id, label, color, effect, created_at) VALUES (?, ?, ?, ?, ?)', args: [t.id, t.label, t.color, t.effect, ts(t.createdAt)] });
  }
  console.log(`  tags: ${tags.length} rows`);

  // ── USER_TAGS ──
  const userTags = [
    { userId: '9c6fe730-f938-4abc-b183-770ba43d9550', tagId: '8005722f-c4c4-4705-bbc7-a2d001604c3e' },
    { userId: '096cbb8d-7afb-4b0f-bf88-1dc4a94d25d2', tagId: '58aaf22f-6946-4077-a82f-290c349e77ed' },
    { userId: '11a8214d-81e3-4754-814a-26d10efbe444', tagId: '58aaf22f-6946-4077-a82f-290c349e77ed' },
    { userId: '763f8a37-94a3-465d-b37b-c24fa38794c8', tagId: '1c56781e-0e9a-49ac-83d2-6644b7bfd6eb' },
    { userId: '2da9ff77-bcfe-4ad6-86f3-47e9ffe0817b', tagId: 'ea965e4a-29bd-4a86-816a-b4e2ae49c19f' },
    { userId: '17e8bee7-da34-4121-9a16-e132264ad4c9', tagId: '67001a17-3084-48cb-889a-979f156523d7' },
  ];
  for (const ut of userTags) {
    await client.execute({ sql: 'INSERT INTO user_tags (user_id, tag_id) VALUES (?, ?)', args: [ut.userId, ut.tagId] });
  }
  console.log(`  user_tags: ${userTags.length} rows`);

  // ── STICKERS ──
  const stickers = [
    { id: 'ace4a706-68b7-4a74-8c16-78fe1bb27d6b', token: ':wave:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23a78bfa%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%91%8B%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '👋', label: 'Wave', createdAt: '2026-08-28T15:56:42.652713+00:00' },
    { id: 'cacafeb5-70aa-43c0-988e-4da9494ca069', token: ':fire:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23f97316%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%94%A5%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '🔥', label: 'Fire', createdAt: '2026-08-28T15:56:43.108429+00:00' },
    { id: 'f5fe5eaf-d523-4b1a-afa1-078c1e4c733d', token: ':rocket:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%2322d3ee%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%9A%80%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '🚀', label: 'Rocket', createdAt: '2026-08-28T15:56:43.561824+00:00' },
    { id: '41a4cd14-336b-4c8b-b1ad-901548e5049f', token: ':sparkles:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23facc15%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%E2%9C%A8%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '✨', label: 'Sparkles', createdAt: '2026-08-28T15:56:44.01572+00:00' },
    { id: '5e87a914-c4a8-43dc-8107-a355c1f5dec9', token: ':100:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23ef4444%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%92%AF%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '💯', label: '100', createdAt: '2026-08-28T15:56:44.474836+00:00' },
    { id: '2d986a1a-5806-4805-94e3-192a0352cd53', token: ':ok:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%234ade80%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%91%8C%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '👌', label: 'OK', createdAt: '2026-08-28T15:56:44.904923+00:00' },
    { id: 'cc5543d7-1661-4408-899c-9522a6723593', token: ':tada:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23f472b6%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%8E%89%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '🎉', label: 'Tada', createdAt: '2026-08-28T15:56:45.334165+00:00' },
    { id: '251d732a-91c3-47bf-8bbf-7623295aa2dc', token: ':bug:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%2384cc16%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%F0%9F%90%9B%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '🐛', label: 'Bug', createdAt: '2026-08-28T15:56:45.763487+00:00' },
    { id: 'a80b71e3-aa37-4c49-a675-9aaca3e78da6', token: ':heart:', url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23f87171%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20text-anchor%3D%22middle%22%20font-size%3D%2228%22%20font-family%3D%22system-ui%22%3E%E2%9D%A4%EF%B8%8F%3C%2Ftext%3E%3C%2Fsvg%3E', emoji: '❤️', label: 'Heart', createdAt: '2026-08-28T15:56:46.193371+00:00' },
    { id: '8ed69cfd-51b7-4162-96b0-7067cc6fd88c', token: ':wew:', url: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2VyZmtnbnA3MzJna2VlZTI5aGNheHhtZ3plNnlkYW5hbmV3aGJkeiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/IKFVtPf8jP6KJH16dB/giphy.gif', emoji: null, label: 'reze', createdAt: '2026-08-28T17:42:49.64279+00:00' },
    { id: '55f1b905-bd6b-4ef8-8bd0-691ea35cfcbe', token: ':mm:', url: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cHJvenVsOTd6OTE2dmtvcHdnb2xzenhoMDhwOHhmc254cmk0cDN1MiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/yMocMAF7vTfEKGPwVB/giphy.gif', emoji: null, label: 'MM', createdAt: '2026-08-28T17:43:33.294964+00:00' },
    { id: 'ce7818a0-f013-48c0-87be-b368f9379bf2', token: ':kuru:', url: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3b3hlYXpjYmF2YnljdXIzZWJvemticzl5OXYwYnRuZ2wwaGE0bmtuYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/pcrqlLPgyGwCnKV9Aa/giphy.gif', emoji: null, label: 'kuru', createdAt: '2026-08-28T17:46:44.795981+00:00' },
    { id: '9de8d015-de4d-41e1-9a86-34dafde9ef66', token: ':hug:', url: 'https://nekos.best/api/v2/hug/350aee04-6ec3-40a9-b45e-15c754b9c25d.gif', emoji: '🤗', label: 'Anime hug', createdAt: '2026-08-29T10:20:38.736398+00:00' },
    { id: 'fe3a9941-a399-40c7-8ac2-ba0afe3a017c', token: ':kiss:', url: 'https://nekos.best/api/v2/kiss/5a0e8e01-8992-4b7a-91ed-2bbf3ac7e5b9.gif', emoji: '😘', label: 'Anime kiss', createdAt: '2026-08-29T10:20:39.156124+00:00' },
    { id: 'b447b92f-2a97-496d-85d2-514a2a16926c', token: ':pat:', url: 'https://nekos.best/api/v2/pat/e704d636-0ed6-4559-92ec-61568fd10ef6.gif', emoji: '🖐️', label: 'Anime pat', createdAt: '2026-08-29T10:20:39.575243+00:00' },
    { id: 'a4b72b7e-7dbe-446d-b51a-f06e326c5439', token: ':blush:', url: 'https://nekos.best/api/v2/blush/50b11542-3d86-4368-af3c-1aa060cfcb72.gif', emoji: '😊', label: 'Anime blush', createdAt: '2026-08-29T10:20:39.994691+00:00' },
    { id: '5ce9b692-cd2b-439d-bd72-95eba872ce12', token: ':cry:', url: 'https://nekos.best/api/v2/cry/eea3fe7e-0846-4e60-afc0-7e1a787eb556.gif', emoji: '😢', label: 'Anime cry', createdAt: '2026-08-29T10:20:40.413784+00:00' },
    { id: '1ff603c7-879f-4e21-ae37-de13c89e64e1', token: ':wink:', url: 'https://nekos.best/api/v2/wink/75a33d9e-18a6-4777-8b0f-26231a8a6cfe.gif', emoji: '😉', label: 'Anime wink', createdAt: '2026-08-29T10:20:40.833327+00:00' },
    { id: 'ef490295-ccfb-473d-b82a-4e0105607f80', token: ':happy:', url: 'https://nekos.best/api/v2/happy/1158fd04-ee35-4897-afbd-ca397ecc6c3c.gif', emoji: '😄', label: 'Anime happy', createdAt: '2026-08-29T10:20:41.252554+00:00' },
    { id: 'd7941f8e-a451-4408-9785-99499c5eb77a', token: ':dance:', url: 'https://nekos.best/api/v2/dance/52b1e250-a89c-4c65-93ac-d490d54c700a.gif', emoji: '💃', label: 'Anime dance', createdAt: '2026-08-29T10:20:41.67151+00:00' },
    { id: 'cb776ed8-7aaa-4eb6-94b9-9263482cd75e', token: ':cuddle:', url: 'https://nekos.best/api/v2/cuddle/84b24863-5b47-495c-a9ee-8226655553c5.gif', emoji: '🥰', label: 'Anime cuddle', createdAt: '2026-08-29T10:20:42.090101+00:00' },
    { id: '9ac52db2-d8e3-442a-9a91-6b51983bdf32', token: ':anime-wave:', url: 'https://nekos.best/api/v2/wave/3c855905-a12a-4bd1-8938-57067b791b0e.gif', emoji: '👋', label: 'Anime wave', createdAt: '2026-08-29T10:20:42.509313+00:00' },
  ];
  for (const s of stickers) {
    await client.execute({ sql: 'INSERT INTO stickers (id, token, url, emoji, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [s.id, s.token, s.url, s.emoji, s.label, ts(s.createdAt)] });
  }
  console.log(`  stickers: ${stickers.length} rows`);

  // ── PASTES ── (content is huge, loading from file)
  const pastesRaw = JSON.parse(require('fs').readFileSync('scripts/pastes-data.json', 'utf-8'));
  for (const p of pastesRaw) {
    await client.execute({
      sql: 'INSERT INTO pastes (id, user_id, title, title_color, format, content, language, visibility, password_hash, expires_at, pinned, views, likes_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [p.id, p.user_id, p.title, p.title_color, p.format || 'plain', p.content, p.language || 'plaintext', p.visibility || 'public', p.password_hash, p.expires_at ? ts(p.expires_at) : null, p.pinned ? 1 : 0, p.views || 0, p.likes_count || 0, ts(p.created_at)],
    });
  }
  console.log(`  pastes: ${pastesRaw.length} rows`);

  // ── LIKES ──
  const likes = [
    { id: '8925e107-5aac-4450-8833-aeadd9e7d2a2', pasteId: 'ztyhax08', userId: '9c6fe730-f938-4abc-b183-770ba43d9550', ipHash: null, createdAt: '2026-08-29T10:22:31.999318+00:00' },
    { id: 'fc24f2fc-fffb-4d04-8789-812ed28555f6', pasteId: '634gm069', userId: '17e8bee7-da34-4121-9a16-e132264ad4c9', ipHash: null, createdAt: '2026-08-29T10:30:13.01386+00:00' },
  ];
  for (const l of likes) {
    await client.execute({ sql: 'INSERT INTO likes (id, paste_id, user_id, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)', args: [l.id, l.pasteId, l.userId, l.ipHash, ts(l.createdAt)] });
  }
  console.log(`  likes: ${likes.length} rows`);

  console.log('\n✅ Database built successfully!');
  console.log(`📦 File: ${DB_FILE}`);
}

main().catch(console.error);
