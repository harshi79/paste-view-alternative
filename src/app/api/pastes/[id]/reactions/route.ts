import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import {
  addReaction,
  getReactionState,
  removeReaction,
  resolveReaction,
  toggleReaction,
} from '@/lib/reactions';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

async function findPaste(id: string) {
  const db = await getDb();
  const [paste] = await db
    .select({ id: pastes.id, expiresAt: pastes.expiresAt })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);
  return paste ?? null;
}

function isExpired(paste: { expiresAt: Date | null }): boolean {
  return !!paste.expiresAt && paste.expiresAt.getTime() <= Date.now();
}

/** Reads `reaction` from the JSON body, tolerating an absent/invalid body. */
async function readReactionField(req: Request): Promise<unknown> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object') return (body as Record<string, unknown>).reaction;
  } catch {
    // no/invalid JSON body — fall through to `undefined`
  }
  return undefined;
}

async function readToggleFlag(req: Request): Promise<{ reaction: unknown; toggle: boolean }> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      return { reaction: record.reaction, toggle: record.toggle === true };
    }
  } catch {
    // no/invalid JSON body
  }
  return { reaction: undefined, toggle: false };
}

/**
 * Post reactions endpoint.
 *
 * GET    → public per-reaction counts for the post, plus the CURRENT
 *          authenticated user's own reactions (`mine`, always empty for
 *          guests — counts themselves are display data, like the paste's
 *          like count, so reading them never requires a session).
 * POST   → add a reaction (`{ reaction }`), or toggle it (`{ reaction,
 *          toggle: true }`). Idempotent: re-adding the same reaction
 *          inserts nothing (`created: false`).
 * DELETE → remove a reaction (`?reaction=` or `{ reaction }`).
 *          Idempotent (`removed: false` when it was not there).
 *
 * Security model:
 *   - the acting user id comes ONLY from the session cookie; a
 *     client-supplied user_id is never read, so it can never be trusted;
 *   - guests get 401 on every mutation (there is no anonymous reaction);
 *   - the reaction value is validated server-side and stored canonically
 *     (one Unicode emoji, or an existing sticker-pack token like
 *     ':wave:') — never rendered HTML;
 *   - every mutation is keyed on the session's own user id, so one user
 *     can never add or remove another user's reaction;
 *   - all DB access goes through parameterized Drizzle queries.
 */
export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  const paste = await findPaste(id);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  if (isExpired(paste)) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }
  const state = await getReactionState(paste.id, session?.user.id ?? null);
  return NextResponse.json({ ...state, authenticated: !!session });
}

export async function POST(req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const paste = await findPaste(id);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  if (isExpired(paste)) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }

  const { reaction: raw, toggle } = await readToggleFlag(req);
  const reaction = await resolveReaction(raw);
  if (!reaction) {
    return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
  }

  const result = toggle
    ? await toggleReaction(session.user.id, paste.id, reaction)
    : await addReaction(session.user.id, paste.id, reaction);
  if (!result.ok) {
    return NextResponse.json({ error: 'Too many reactions on this post.' }, { status: 409 });
  }

  const state = await getReactionState(paste.id, session.user.id);
  return NextResponse.json({
    ok: true,
    reaction,
    active: result.active,
    created: result.created,
    removed: 'removed' in result ? result.removed : false,
    ...state,
  });
}

export async function DELETE(req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const paste = await findPaste(id);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });

  // Removing an existing reaction stays possible on an expired post (same
  // convention as unlike/unbookmark, which also skip the expiry check).
  const url = new URL(req.url);
  const raw = url.searchParams.get('reaction') ?? (await readReactionField(req));
  const reaction = await resolveReaction(raw);
  if (!reaction) {
    return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
  }

  const result = await removeReaction(session.user.id, paste.id, reaction);
  const state = await getReactionState(paste.id, session.user.id);
  return NextResponse.json({
    ok: true,
    reaction,
    active: result.active,
    created: false,
    removed: result.removed,
    ...state,
  });
}
