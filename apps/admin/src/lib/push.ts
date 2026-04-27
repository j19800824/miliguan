import { listMobilePushTokens } from '@/lib/database.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
  priority: 'default' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
}

/**
 * Server-side helper to push a notification to all of a user's
 * registered Expo push tokens. Silently no-ops if the user has none.
 *
 * Hook into business events as needed (purchase order approved,
 * inventory low, member writeoff, etc.).
 */
export async function sendPushToUser(userId: string | number, payload: PushPayload) {
  const tokens = await listMobilePushTokens(userId);
  if (tokens.length === 0) return [] as ExpoPushTicket[];

  const messages: ExpoPushMessage[] = tokens.map(({ token }: { token: string }) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: 'default',
    priority: 'high',
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}
