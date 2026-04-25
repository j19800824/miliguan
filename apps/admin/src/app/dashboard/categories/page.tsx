import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { categoriesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listProductCategories } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 分类管理'
};

export default async function CategoriesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(categoriesConfig.viewPermission);
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listProductCategories({ search, status, page, pageSize });
  const pageConfig = { ...categoriesConfig, description: '' };

  return (
    <ManagementListPage
      config={pageConfig}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={status}
      metrics={[]}
      listDescription=''
      canWrite={hasPermission(user, categoriesConfig.writePermission)}
    />
  );
}
