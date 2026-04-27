/* eslint-disable @typescript-eslint/no-explicit-any */
import EventSource from 'react-native-sse';
import { loadToken } from './auth/storage';
import { shouldUseMocks } from './api/client';

export interface RealtimeEvent<T = Record<string, unknown>> {
  type: string;
  scope?: { userId?: string; companyId?: string; storeId?: string; role?: string };
  data?: T;
  ts: number;
}

type Listener = (event: RealtimeEvent) => void;

class RealtimeClient {
  private es: EventSource | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private boundEvents = new Set<string>();
  private starting = false;

  async start(): Promise<void> {
    if (shouldUseMocks()) return;
    if (this.es || this.starting) return;
    const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!baseUrl) return;

    this.starting = true;
    try {
      const token = await loadToken();
      if (!token) return;
      this.es = new EventSource(`${baseUrl}/api/mobile/events`, {
        headers: { Authorization: `Bearer ${token}` },
        // react-native-sse will auto-reconnect on transport errors.
        pollingInterval: 0,
      } as any);

      // Re-bind any event types that already have listeners.
      for (const type of this.listeners.keys()) {
        this.bindEventListener(type);
      }
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    if (this.es) {
      try {
        this.es.close();
      } catch {
        /* ignore */
      }
      this.es = null;
    }
    this.boundEvents.clear();
  }

  on<T = Record<string, unknown>>(
    type: string,
    cb: (event: RealtimeEvent<T>) => void,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb as Listener);
    if (this.es && !this.boundEvents.has(type)) {
      this.bindEventListener(type);
    }
    return () => {
      const s = this.listeners.get(type);
      if (!s) return;
      s.delete(cb as Listener);
    };
  }

  private bindEventListener(type: string) {
    if (!this.es) return;
    this.boundEvents.add(type);
    (this.es as any).addEventListener(type, (ev: any) => {
      try {
        const event = JSON.parse(ev.data) as RealtimeEvent;
        const set = this.listeners.get(type);
        if (set) {
          set.forEach((cb) => {
            try {
              cb(event);
            } catch {
              /* swallow listener errors */
            }
          });
        }
      } catch {
        /* malformed payload */
      }
    });
  }
}

const client = new RealtimeClient();

export function startRealtime(): Promise<void> {
  return client.start();
}

export function stopRealtime(): void {
  client.stop();
}

export function onRealtime<T = Record<string, unknown>>(
  type: string,
  cb: (event: RealtimeEvent<T>) => void,
): () => void {
  return client.on(type, cb);
}
