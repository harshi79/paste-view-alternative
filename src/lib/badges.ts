import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { pastes, users, type User, type Profile, type Paste } from './db/schema';

export type Badge = { id: string; label: string; emoji: string; from: string; to: string };

/**
 * Auto-computed badges — no manual awarding, they appear based on activity.
 * This is one of the "premium" perks: everyone can earn visible badges for free.
 */
export async function computeBadges(
  user: User,
  profile: Profile,
  userPastes: Paste[],
): Promise<Badge[]> {
  const badges: Badge[] = [];

  try {
    const db = await getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.createdAt} <= ${user.createdAt.toISOString()}`);
    if (Number(row?.n ?? 0) <= 10) {
      badges.push({ id: 'og', label: 'OG Member', emoji: '🏅', from: '#f59e0b', to: '#ef4444' });
    }
  } catch {
    /* badge is optional */
  }

  const totalViews = userPastes.reduce((sum, p) => sum + p.views, 0);
  if (userPastes.length >= 10) {
    badges.push({ id: 'prolific', label: 'Prolific Paster', emoji: '📚', from: '#8b5cf6', to: '#6366f1' });
  }
  if (totalViews >= 500) {
    badges.push({ id: 'viral', label: 'Viral', emoji: '🔥', from: '#ef4444', to: '#f97316' });
  }
  if (profile.nameEffect !== 'none' || profile.links.length > 0 || profile.avatarUrl || profile.bannerUrl) {
    badges.push({ id: 'stylist', label: 'Certified Stylist', emoji: '✨', from: '#22d3ee', to: '#a78bfa' });
  }

  return badges;
}
