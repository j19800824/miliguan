import { getApiClient, shouldUseMocks } from './client';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  status: 'unread' | 'read';
  actionLabel?: string;
  actionUrl?: string;
  createdAt: string;
  readAt?: string;
}

export async function fetchNotifications(
  status: 'all' | 'unread' | 'read' = 'all',
): Promise<NotificationItem[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<NotificationItem[]>(
    `/api/mobile/notifications?status=${status}`,
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  if (shouldUseMocks()) return;
  await getApiClient()<{ ok: boolean }>(
    `/api/mobile/notifications/${id}/read`,
    { method: 'PUT' },
  );
}
