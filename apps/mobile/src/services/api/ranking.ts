import { MOCK_RANKING_DAILY } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type RankingPeriod = 'daily' | 'weekly' | 'monthly';
export type RankingEntry = (typeof MOCK_RANKING_DAILY)[number];

export async function fetchRanking(
  period: RankingPeriod = 'daily',
): Promise<RankingEntry[]> {
  if (shouldUseMocks()) return MOCK_RANKING_DAILY;
  return getApiClient()<RankingEntry[]>(`/ranking?period=${period}`);
}
