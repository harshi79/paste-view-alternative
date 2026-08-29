import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Keep-alive / health check.
 *
 * Neon's free tier puts idle compute to sleep after ~5 minutes of no
 * connections, which makes the first request after that feel slow. Point
 * any uptime monitor or cron (see vercel.json → crons) at this endpoint on
 * a fixed interval and it wakes the database with a trivial `SELECT 1`
 * before it ever falls asleep — so real visitors get a warm connection.
 */
export async function GET() {
  const started = Date.now();
  let db: string;
  try {
    const handle = await getDb();
    await handle.run(sql.raw(`SELECT 1`));
    db = 'ok';
  } catch (err) {
    db = 'error';
    console.error('[ping] database check failed', err);
  }
  return NextResponse.json({
    ok: db === 'ok',
    db,
    ms: Date.now() - started,
    ts: new Date().toISOString(),
  });
}
