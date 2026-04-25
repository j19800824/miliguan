import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { rolesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getRoleStats, listRoles } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 角色管理'
};

export default async function RolesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(rolesConfig.viewPermission);
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const scope = Array.isArray(params.scope) ? params.scope[0] : params.scope ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listRoles({ search, scope, page, pageSize });
  const stats = await getRoleStats();
  const metrics = [
    { label: '角色总数', value: `${stats.total}`, hint: '当前已建立的角色模板' },
    { label: '启用角色', value: `${stats.active}`, hint: '已生效的角色数量' },
    { label: '草稿角色', value: `${stats.draft}`, hint: '仍在配置中的角色' }
  ];

  return (
    <ManagementListPage
      config={rolesConfig}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={scope}
      metrics={metrics}
      canWrite={hasPermission(user, rolesConfig.writePermission)}
      canGrant={hasPermission(user, 'roles:grant')}
    />
  );
}
