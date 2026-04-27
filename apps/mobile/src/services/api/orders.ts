import { MOCK_ORDERS } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Order = (typeof MOCK_ORDERS)[number];

export async function fetchOrders(): Promise<Order[]> {
  if (shouldUseMocks()) return MOCK_ORDERS;
  return getApiClient()<Order[]>('/api/mobile/orders');
}
