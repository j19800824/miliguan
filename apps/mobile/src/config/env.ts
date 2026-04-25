declare const process: {
  env: Record<string, string | undefined>;
};

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
export const useMocks =
  process.env.EXPO_PUBLIC_USE_MOCKS === '1' || !apiBaseUrl;
