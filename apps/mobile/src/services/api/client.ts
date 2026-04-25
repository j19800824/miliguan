import { createApiClient } from '@miliguan/api-client';

export type ApiClient = ReturnType<typeof createApiClient>;

let cached: ApiClient | null = null;
let cachedKey: string | null = null;

function readApiBaseUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_API_BASE_URL;
}

function readUseMocksFlag(): boolean {
  const baseUrl = readApiBaseUrl();
  return process.env.EXPO_PUBLIC_USE_MOCKS === '1' || !baseUrl;
}

export function getApiClient(): ApiClient {
  const baseUrl = readApiBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'apiClient requested without EXPO_PUBLIC_API_BASE_URL. Use shouldUseMocks() first.',
    );
  }
  if (cached && cachedKey === baseUrl) return cached;
  cached = createApiClient({ baseUrl });
  cachedKey = baseUrl;
  return cached;
}

export function shouldUseMocks(): boolean {
  return readUseMocksFlag();
}

export function __resetApiClient() {
  cached = null;
  cachedKey = null;
}
