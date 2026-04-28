import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getApiClient, shouldUseMocks } from './api/client';

/**
 * SDK 53+ removed Android remote-push from Expo Go. Importing or initialising
 * expo-notifications in that environment crashes the app at module load.
 * We gate the entire push module behind a runtime capability check and use
 * a lazy require so simply running in Expo Go on Android no longer trips
 * expo-notifications' init-time guard.
 *
 * In a development build (`eas build --profile development` or after
 * `expo prebuild`), `executionEnvironment` is no longer `'storeClient'` and
 * the full push flow runs.
 */
const isExpoGo = Constants.executionEnvironment === 'storeClient';
const pushSupported = !(isExpoGo && Platform.OS === 'android');

type NotificationsModule = typeof import('expo-notifications');

let cachedExpoToken: string | null = null;
let cachedModule: NotificationsModule | null | undefined;

function getNotifications(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (!pushSupported) {
    cachedModule = null;
    return null;
  }
  try {
    // Lazy require avoids module-init side effects in unsupported environments.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    cachedModule = mod;
    return mod;
  } catch {
    cachedModule = null;
    return null;
  }
}

async function ensurePermission(N: NotificationsModule): Promise<boolean> {
  const settings = await N.getPermissionsAsync();
  if (settings.status === 'granted') return true;
  const req = await N.requestPermissionsAsync();
  return req.status === 'granted';
}

async function getDeviceToken(): Promise<string | null> {
  if (cachedExpoToken) return cachedExpoToken;
  const N = getNotifications();
  if (!N) return null;
  try {
    const granted = await ensurePermission(N);
    if (!granted) return null;
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'default',
        importance: N.AndroidImportance.HIGH,
      });
    }
    const result = await N.getExpoPushTokenAsync();
    cachedExpoToken = result.data;
    return cachedExpoToken;
  } catch {
    return null;
  }
}

/**
 * Called after a successful login. Best-effort: silently no-ops if
 * permissions are denied, in mock mode, in Expo Go on Android, or if the
 * device is a simulator without push capability.
 */
export async function registerPushToken(): Promise<void> {
  if (shouldUseMocks()) return;
  if (!pushSupported) return;
  const token = await getDeviceToken();
  if (!token) return;
  try {
    await getApiClient()<{ ok: boolean }>('/api/mobile/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch {
    /* swallow — push isn't business-critical */
  }
}

/** Best-effort cleanup at logout. */
export async function unregisterPushToken(): Promise<void> {
  if (shouldUseMocks()) return;
  if (!cachedExpoToken) return;
  try {
    await getApiClient()<{ ok: boolean }>('/api/mobile/push/unregister', {
      method: 'POST',
      body: JSON.stringify({ token: cachedExpoToken }),
    });
  } catch {
    /* swallow */
  }
  cachedExpoToken = null;
}

/** Exposed for diagnostics. */
export function isPushSupported(): boolean {
  return pushSupported;
}
