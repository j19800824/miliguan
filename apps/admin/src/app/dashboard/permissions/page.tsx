import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { permissionsConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getPermissionStats, listPermissions } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 权限管理'
};

export default async function PermissionsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(permissionsConfig.viewPermission);
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const level = Array.isArray(params.level) ? params.level[0] : params.level ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listPermissions({ search, level, page, pageSize });
  const stats = await getPermissionStats();
  const metrics = [
    { label: '权限点总数', value: `${stats.total}`, hint: '已建档的菜单、页面和数据权限' },
    { label: '按钮权限', value: `${stats.actionCount}`, hint: '用于控制操作按钮显隐' },
    { label: '数据权限', value: `${stats.dataScope}`, hint: '用于控制数据可见范围' }
  ];

  return (
    <ManagementListPage
      config={permissionsConfig}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={level}
      metrics={metrics}
      canWrite={hasPermission(user, permissionsConfig.writePermission)}
    />
  );
}
