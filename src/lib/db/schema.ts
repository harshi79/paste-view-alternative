import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  nameEffect: text('name_effect').notNull().default('none'), // 'none' | 'typewriter' | 'shimmer' | 'neon' | 'rainbow'
  accent: text('accent').notNull().default('#8b5cf6'),
  links: jsonb('links').$type<ProfileLink[]>().notNull().default([]),
  views: integer('views').notNull().default(0),
});

export const pastes = pgTable(
  'pastes',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Untitled'),
    titleColor: text('title_color'),
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

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Paste = typeof pastes.$inferSelect;
