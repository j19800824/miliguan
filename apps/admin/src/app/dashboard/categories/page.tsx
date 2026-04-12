import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { categoriesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listProductCategories } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 分类管理'
};

export default async function CategoriesPage() {
  const user = await requirePermission(categoriesConfig.viewPermission);
  const rows = await listProductCategories();
  const pageConfig = { ...categoriesConfig, description: '' };

  return (
    <ManagementListPage
      config={pageConfig}
      rows={rows}
      metrics={[]}
      listDescription=''
      canWrite={hasPermission(user, categoriesConfig.writePermission)}
    />
  );
}
