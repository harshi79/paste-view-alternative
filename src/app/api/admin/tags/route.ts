import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { tags, userTags } from '@/lib/db/schema';
import { isAdmin } from '@/lib/auth';

const HEX = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_EFFECTS = new Set(['', 'shimmer', 'neon', 'rainbow', 'fire', 'gold']);

async function requireAdmin() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard) return guard;
  const db = await getDb();
  const rows = await db.select().from(tags).orderBy(asc(tags.label));
  return NextResponse.json({ tags: rows });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;
  let body: { label?: string; color?: string; effect?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const label = String(body.label ?? '').trim().slice(0, 40);
  const color = HEX.test(String(body.color)) ? String(body.color) : '#a78bfa';
  const effect = ALLOWED_EFFECTS.has(String(body.effect ?? '')) ? String(body.effect) : '';
  if (!label) return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
  const db = await getDb();
  const [existing] = await db.select().from(tags).where(eq(tags.label, label)).limit(1);
  if (existing) return NextResponse.json({ error: 'A tag with that label already exists.' }, { status: 409 });
  const [row] = await db.insert(tags).values({ id: randomUUID(), label, color, effect, createdAt: new Date() }).returning();
  return NextResponse.json({ tag: row });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;
  let body: { id?: string; label?: string; color?: string; effect?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const patch: { label?: string; color?: string; effect?: string } = {};
  if (typeof body.label === 'string') {
    const label = body.label.trim().slice(0, 40);
    if (!label) return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
    patch.label = label;
  }
  if (typeof body.color === 'string' && HEX.test(body.color)) patch.color = body.color;
  if (typeof body.effect === 'string' && ALLOWED_EFFECTS.has(body.effect)) patch.effect = body.effect;
  const db = await getDb();
  const [row] = await db.update(tags).set(patch).where(eq(tags.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Tag not found.' }, { status: 404 });
  return NextResponse.json({ tag: row });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const db = await getDb();
  await db.delete(userTags).where(eq(userTags.tagId, id));
  await db.delete(tags).where(eq(tags.id, id));
  return NextResponse.json({ ok: true });
}
