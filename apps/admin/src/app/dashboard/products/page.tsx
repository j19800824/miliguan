import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { createProductsConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getProductCategoryOptions, listProducts } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 商品管理'
};

export default async function ProductsPage() {
  const categoryOptions = await getProductCategoryOptions();
  const config = createProductsConfig(categoryOptions);
  const user = await requirePermission(config.viewPermission);
  const rows = await listProducts();

  return (
    <ManagementListPage
      config={config}
      rows={rows}
      metrics={[]}
      listDescription=''
      dialogDescription='提交后将进入商品审核，审核通过后才会生效。'
      canWrite={hasPermission(user, config.writePermission)}
    />
  );
}
