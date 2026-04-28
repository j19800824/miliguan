export type ApiClientOptions = {
  baseUrl: string;
  defaultHeaders?: HeadersInit;
};

export class ApiError extends Error {
  status: number;
  statusText: string;
  body?: unknown;

  constructor(status: number, statusText: string, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

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
      // Surface the server's user-facing message instead of the generic
      // status text, so callers (and UIs) see "账号或密码不正确" rather than
      // "API error: 401 Unauthorized".
      let message = `${response.status} ${response.statusText}`;
      let body: unknown;
      try {
        const text = await response.text();
        if (text) {
          try {
            body = JSON.parse(text);
            const fromBody =
              (typeof body === 'object' && body !== null
                ? (body as Record<string, unknown>).message ??
                  (body as Record<string, unknown>).error
                : undefined) ?? text;
            if (typeof fromBody === 'string' && fromBody.trim()) {
              message = fromBody.trim();
            }
          } catch {
            // Non-JSON: surface the raw body text (truncated).
            const trimmed = text.trim();
            if (trimmed) message = trimmed.slice(0, 200);
          }
        }
      } catch {
        /* response body unreadable — fall back to status text */
      }
      throw new ApiError(response.status, response.statusText, message, body);
    }

    return response.json() as Promise<T>;
  };
}
