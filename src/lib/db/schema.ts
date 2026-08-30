import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID stored as text
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  usernameChangedAt: integer('username_changed_at', { mode: 'timestamp_ms' }),
});

// ------------------------------------------------------------------
// Account creation tracking — enforces "max N accounts per IP"
// ------------------------------------------------------------------
export const signupIps = sqliteTable('signup_ips', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  ip: text('ip').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// ------------------------------------------------------------------
// Profiles — fully customizable, no media is stored on the server
// (avatars, banners, video banners are all remote URLs only).
// ------------------------------------------------------------------
export type ProfileLink = { label: string; url: string; color: string };

export const profiles = sqliteTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  bio: text('bio').notNull().default(''),
  bioEnabled: integer('bio_enabled', { mode: 'boolean' }).notNull().default(true),
  avatarUrl: text('avatar_url'),
  bannerUrl: text('banner_url'),
  bannerType: text('banner_type').notNull().default('image'), // 'image' | 'video'
  nameFrom: text('name_from').notNull().default('#a78bfa'),
  nameTo: text('name_to').notNull().default('#22d3ee'),
  nameStyle: text('name_style').notNull().default('gradient'), // 'solid' | 'gradient'
  // expanded effect set: none | typewriter | shimmer | neon | rainbow | fire | glitch | wave | aurora | gold
  nameEffect: text('name_effect').notNull().default('none'),
  effectSpeed: integer('effect_speed').notNull().default(50), // 0-100
  effectIntensity: integer('effect_intensity').notNull().default(60), // 0-100
  accent: text('accent').notNull().default('#8b5cf6'),
  links: text('links', { mode: 'json' }).$type<ProfileLink[]>().notNull().default([]),
  views: integer('views').notNull().default(0),
  // Custom emoji + short status text shown beside the name / username.
  statusEmoji: text('status_emoji').notNull().default(''),
  statusText: text('status_text').notNull().default(''),
});

// ------------------------------------------------------------------
// Password resets — one-time, expiring, opaque tokens (sha256 stored).
// ------------------------------------------------------------------
export const passwordResets = sqliteTable(
  'password_resets',
  {
    id: text('id').primaryKey(), // UUID stored as text
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)],
);

// ------------------------------------------------------------------
// Pastes — content may be plain text OR rich-text JSON (the new
// "rich" format that supports font / color / emoji tokens).
// ------------------------------------------------------------------
export const pastes = sqliteTable(
  'pastes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Untitled'),
    titleColor: text('title_color'),
    // 'plain' or 'rich'
    format: text('format').notNull().default('plain'),
    content: text('content').notNull(),
    language: text('language').notNull().default('plaintext'),
    visibility: text('visibility').notNull().default('public'), // 'public' | 'unlisted'
    passwordHash: text('password_hash'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    views: integer('views').notNull().default(0),
    // Denormalized counter — keeps count-only reads off the likes table.
    likesCount: integer('likes_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('pastes_user_idx').on(t.userId),
    index('pastes_created_idx').on(t.createdAt),
  ],
);

// ------------------------------------------------------------------
// Likes — one per paste per signed-in user OR per anonymous visitor
// (tracked by a salted IP hash). A paste can be liked OR unliked;
// there is no dislike. Dedupe is enforced by partial unique indexes.
// ------------------------------------------------------------------
export const likes = sqliteTable(
  'likes',
  {
    id: text('id').primaryKey(), // UUID stored as text
    pasteId: text('paste_id')
      .notNull()
      .references(() => pastes.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('likes_paste_idx').on(t.pasteId),
    index('likes_user_idx').on(t.userId),
  ],
);

// ------------------------------------------------------------------
// Admin-managed tags (label, color, optional effect).
// Plus a join table for user <-> tag assignments.
// ------------------------------------------------------------------
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(), // UUID stored as text
  label: text('label').notNull().unique(),
  color: text('color').notNull().default('#a78bfa'),
  // '', 'shimmer', 'neon', 'rainbow', 'fire', 'gold'
  effect: text('effect').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const userTags = sqliteTable(
  'user_tags',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tagId] })],
);

// ------------------------------------------------------------------
// Server sticker pack — admin-curated, in addition to unicode emoji.
// Stored as text/url only; no media bytes on the server.
// ------------------------------------------------------------------
export const stickers = sqliteTable('stickers', {
  id: text('id').primaryKey(), // UUID stored as text
  // the short token a user types in the editor, e.g. ":wave:"
  token: text('token').notNull().unique(),
  // image/gif url OR an emoji fallback if no url
  url: text('url'),
  emoji: text('emoji'),
  label: text('label').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

// ------------------------------------------------------------------
// Email verification / OTP recovery — one recovery email per user,
// one account per email. Only the SHA-256 hash of a pending 6-digit
// OTP is ever stored (never the code itself).
// ------------------------------------------------------------------
export const emailVerifications = sqliteTable(
  'email_verifications',
  {
    id: text('id').primaryKey(), // UUID stored as text
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Normalized (trimmed, lower-cased) at write time.
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    // Pending OTP (at most one at a time per account).
    otpHash: text('otp_hash'), // sha256 hex of the current 6-digit code, or null
    // 'verify' (settings) or 'recovery' (forgot password)
    otpPurpose: text('otp_purpose'),
    otpExpiresAt: integer('otp_expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('email_verifications_user_idx').on(t.userId)],
);

// ------------------------------------------------------------------
// Generic fixed-window rate limiting (OTP requests / verification
// attempts). Keyed per account or per mailbox as appropriate.
// ------------------------------------------------------------------
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    kind: text('kind').notNull(),
    windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.kind] })],
);

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Paste = typeof pastes.$inferSelect;
export type Like = typeof likes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Sticker = typeof stickers.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type RateLimit = typeof rateLimits.$inferSelect;
