import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getApiClient } from './client';

const QUEUE_KEY = 'miliguan.queue.v1';

export interface QueuedRequest {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  enqueuedAt: number;
  attempts: number;
}

async function readQueue(): Promise<QueuedRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedRequest[];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedRequest[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueWrite(
  req: Omit<QueuedRequest, 'id' | 'enqueuedAt' | 'attempts'>,
): Promise<void> {
  const items = await readQueue();
  items.push({
    ...req,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enqueuedAt: Date.now(),
    attempts: 0,
  });
  await writeQueue(items);
}

export async function getQueueLength(): Promise<number> {
  return (await readQueue()).length;
}

let replaying = false;

export async function replayQueue(): Promise<{ replayed: number; remaining: number }> {
  if (replaying) return { replayed: 0, remaining: (await readQueue()).length };
  replaying = true;
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      return { replayed: 0, remaining: (await readQueue()).length };
    }
    const items = await readQueue();
    if (items.length === 0) return { replayed: 0, remaining: 0 };

    const apiClient = getApiClient();
    const remaining: QueuedRequest[] = [];
    let replayed = 0;
    for (const item of items) {
      try {
        await apiClient(item.endpoint, {
          method: item.method,
          body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
        });
        replayed += 1;
      } catch {
        if (item.attempts >= 5) {
          // give up after 5 attempts; drop to avoid stuck queue
          continue;
        }
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
    await writeQueue(remaining);
    return { replayed, remaining: remaining.length };
  } finally {
    replaying = false;
  }
}

/**
 * Subscribe to network changes; on reconnect, replay the queue.
 * Returns an unsubscribe fn.
 */
export function startQueueReplayWatcher(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void replayQueue();
    }
  });
}
