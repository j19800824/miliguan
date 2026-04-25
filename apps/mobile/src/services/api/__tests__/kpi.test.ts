import * as client from '../client';
import { fetchKpi } from '../kpi';

describe('fetchKpi', () => {
  it('returns mock KPI when in mocks mode', async () => {
    jest.spyOn(client, 'shouldUseMocks').mockReturnValue(true);
    const kpi = await fetchKpi();
    expect(kpi.totalSales).toBeTruthy();
    expect(kpi.totalVerify).toBeTruthy();
  });
});
