import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { profiles } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME_STYLES = ['solid', 'gradient'];
const NAME_EFFECTS = ['none', 'typewriter', 'shimmer', 'neon', 'rainbow'];

/** Max sizes for data-URL uploads (keeps DB rows lean, works on Neon free tier). */
const AVATAR_MAX = 200_000; // ~200 KB
const BANNER_MAX = 600_000; // ~600 KB

function isRemoteOrDataUrl(value: string, max: number): boolean {
  if (value.startsWith('data:image/') && value.length <= max) return true;
  if (value.startsWith('data:video/mp4')) return false; // videos must be hosted URLs
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
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
  const nameStyle = NAME_STYLES.includes(String(body.nameStyle)) ? String(body.nameStyle) : 'gradient';
  const nameEffect = NAME_EFFECTS.includes(String(body.nameEffect)) ? String(body.nameEffect) : 'none';
  const nameFrom = HEX.test(String(body.nameFrom)) ? String(body.nameFrom) : '#a78bfa';
  const nameTo = HEX.test(String(body.nameTo)) ? String(body.nameTo) : '#22d3ee';
  const accent = HEX.test(String(body.accent)) ? String(body.accent) : '#8b5cf6';
  const bannerType = body.bannerType === 'video' ? 'video' : 'image';

  const avatarUrlRaw = String(body.avatarUrl ?? '').trim();
  const avatarUrl = avatarUrlRaw
    ? isRemoteOrDataUrl(avatarUrlRaw, AVATAR_MAX)
      ? avatarUrlRaw
      : null
    : null;
  if (avatarUrlRaw && !avatarUrl) {
    return NextResponse.json(
      { error: 'Avatar must be an https:// URL or a small uploaded image (≤200 KB).' },
      { status: 400 },
    );
  }

  const bannerUrlRaw = String(body.bannerUrl ?? '').trim();
  const bannerUrl = bannerUrlRaw
    ? isRemoteOrDataUrl(bannerUrlRaw, BANNER_MAX)
      ? bannerUrlRaw
      : null
    : null;
  if (bannerUrlRaw && !bannerUrl) {
    return NextResponse.json(
      { error: 'Banner must be an https:// URL (images ≤600 KB) or an mp4 video URL.' },
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
    avatarUrl,
    bannerUrl,
    bannerType,
    nameFrom,
    nameTo,
    nameStyle,
    nameEffect,
    accent,
    links,
  };

  await db
    .insert(profiles)
    .values({ userId: session.user.id, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });

  return NextResponse.json({ ok: true });
}
