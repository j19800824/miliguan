import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { companiesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getCompanyStats, listCompanies } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 分公司管理'
};

export default async function CompaniesPage() {
  const user = await requirePermission(companiesConfig.viewPermission);
  const rows = await listCompanies();
  const stats = await getCompanyStats();
  const metrics = [
    { label: '分公司总数', value: `${stats.total}`, hint: '总部当前纳管的分公司数量' },
    { label: '启用分公司', value: `${stats.active}`, hint: '正在参与订货和经营流转的分公司' },
    { label: '门店总数', value: `${stats.storeCount}`, hint: '所有分公司下属社区门店数量' }
  ];

  return (
    <ManagementListPage
      config={companiesConfig}
      rows={rows}
      metrics={metrics}
      canWrite={hasPermission(user, companiesConfig.writePermission)}
    />
  );
}
