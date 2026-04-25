import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { storesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getStoreStats, listStores } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 门店管理'
};

export default async function StoresPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(storesConfig.viewPermission);
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listStores({ search, status, page, pageSize, user });
  const stats = await getStoreStats(user);
  const metrics = [
    { label: '门店总数', value: `${stats.total}`, hint: '当前已建档门店数量' },
    { label: '营业中', value: `${stats.active}`, hint: '已开启经营的门店' },
    { label: '待审核', value: `${stats.pending}`, hint: '等待总部审核的门店' }
  ];

  return (
    <ManagementListPage
      config={storesConfig}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={status}
      metrics={metrics}
      canWrite={hasPermission(user, storesConfig.writePermission)}
    />
  );
}
