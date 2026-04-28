import { MOCK_STORES } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type StoreItem = (typeof MOCK_STORES)[number];

export async function fetchStores(): Promise<StoreItem[]> {
  if (shouldUseMocks()) return MOCK_STORES;
  return getApiClient()<StoreItem[]>('/api/mobile/stores');
}

export interface StoreSummary {
  id: string;
  companyId: string;
  name: string;
  managerName: string;
  managerPhone: string;
  address: string;
  todayVerifyCount: number;
  skuCount: number;
  lowStockCount: number;
}

export async function fetchStoreSummary(id: string): Promise<StoreSummary> {
  if (shouldUseMocks()) {
    return {
      id,
      companyId: '',
      name: 'MOCK 门店',
      managerName: '',
      managerPhone: '',
      address: '',
      todayVerifyCount: 0,
      skuCount: 0,
      lowStockCount: 0,
    };
  }
  return getApiClient()<StoreSummary>(`/api/mobile/stores/${id}`);
}
