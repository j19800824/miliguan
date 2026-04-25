export type ApiClientOptions = {
  baseUrl: string;
  defaultHeaders?: HeadersInit;
};

export function createApiClient(options: ApiClientOptions) {
  const { baseUrl, defaultHeaders } = options;

  return async function apiClient<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...defaultHeaders,
        ...init?.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  };
}
