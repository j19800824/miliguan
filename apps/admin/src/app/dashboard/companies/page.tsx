import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { CompanyOrderQuotaActions } from '@/features/admin/components/company-order-quota-actions';
import { createCompaniesConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { isHeadquartersUser } from '@/lib/auth/shared';
import { getCompanyLevelOptions, getCompanyOptions, getCompanyStats, listCompanies } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 分公司管理'
};

export default async function CompaniesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const user = await requirePermission('companies:view');
  const levelOptions = await getCompanyLevelOptions();
  const companyOptions = await getCompanyOptions(user);
  const config = createCompaniesConfig(levelOptions);
  const result = await listCompanies({ search, status, page, pageSize, user });
  const stats = await getCompanyStats(user);
  const metrics = [
    { label: '分公司总数', value: `${stats.total}`, hint: '总部当前纳管的分公司数量' },
    { label: '启用分公司', value: `${stats.active}`, hint: '正在参与订货和经营流转的分公司' },
    { label: '门店总数', value: `${stats.storeCount}`, hint: '所有分公司下属社区门店数量' }
  ];

  return (
    <ManagementListPage
      config={config}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={status}
      metrics={metrics}
      canWrite={hasPermission(user, config.writePermission)}
      extraPageHeaderAction={
        <CompanyOrderQuotaActions
          canEditOrderQuota={isHeadquartersUser(user) && hasPermission(user, 'order-quota:edit')}
          companyOptions={companyOptions}
          levelOptions={levelOptions}
        />
      }
    />
  );
}
