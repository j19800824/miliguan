import * as client from '../client';
import { fetchUsers } from '../users';

describe('fetchUsers', () => {
  it('returns mock users when shouldUseMocks() is true', async () => {
    jest.spyOn(client, 'shouldUseMocks').mockReturnValue(true);
    const users = await fetchUsers();
    expect(users.length).toBeGreaterThanOrEqual(4);
    expect(users.map((u) => u.role)).toEqual(
      expect.arrayContaining(['boss', 'branch_gm', 'store_manager', 'sales_staff']),
    );
  });
});
