import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { createPurchaseOrdersConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import {
  getCompanyOptions,
  getProductSkuOptions,
  getPurchaseOrderStats,
  listPurchaseOrders
} from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 订货单管理'
};

export default async function PurchaseOrdersPage() {
  const companyOptions = await getCompanyOptions();
  const skuOptions = await getProductSkuOptions();
  const config = createPurchaseOrdersConfig(companyOptions, skuOptions);
  const user = await requirePermission(config.viewPermission);
  const rows = await listPurchaseOrders();
  const stats = await getPurchaseOrderStats();
  const metrics = [
    { label: '订货单总数', value: `${stats.total}`, hint: '总公司供货到分公司的订货单总数' },
    { label: '待审核', value: `${stats.pending}`, hint: '分公司积分不足或异常的待审核订货单' },
    { label: '已入库', value: `${stats.received}`, hint: '已完成入库并进入库存的订货单数量' }
  ];

  return (
    <ManagementListPage
      config={config}
      rows={rows}
      metrics={metrics}
      canWrite={hasPermission(user, config.writePermission)}
    />
  );
}
