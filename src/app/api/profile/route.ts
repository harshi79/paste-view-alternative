import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { profiles } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME_STYLES = ['solid', 'gradient'];
const NAME_EFFECTS = [
  'none', 'typewriter', 'shimmer', 'neon', 'rainbow',
  'fire', 'glitch', 'wave', 'aurora', 'gold',
];

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** In v2 the API only accepts remote URLs (no data: uploads). */
function normalizeUrl(value: string, opts: { allowEmpty: boolean }): string | null {
  const v = value.trim();
  if (!v) return opts.allowEmpty ? '' : null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return v;
  } catch {
    return null;
  }
}

export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const displayName = String(body.displayName ?? '').trim().slice(0, 40) || null;
  const bio = String(body.bio ?? '').slice(0, 1000);
  const bioEnabled = body.bioEnabled !== false;
  // Emoji status: a short emoji + optional one-line status text.
  const statusEmoji = String(body.statusEmoji ?? '').trim().slice(0, 8);
  const statusText = String(body.statusText ?? '').trim().slice(0, 60);
  const nameStyle = NAME_STYLES.includes(String(body.nameStyle)) ? String(body.nameStyle) : 'gradient';
  const nameEffect = NAME_EFFECTS.includes(String(body.nameEffect)) ? String(body.nameEffect) : 'none';
  const nameFrom = HEX.test(String(body.nameFrom)) ? String(body.nameFrom) : '#a78bfa';
  const nameTo = HEX.test(String(body.nameTo)) ? String(body.nameTo) : '#22d3ee';
  const accent = HEX.test(String(body.accent)) ? String(body.accent) : '#8b5cf6';
  const bannerType = body.bannerType === 'video' ? 'video' : 'image';
  const effectSpeed = clamp(Number(body.effectSpeed ?? 50), 0, 100);
  const effectIntensity = clamp(Number(body.effectIntensity ?? 60), 0, 100);

  const avatarUrl = normalizeUrl(String(body.avatarUrl ?? ''), { allowEmpty: true });
  if (body.avatarUrl && avatarUrl === null) {
    return NextResponse.json(
      { error: 'Avatar must be an http(s):// URL.' },
      { status: 400 },
    );
  }
  const bannerUrl = normalizeUrl(String(body.bannerUrl ?? ''), { allowEmpty: true });
  if (body.bannerUrl && bannerUrl === null) {
    return NextResponse.json(
      { error: 'Banner must be an http(s):// URL.' },
      { status: 400 },
    );
  }

  let links: { label: string; url: string; color: string }[] = [];
  if (Array.isArray(body.links)) {
    links = body.links
      .slice(0, 6)
      .map((l) => {
        const link = l as { label?: unknown; url?: unknown; color?: unknown };
        const label = String(link.label ?? '').trim().slice(0, 40);
        const url = String(link.url ?? '').trim().slice(0, 300);
        const color = HEX.test(String(link.color)) ? String(link.color) : '#8b5cf6';
        return { label, url, color };
      })
      .filter((l) => l.label && /^https?:\/\//.test(l.url));
  }

  const db = await getDb();
  const values = {
    displayName,
    bio,
    bioEnabled,
    avatarUrl: avatarUrl || null,
    bannerUrl: bannerUrl || null,
    bannerType,
    nameFrom,
    nameTo,
    nameStyle,
    nameEffect,
    effectSpeed,
    effectIntensity,
    accent,
    links,
    statusEmoji,
    statusText,
  };

  await db
    .insert(profiles)
    .values({ userId: session.user.id, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });

  return NextResponse.json({ ok: true });
}
