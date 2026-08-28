import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users, profiles } from '@/lib/db/schema';
import { hashPassword, createSession } from '@/lib/auth';

const RESERVED = new Set([
  'api', 'login', 'register', 'dashboard', 'settings', 'p', 'u', 'new',
  'about', 'admin', 'explore', 'recent', 'paste', 'pastes', 'profile',
  'vibebin', 'help', 'support', 'terms', 'privacy', 'static', '_next', 'favicon.ico',
]);

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const username = (body.username || '').trim();
  const password = body.password || '';

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3–20 characters (letters, numbers, underscores).' },
      { status: 400 },
    );
  }
  if (RESERVED.has(username.toLowerCase())) {
    return NextResponse.json({ error: 'That username is reserved.' }, { status: 400 });
  }
  if (password.length < 6 || password.length > 100) {
    return NextResponse.json({ error: 'Password must be 6–100 characters.' }, { status: 400 });
  }

  const db = await getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash })
    .returning();

  await db.insert(profiles).values({ userId: user.id, displayName: user.username });

  await createSession(user);
  return NextResponse.json({ ok: true, username: user.username });
}
