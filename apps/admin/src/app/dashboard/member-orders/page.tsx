import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { createMemberOrdersConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import {
  getCompanyOptions,
  getMemberOrderStats,
  getProductSkuOptions,
  getPurchaseOrderOptions,
  getStoreOptions,
  listMemberOrders
} from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 散客订单管理'
};

export default async function MemberOrdersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const user = await requirePermission('member-orders:view');
  const companyOptions = await getCompanyOptions(user);
  const storeOptions = await getStoreOptions(undefined, user);
  const skuOptions = await getProductSkuOptions();
  const purchaseOrderOptions = await getPurchaseOrderOptions(user);
  const config = createMemberOrdersConfig(
    companyOptions,
    storeOptions,
    skuOptions,
    purchaseOrderOptions
  );
  const result = await listMemberOrders({ search, status, page, pageSize, user });
  const stats = await getMemberOrderStats(user);
  const metrics = [
    { label: '散客订单总数', value: `${stats.total}`, hint: '门店收银直接核销产生的订单记录' },
    { label: '已核销', value: `${stats.writeoff}`, hint: '已成功核销并扣减库存的订单数量' },
    { label: '异常订单', value: `${stats.abnormal}`, hint: '需要人工跟进处理的散客订单' }
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
