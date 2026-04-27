import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'miliguan.cache.';
const DEFAULT_TTL_MS = 60 * 1000; // 1 minute fresh

interface CachedEntry<T> {
  ts: number;
  value: T;
}

async function readCache<T>(key: string): Promise<CachedEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedEntry<T>;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    const entry: CachedEntry<T> = { ts: Date.now(), value };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Wrap a fetcher with stale-while-error behaviour:
 * - returns cached value when fresh (< ttl)
 * - otherwise calls fetcher, caches the result, returns it
 * - if fetcher throws AND a cached entry exists (any age), returns cached
 *
 * Best for read-only screen data. Don't wrap mutations.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const cached = await readCache<T>(key);
  if (cached && Date.now() - cached.ts < ttlMs) {
    return cached.value;
  }
  try {
    const fresh = await fetcher();
    await writeCache(key, fresh);
    return fresh;
  } catch (err) {
    if (cached) return cached.value; // serve stale on failure
    throw err;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    await Promise.all(ours.map((k) => AsyncStorage.removeItem(k)));
  } catch {
    /* ignore */
  }
}
