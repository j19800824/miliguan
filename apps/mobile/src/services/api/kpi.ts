import { MOCK_KPI } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Kpi = typeof MOCK_KPI;

export async function fetchKpi(): Promise<Kpi> {
  if (shouldUseMocks()) return MOCK_KPI;
  return getApiClient()<Kpi>('/kpi/overview');
}
