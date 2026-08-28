import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  usernameChangedAt: timestamp('username_changed_at', { withTimezone: true }),
});

// ------------------------------------------------------------------
// Account creation tracking — enforces "max N accounts per IP"
// ------------------------------------------------------------------
export const signupIps = pgTable('signup_ips', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  ip: text('ip').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------------------
// Profiles — fully customizable, no media is stored on the server
// (avatars, banners, video banners are all remote URLs only).
// ------------------------------------------------------------------
export type ProfileLink = { label: string; url: string; color: string };

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  bio: text('bio').notNull().default(''),
  bioEnabled: boolean('bio_enabled').notNull().default(true),
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
  links: jsonb('links').$type<ProfileLink[]>().notNull().default([]),
  views: integer('views').notNull().default(0),
});

// ------------------------------------------------------------------
// Pastes — content may be plain text OR rich-text JSON (the new
// "rich" format that supports font / color / emoji tokens).
// ------------------------------------------------------------------
export const pastes = pgTable(
  'pastes',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Untitled'),
    titleColor: text('title_color'),
    // 'plain' or 'rich'
    format: text('format').notNull().default('plain'),
    content: text('content').notNull(),
    language: text('language').notNull().default('plaintext'),
    visibility: text('visibility').notNull().default('public'), // 'public' | 'unlisted'
    passwordHash: text('password_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    pinned: boolean('pinned').notNull().default(false),
    views: integer('views').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pastes_user_idx').on(t.userId),
    index('pastes_created_idx').on(t.createdAt),
  ],
);

// ------------------------------------------------------------------
// Admin-managed tags (label, color, optional effect).
// Plus a join table for user <-> tag assignments.
// ------------------------------------------------------------------
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull().unique(),
  color: text('color').notNull().default('#a78bfa'),
  // '', 'shimmer', 'neon', 'rainbow', 'fire', 'gold'
  effect: text('effect').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userTags = pgTable(
  'user_tags',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tagId] })],
);

// ------------------------------------------------------------------
// Server sticker pack — admin-curated, in addition to unicode emoji.
// Stored as text/url only; no media bytes on the server.
// ------------------------------------------------------------------
export const stickers = pgTable('stickers', {
  id: uuid('id').primaryKey().defaultRandom(),
  // the short token a user types in the editor, e.g. ":wave:"
  token: text('token').notNull().unique(),
  // image/gif url OR an emoji fallback if no url
  url: text('url'),
  emoji: text('emoji'),
  label: text('label').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Paste = typeof pastes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Sticker = typeof stickers.$inferSelect;
