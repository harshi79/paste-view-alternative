import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { users, profiles, type User, type Profile } from './db/schema';

const COOKIE = 'vb_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
    const [user] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    if (!user) return null;
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, uid))
      .limit(1);
    if (!profile) return null;
    return { user, profile };
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
