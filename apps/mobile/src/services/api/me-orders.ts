import { getApiClient, shouldUseMocks } from './client';

export interface MeOrderRow {
  id: string;
  orderNo: string;
  storeName: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export async function fetchMyOrders(): Promise<MeOrderRow[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<MeOrderRow[]>('/api/mobile/me/orders');
}
