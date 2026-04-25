import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { createProductsConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getProductCategoryOptions, listProducts } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 商品管理'
};

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const categoryOptions = await getProductCategoryOptions();
  const config = createProductsConfig(categoryOptions);
  const user = await requirePermission(config.viewPermission);
  const result = await listProducts({ search, status, page, pageSize });

  return (
    <ManagementListPage
      config={config}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={status}
      metrics={[]}
      listDescription=''
      dialogDescription='提交后将进入商品审核，审核通过后才会生效。'
      canWrite={hasPermission(user, config.writePermission)}
    />
  );
}
