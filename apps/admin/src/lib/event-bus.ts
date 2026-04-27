import { createClient, type RedisClientType } from 'redis';

const redisUrl = process.env.REDIS_URL;
const CHANNEL = 'miliguan:events';

export interface EventScope {
  userId?: string | number;
  companyId?: string | number;
  storeId?: string | number;
  role?: string;
}

export interface ScopedEvent {
  type: string;
  scope?: EventScope;
  data?: Record<string, unknown>;
  ts: number;
}

export interface SubscribeFilter {
  userId?: string | number;
  companyId?: string | number;
  storeId?: string | number;
  role?: string;
}

export type EventHandler = (event: ScopedEvent) => void;

const globalForBus = globalThis as unknown as {
  __miliguanEventPublisher?: RedisClientType;
};

let publisherPromise: Promise<RedisClientType> | null = null;

async function getPublisher(): Promise<RedisClientType> {
  if (!redisUrl) throw new Error('REDIS_URL not set');
  if (globalForBus.__miliguanEventPublisher?.isOpen) {
    return globalForBus.__miliguanEventPublisher;
  }
  if (!publisherPromise) {
    publisherPromise = (async () => {
      const client: RedisClientType = createClient({ url: redisUrl });
      client.on('error', () => {
        /* swallow — we don't crash the request on bus errors */
      });
      await client.connect();
      globalForBus.__miliguanEventPublisher = client;
      return client;
    })();
  }
  return publisherPromise;
}

/**
 * Best-effort publish. Never throws to caller — bus failures must not
 * break business flows.
 */
export async function publishEvent(
  event: Omit<ScopedEvent, 'ts'>,
): Promise<void> {
  try {
    const client = await getPublisher();
    const payload: ScopedEvent = { ...event, ts: Date.now() };
    await client.publish(CHANNEL, JSON.stringify(payload));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[event-bus] publish failed:', error);
  }
}

export function eventMatchesFilter(
  event: ScopedEvent,
  filter: SubscribeFilter,
): boolean {
  const scope = event.scope ?? {};
  // No-scope events broadcast to everyone.
  if (scope.userId !== undefined && String(scope.userId) !== String(filter.userId)) {
    return false;
  }
  if (scope.companyId !== undefined && String(scope.companyId) !== String(filter.companyId)) {
    return false;
  }
  if (scope.storeId !== undefined && String(scope.storeId) !== String(filter.storeId)) {
    return false;
  }
  if (scope.role !== undefined && scope.role !== filter.role) {
    return false;
  }
  return true;
}

/**
 * Each subscriber gets its own Redis connection (Redis SUB connections
 * cannot publish, so we can't share with the singleton publisher).
 */
export async function subscribeEvents(
  filter: SubscribeFilter,
  handler: EventHandler,
): Promise<() => Promise<void>> {
  if (!redisUrl) throw new Error('REDIS_URL not set');
  const subscriber: RedisClientType = createClient({ url: redisUrl });
  subscriber.on('error', () => {
    /* swallow */
  });
  await subscriber.connect();
  await subscriber.subscribe(CHANNEL, (raw) => {
    try {
      const event = JSON.parse(raw) as ScopedEvent;
      if (eventMatchesFilter(event, filter)) handler(event);
    } catch {
      /* malformed event */
    }
  });
  return async () => {
    try {
      await subscriber.unsubscribe(CHANNEL);
      await subscriber.quit();
    } catch {
      /* ignore */
    }
  };
}
