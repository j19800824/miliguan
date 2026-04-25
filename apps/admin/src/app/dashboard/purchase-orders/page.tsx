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

export default async function PurchaseOrdersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const user = await requirePermission('purchase-orders:view');
  const companyOptions = await getCompanyOptions(user);
  const skuOptions = await getProductSkuOptions();
  const config = createPurchaseOrdersConfig(companyOptions, skuOptions);
  const result = await listPurchaseOrders({ search, status, page, pageSize, user });
  const stats = await getPurchaseOrderStats(user);
  const metrics = [
    { label: '订货单总数', value: `${stats.total}`, hint: '总公司供货到分公司的订货单总数' },
    { label: '待审核', value: `${stats.pending}`, hint: '分公司订货额不足或异常的待审核订货单' },
    { label: '已入库', value: `${stats.received}`, hint: '已完成入库并进入库存的订货单数量' }
  ];

  return (
    <ManagementListPage
      config={config}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={status}
      metrics={metrics}
      canWrite={hasPermission(user, config.writePermission)}
    />
  );
}
