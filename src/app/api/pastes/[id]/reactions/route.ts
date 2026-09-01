import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import {
  getReactionState,
  removeReaction,
  resolveReaction,
  setReaction,
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

async function readBody(req: Request): Promise<{ reaction: unknown; toggle: boolean }> {
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
 * UNIFIED post reactions endpoint — ONE reaction per user per post.
 *
 * GET    → public per-reaction counts for the post (the ❤️ entry IS the
 *          like count) plus the CURRENT authenticated user's own single
 *          reaction (`mine`: value or null; always null for guests —
 *          counts themselves are display data, so reading them never
 *          requires a session).
 * POST   → select `{ reaction }`, REPLACING any previous reaction
 *          atomically. Re-selecting the value the user already has is
 *          an idempotent no-op. `{ reaction, toggle: true }` flips the
 *          reaction off when it is already the current one (the
 *          existing toggle contract).
 * DELETE → removes the user's CURRENT reaction (an optional `reaction`
 *          param is tolerated for older clients but never selects a
 *          different one — there is only ever one). Idempotent.
 *
 * Security model (unchanged conventions):
 *   - the acting user id comes ONLY from the session cookie; a
 *     client-supplied user_id is never read, so it can never be trusted;
 *   - guests get 401 on every mutation (there is no anonymous reaction);
 *   - the reaction value is validated server-side and stored canonically
 *     (one Unicode emoji, or an existing sticker-pack token like
 *     ':wave:') — never rendered HTML;
 *   - every mutation is keyed on the session's own user id, so one user
 *     can never change or remove another user's reaction;
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

  const { reaction: raw, toggle } = await readBody(req);
  const reaction = await resolveReaction(raw);
  if (!reaction) {
    return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
  }

  const result = toggle
    ? await toggleReaction(session.user.id, paste.id, reaction)
    : await setReaction(session.user.id, paste.id, reaction);

  const state = await getReactionState(paste.id, session.user.id);
  return NextResponse.json({
    ok: true,
    reaction,
    active: result.active,
    created: result.created,
    removed: 'removed' in result ? result.removed : false,
    previous: result.previous ?? null,
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
  // An optional reaction param is accepted for older clients; the DELETE
  // always removes the user's current (single) reaction.
  const url = new URL(req.url);
  const raw = url.searchParams.get('reaction') ?? (await readReactionField(req));
  if (raw !== undefined && raw !== null) {
    const reaction = await resolveReaction(raw);
    if (!reaction) {
      return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
    }
  }

  const result = await removeReaction(session.user.id, paste.id);
  const state = await getReactionState(paste.id, session.user.id);
  return NextResponse.json({
    ok: true,
    reaction: result.previous,
    active: result.active,
    created: false,
    removed: result.removed,
    previous: result.previous,
    ...state,
  });
}
