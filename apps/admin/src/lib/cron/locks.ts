/**
 * Redis-based distributed lock so multi-instance deployments don't run
 * the same scheduled job multiple times. Pattern:
 *
 *   if (await acquireCronLock(key, ttlMs)) {
 *     try { await doWork(); } finally { await releaseCronLock(key); }
 *   }
 *
 * The TTL is the SAFETY NET only — if the worker crashes mid-job the
 * lock auto-expires and the next tick can run it. The work itself
 * should still be idempotent (we use date-scoped run_ids, so it is).
 */

import type { RedisClientType } from 'redis';

interface DatabaseRedisModule {
  ensureRedis: () => Promise<RedisClientType>;
}

let cachedRedis: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
  if (cachedRedis?.isOpen) return cachedRedis;
  try {
    // Reach into database.js's existing client so we share the connection pool.
    const mod = (await import('@/lib/database.js')) as unknown as DatabaseRedisModule;
    cachedRedis = await mod.ensureRedis();
    return cachedRedis;
  } catch {
    return null;
  }
}

const PREFIX = 'cron-lock:';

/**
 * Try to acquire a lock. Returns true if we got it, false if another
 * worker holds it.
 *
 * @param key  short identifier; will be namespaced with prefix
 * @param ttlMs how long the lock survives before auto-release
 */
export async function acquireCronLock(
  key: string,
  ttlMs: number,
): Promise<boolean> {
  const r = await getRedis();
  if (!r) {
    // No Redis available — degrade to "always run" (single-instance only).
    return true;
  }
  const value = `${process.pid}:${Date.now()}`;
  try {
    // node-redis v4: SET key value PX ttl NX  — atomic SETNX with TTL
    const result = await r.set(PREFIX + key, value, {
      NX: true,
      PX: Math.max(1000, Math.floor(ttlMs)),
    });
    return result === 'OK';
  } catch {
    return false;
  }
}

export async function releaseCronLock(key: string): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(PREFIX + key);
  } catch {
    /* lock will auto-expire */
  }
}
