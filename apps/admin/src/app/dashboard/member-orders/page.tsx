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
  title: '米粒冠后台 - 会员订单管理'
};

export default async function MemberOrdersPage() {
  const companyOptions = await getCompanyOptions();
  const storeOptions = await getStoreOptions();
  const skuOptions = await getProductSkuOptions();
  const purchaseOrderOptions = await getPurchaseOrderOptions();
  const config = createMemberOrdersConfig(
    companyOptions,
    storeOptions,
    skuOptions,
    purchaseOrderOptions
  );
  const user = await requirePermission(config.viewPermission);
  const rows = await listMemberOrders();
  const stats = await getMemberOrderStats();
  const metrics = [
    { label: '会员订单总数', value: `${stats.total}`, hint: '门店面向会员产生的订单记录' },
    { label: '已核销', value: `${stats.writeoff}`, hint: '已成功核销并扣减库存的订单数量' },
    { label: '异常订单', value: `${stats.abnormal}`, hint: '需要人工跟进处理的会员订单' }
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
