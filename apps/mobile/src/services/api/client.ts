import { createApiClient } from '@miliguan/api-client';
import { loadToken } from '../auth/storage';

export type ApiClient = ReturnType<typeof createApiClient>;

let cachedClient: ApiClient | null = null;
let cachedKey: string | null = null;
let cachedToken: string | null | undefined; // undefined = not yet loaded

function readApiBaseUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_API_BASE_URL;
}

function readUseMocksFlag(): boolean {
  const baseUrl = readApiBaseUrl();
  return process.env.EXPO_PUBLIC_USE_MOCKS === '1' || !baseUrl;
}

export function setApiToken(token: string | null): void {
  cachedToken = token;
  // bust the cached client so the next call rebuilds with new headers
  cachedClient = null;
  cachedKey = null;
}

export function getApiToken(): string | null | undefined {
  return cachedToken;
}

async function ensureToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await loadToken();
  }
  return cachedToken ?? null;
}

export function getApiClient(): ApiClient {
  const baseUrl = readApiBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'apiClient requested without EXPO_PUBLIC_API_BASE_URL. Use shouldUseMocks() first.',
    );
  }

  const token = cachedToken ?? null;
  const cacheKey = `${baseUrl}::${token ?? ''}`;
  if (cachedClient && cachedKey === cacheKey) return cachedClient;

  const defaultHeaders: Record<string, string> = {
    // Bypass ngrok-free.dev's browser interstitial (no-op on real domains).
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) defaultHeaders['Authorization'] = `Bearer ${token}`;

  cachedClient = createApiClient({ baseUrl, defaultHeaders });
  cachedKey = cacheKey;
  return cachedClient;
}

/**
 * Call this once at app boot (before the first network call) to hydrate
 * the auth token from SecureStore. Idempotent.
 */
export async function bootstrapApiClient(): Promise<void> {
  await ensureToken();
}

export function shouldUseMocks(): boolean {
  return readUseMocksFlag();
}

export function __resetApiClient(): void {
  cachedClient = null;
  cachedKey = null;
  cachedToken = undefined;
}
