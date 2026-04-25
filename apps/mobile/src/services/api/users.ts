import { MOCK_USERS, type MockUser } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type User = MockUser;

export async function fetchUsers(): Promise<User[]> {
  if (shouldUseMocks()) return MOCK_USERS;
  return getApiClient()<User[]>('/users');
}
