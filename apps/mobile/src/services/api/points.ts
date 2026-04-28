import { getApiClient, shouldUseMocks } from './client';

export interface PointsHistoryEntry {
  id: string;
  time: string;
  direction: 'in' | 'out';
  amount: number;
  productName: string;
  storeName: string;
  operator: string;
  source: string;
  note: string;
}

export async function fetchPointsHistory(
  limit = 50,
): Promise<PointsHistoryEntry[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<PointsHistoryEntry[]>(
    `/api/mobile/points/history?limit=${limit}`,
  );
}
