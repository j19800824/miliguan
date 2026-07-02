import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { createStaffConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getCompanyOptions, getRoleOptions, getStaffStats, getStoreOptions, listAdminStaff } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 后台员工管理'
};

export default async function StaffPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const role = Array.isArray(params.role) ? params.role[0] : params.role ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const roleOptions = await getRoleOptions();
  const config = createStaffConfig(roleOptions);
  const user = await requirePermission(config.viewPermission);
  const companyOptions = await getCompanyOptions(user);
  const storeOptions = await getStoreOptions('all', user);
  const scopedConfig = createStaffConfig(roleOptions, companyOptions, storeOptions);
  const result = await listAdminStaff({ search, role, page, pageSize, user });
  const stats = await getStaffStats(user);
  const metrics = [
    { label: '后台员工', value: `${stats.total}`, hint: '后台账号总数' },
    { label: '在职员工', value: `${stats.active}`, hint: '当前正常在岗人员' },
    { label: '试用中', value: `${stats.pending}`, hint: '待进一步确认权限的员工' }
  ];

  return (
    <ManagementListPage
      config={scopedConfig}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={role}
      metrics={metrics}
      canWrite={hasPermission(user, config.writePermission)}
      currentUserId={user.id}
    />
  );
}
