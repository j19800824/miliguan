import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { storesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getStoreStats, listStores } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 门店管理'
};

export default async function StoresPage() {
  const user = await requirePermission(storesConfig.viewPermission);
  const rows = await listStores();
  const stats = await getStoreStats();
  const metrics = [
    { label: '门店总数', value: `${stats.total}`, hint: '当前已建档门店数量' },
    { label: '营业中', value: `${stats.active}`, hint: '已开启经营的门店' },
    { label: '待审核', value: `${stats.pending}`, hint: '等待总部审核的门店' }
  ];

  return (
    <ManagementListPage
      config={storesConfig}
      rows={rows}
      metrics={metrics}
      canWrite={hasPermission(user, storesConfig.writePermission)}
    />
  );
}
