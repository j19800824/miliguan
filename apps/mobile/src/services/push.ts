import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getApiClient, shouldUseMocks } from './api/client';

let cachedExpoToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensurePermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === 'granted';
}

async function getDeviceToken(): Promise<string | null> {
  if (cachedExpoToken) return cachedExpoToken;
  try {
    const granted = await ensurePermission();
    if (!granted) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const result = await Notifications.getExpoPushTokenAsync();
    cachedExpoToken = result.data;
    return cachedExpoToken;
  } catch {
    return null;
  }
}

/**
 * Called after a successful login. Best-effort: silently no-ops if
 * permissions are denied, in mock mode, or if the device is a simulator
 * without push capability.
 */
export async function registerPushToken(): Promise<void> {
  if (shouldUseMocks()) return;
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
