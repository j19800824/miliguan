import { getApiClient, shouldUseMocks, __resetApiClient } from '../client';

describe('api client', () => {
  beforeEach(() => {
    __resetApiClient();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_USE_MOCKS;
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.EXPO_PUBLIC_USE_MOCKS;
  });

  it('falls back to mocks when EXPO_PUBLIC_API_BASE_URL is missing', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(shouldUseMocks()).toBe(true);
  });

  it('falls back to mocks when EXPO_PUBLIC_USE_MOCKS=1', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://x';
    process.env.EXPO_PUBLIC_USE_MOCKS = '1';
    expect(shouldUseMocks()).toBe(true);
  });

  it('returns a real apiClient when base url is set and useMocks is off', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.example.com';
    process.env.EXPO_PUBLIC_USE_MOCKS = '0';
    expect(shouldUseMocks()).toBe(false);
    expect(typeof getApiClient()).toBe('function');
  });
});
