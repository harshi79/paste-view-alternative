import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { broadcastToAllUsers } from '@/lib/notifications';

export const runtime = 'nodejs';

const MAX_TITLE = 120;
const MAX_MESSAGE = 500;
const MAX_LINK = 500;

/** Only same-origin app paths and http(s) URLs may be stored as a target. */
function normalizeLink(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const link = raw.trim().slice(0, MAX_LINK);
  if (!link) return null;
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  if (/^https?:\/\//i.test(link)) return link;
  return undefined; // javascript:, data:, protocol-relative, … → rejected
}

/**
 * Admin broadcast — sends one notification to every registered user.
 * POST /api/admin/notifications { title, message, link? }
 *
 * Authorization reuses the existing admin session check (isAdmin, the
 * vb_admin cookie); guests and normal signed-in users get 403, exactly
 * like the other /api/admin endpoints. This is backend only — no UI.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let body: { title?: unknown; message?: unknown; link?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim().slice(0, MAX_TITLE);
  const message = String(body.message ?? '').trim().slice(0, MAX_MESSAGE);
  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }
  const link = normalizeLink(body.link);
  if (link === undefined) {
    return NextResponse.json({ error: 'Invalid link.' }, { status: 400 });
  }

  const { broadcastId, recipients } = await broadcastToAllUsers({ title, message, link });
  return NextResponse.json({ ok: true, broadcastId, recipients });
}
