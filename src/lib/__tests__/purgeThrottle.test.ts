/**
 * Regression tests — expired-paste purge throttling (audit fix #9).
 *
 * Hot read paths (/p/[id], /p/[id]/raw, and others) must use the throttled
 * `purgeExpiredIfDue` helper rather than the direct `purgeExpired` so an
 * expired-paste DELETE isn't issued on every page view. These tests pin the
 * throttle contract: multiple rapid calls within the window trigger the
 * underlying DELETE at most once, and the direct purge still works when the
 * throttle is not due.
 */
import { describe, expect, it } from 'vitest';
import type { DB } from '@/lib/db';
import { purgeExpiredIfDue, purgeExpired } from '@/lib/pastes';

const purgeState = globalThis as unknown as { __vibepurge?: number };
const INTERVAL_MS = 5 * 60 * 1000;

/** A minimal DB stand-in that records how many DELETE statements it runs. */
function mockDb() {
  let deletes = 0;
  const db = {
    delete() {
      return { where: async () => void (deletes += 1) };
    },
  } as unknown as DB;
  return { db, deletes: () => deletes };
}

describe('purgeExpiredIfDue — throttled expiry purge', () => {
  it('calls the underlying DELETE at most once across rapid calls', async () => {
    purgeState.__vibepurge = 0;
    const { db, deletes } = mockDb();
    await purgeExpiredIfDue(db);
    await purgeExpiredIfDue(db);
    await purgeExpiredIfDue(db);
    expect(deletes()).toBe(1);
  });

  it('runs the DELETE again once the throttle window has elapsed', async () => {
    // Force the "last purge" far enough in the past to be due.
    purgeState.__vibepurge = Date.now() - INTERVAL_MS - 1;
    const { db, deletes } = mockDb();
    await purgeExpiredIfDue(db);
    expect(deletes()).toBe(1);
    // Simulate another window passing → a fresh purge runs.
    purgeState.__vibepurge = Date.now() - INTERVAL_MS - 1;
    await purgeExpiredIfDue(db);
    expect(deletes()).toBe(2);
  });

  it('does not purge at all when the window has not elapsed since last purge', async () => {
    purgeState.__vibepurge = Date.now(); // just purged
    const { db, deletes } = mockDb();
    await purgeExpiredIfDue(db);
    expect(deletes()).toBe(0);
  });

  it('direct purgeExpired still works (the throttled helper wraps it)', async () => {
    purgeState.__vibepurge = Date.now(); // suppress any incidental throttle
    const { db, deletes } = mockDb();
    await purgeExpired(db);
    expect(deletes()).toBe(1);
  });
});
