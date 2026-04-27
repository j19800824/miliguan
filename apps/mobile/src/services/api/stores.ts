import { MOCK_STORES } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type StoreItem = (typeof MOCK_STORES)[number];

export async function fetchStores(): Promise<StoreItem[]> {
  if (shouldUseMocks()) return MOCK_STORES;
  return getApiClient()<StoreItem[]>('/api/mobile/stores');
}
