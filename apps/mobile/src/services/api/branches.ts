import { MOCK_BRANCHES } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Branch = (typeof MOCK_BRANCHES)[number];

export async function fetchBranches(): Promise<Branch[]> {
  if (shouldUseMocks()) return MOCK_BRANCHES;
  return getApiClient()<Branch[]>('/api/mobile/branches');
}
