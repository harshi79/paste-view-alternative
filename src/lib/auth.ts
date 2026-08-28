import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import {
  users,
  profiles,
  userTags,
  tags,
  type User,
  type Profile,
  type Tag,
} from './db/schema';

const COOKIE = 'vb_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const ADMIN_COOKIE = 'vb_admin';
const ADMIN_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET ||
    'vibebin-dev-secret-do-not-use-in-production-change-me';
  return new TextEncoder().encode(raw);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: { id: string; username: string }) {
  const token = await new SignJWT({ uid: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export type SessionUser = { user: User; profile: Profile };

/** Reads the session cookie and loads the full user + profile from the DB. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const uid = payload.uid as string | undefined;
    if (!uid) return null;

    const db = await getDb();
    // Single joined round-trip (used to be two sequential queries).
    const [row] = await db
      .select({ user: users, profile: profiles })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, uid))
      .limit(1);
    if (!row) return null;
    return { user: row.user, profile: row.profile };
  } catch {
    return null;
  }
}

/** Server-component guard: redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  return session;
}

/** API-route guard variant. */
export async function getApiUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

// ------------------------------------------------------------------
// Admin auth — separate cookie, separate JWT payload.
// ------------------------------------------------------------------

/** Returns the admin password from env, or null if not configured. */
export function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  return pw ? pw : null;
}

export async function createAdminSession() {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_MAX_AGE,
    path: '/',
  });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.admin === true;
  } catch {
    return false;
  }
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

// ------------------------------------------------------------------
// User tags (admin-awarded) — loaded per profile render.
// ------------------------------------------------------------------

export async function getUserTags(userId: string): Promise<Tag[]> {
  const db = await getDb();
  const rows = await db
    .select({ tag: tags })
    .from(userTags)
    .innerJoin(tags, eq(userTags.tagId, tags.id))
    .where(eq(userTags.userId, userId));
  return rows.map((r) => r.tag);
}

// ------------------------------------------------------------------
// Username rename policy: allow exactly one rename within 24h of
// account creation. After that the username is locked.
// ------------------------------------------------------------------

export const RENAME_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canRenameUser(user: { createdAt: Date; usernameChangedAt: Date | null }): boolean {
  if (user.usernameChangedAt) return false; // already used their one rename
  return Date.now() - user.createdAt.getTime() < RENAME_WINDOW_MS;
}
