import { getApiClient, shouldUseMocks } from './client';

export interface TodayStats {
  storeVerifyCount: number;
  myVerifyCount: number;
  todayPoints: number;
  totalPoints: number;
}

export async function fetchTodayStats(): Promise<TodayStats> {
  if (shouldUseMocks()) {
    return { storeVerifyCount: 0, myVerifyCount: 0, todayPoints: 0, totalPoints: 0 };
  }
  return getApiClient()<TodayStats>('/api/mobile/today-stats');
}
