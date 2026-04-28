import { MOCK_BRANCHES } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Branch = (typeof MOCK_BRANCHES)[number];

export async function fetchBranches(): Promise<Branch[]> {
  if (shouldUseMocks()) return MOCK_BRANCHES;
  return getApiClient()<Branch[]>('/api/mobile/branches');
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
  availableQuota: number;
  totalQuota: number;
  storeCount: number;
  salesLast30: number;
  inventoryQty: number;
  lowStockCount: number;
}

export async function fetchBranchSummary(id: string): Promise<BranchSummary> {
  if (shouldUseMocks()) {
    return {
      id,
      name: 'MOCK 分公司',
      code: 'MOCK',
      availableQuota: 0,
      totalQuota: 0,
      storeCount: 0,
      salesLast30: 0,
      inventoryQty: 0,
      lowStockCount: 0,
    };
  }
  return getApiClient()<BranchSummary>(`/api/mobile/branches/${id}`);
}
