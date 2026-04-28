import { getApiClient, shouldUseMocks } from './client';

export async function changePassword(current: string, next: string): Promise<void> {
  if (shouldUseMocks()) return;
  await getApiClient()<{ ok: boolean }>('/api/mobile/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current, next }),
  });
}
