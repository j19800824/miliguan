import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { createStaffConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getRoleOptions, getStaffStats, listAdminStaff } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 后台员工管理'
};

export default async function StaffPage() {
  const roleOptions = await getRoleOptions();
  const config = createStaffConfig(roleOptions);
  const user = await requirePermission(config.viewPermission);
  const rows = await listAdminStaff();
  const stats = await getStaffStats();
  const metrics = [
    { label: '后台员工', value: `${stats.total}`, hint: '后台账号总数' },
    { label: '在职员工', value: `${stats.active}`, hint: '当前正常在岗人员' },
    { label: '试用中', value: `${stats.pending}`, hint: '待进一步确认权限的员工' }
  ];

  return (
    <ManagementListPage
      config={createStaffConfig(roleOptions)}
      rows={rows}
      metrics={metrics}
      canWrite={hasPermission(user, config.writePermission)}
      currentUserId={user.id}
    />
  );
}
