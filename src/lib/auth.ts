import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { getAuthSecret } from './secret';
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

/**
 * JWT signing/verification key. No fallback: if AUTH_SECRET is missing,
 * weak, or a known compromised value, this throws.
 *
 * - In verification paths (getSessionUser / isAdmin) the throw is caught by
 *   the surrounding try/catch, so every presented token is simply rejected.
 * - In issuance paths (createSession / createAdminSession) it propagates to
 *   the API route, which fails with a 500 instead of signing with a
 *   predictable key.
 */
function secret(): Uint8Array {
  return getAuthSecret();
}

async function getCookieOptions(maxAge: number) {
  let isHttps = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto');
    const host = h.get('host') || '';
    if (proto === 'https' || host.includes('e2b.app') || host.includes('vercel.app')) {
      isHttps = true;
    }
  } catch {
    // headers() might not be available in non-request contexts
  }

  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    partitioned: isHttps,
    maxAge,
    path: '/',
  };
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
  const options = await getCookieOptions(MAX_AGE);
  store.set(COOKIE, token, options);
}

/**
 * Expires the session cookie using the EXACT attributes it was created
 * with (getCookieOptions is the single source for both). This matters on
 * HTTPS, where the cookie is Secure + SameSite=None + Partitioned (CHIPS):
 * a deletion cookie whose attributes don't all match targets a different
 * cookie slot, and the original partitioned cookie keeps working.
 */
export async function destroySession() {
  const store = await cookies();
  const options = await getCookieOptions(0);
  store.set(COOKIE, '', { ...options, maxAge: 0, expires: new Date(0) });
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
    const [row] = await db
      .select({ user: users, profile: profiles })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, uid))
      .limit(1);
    if (!row || !row.user) return null;

    const profile: Profile = row.profile ?? {
      userId: row.user.id,
      displayName: null,
      bio: '',
      bioEnabled: true,
      avatarUrl: null,
      bannerUrl: null,
      bannerType: 'image',
      nameFrom: '#a78bfa',
      nameTo: '#22d3ee',
      nameStyle: 'gradient',
      nameEffect: 'none',
      effectSpeed: 50,
      effectIntensity: 60,
      accent: '#8b5cf6',
      links: [],
      views: 0,
      statusEmoji: '',
      statusText: '',
    };

    return { user: row.user, profile };
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
  const options = await getCookieOptions(ADMIN_MAX_AGE);
  store.set(ADMIN_COOKIE, token, options);
}

/**
 * Expires the admin cookie using the EXACT attributes it was created
 * with (see destroySession for why attribute matching is required).
 */
export async function destroyAdminSession() {
  const store = await cookies();
  const options = await getCookieOptions(0);
  store.set(ADMIN_COOKIE, '', { ...options, maxAge: 0, expires: new Date(0) });
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
