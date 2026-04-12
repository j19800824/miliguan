import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { permissionsConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getPermissionStats, listPermissions } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 权限管理'
};

export default async function PermissionsPage() {
  const user = await requirePermission(permissionsConfig.viewPermission);
  const rows = await listPermissions();
  const stats = await getPermissionStats();
  const metrics = [
    { label: '权限点总数', value: `${stats.total}`, hint: '已建档的菜单、页面和数据权限' },
    { label: '按钮权限', value: `${stats.actionCount}`, hint: '用于控制操作按钮显隐' },
    { label: '数据权限', value: `${stats.dataScope}`, hint: '用于控制数据可见范围' }
  ];

  return (
    <ManagementListPage
      config={permissionsConfig}
      rows={rows}
      metrics={metrics}
      canWrite={hasPermission(user, permissionsConfig.writePermission)}
    />
  );
}
