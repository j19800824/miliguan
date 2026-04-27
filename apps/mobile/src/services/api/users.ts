import { MOCK_USERS, type MockUser } from '../../data/mock';
import { shouldUseMocks } from './client';

export type User = MockUser;

/**
 * Returns mock users only — used by LoginScreen role-picker in dev mode.
 * In real mode the user list isn't exposed to the app; the user authenticates
 * with credentials via the auth service instead.
 */
export async function fetchUsers(): Promise<User[]> {
  if (shouldUseMocks()) return MOCK_USERS;
  return [];
}
