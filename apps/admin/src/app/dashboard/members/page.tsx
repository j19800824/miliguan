import { ManagementListPage } from '@/features/admin/components/management-list-page';
import { membersConfig } from '@/features/admin/data/management-data';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getMemberStats, listMembers } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 会员管理'
};

export default async function MembersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(membersConfig.viewPermission);
  const params = await searchParams;
  const search = Array.isArray(params.search) ? params.search[0] : params.search ?? '';
  const status = Array.isArray(params.status) ? params.status[0] : params.status ?? 'all';
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listMembers({ search, status, page, pageSize });
  const stats = await getMemberStats();
  const metrics = [
    { label: '会员总数', value: `${stats.total}`, hint: '当前数据库中的会员档案数' },
    { label: '活跃会员', value: `${stats.active}`, hint: '最近持续消费的会员' },
    { label: '高价值会员', value: `${stats.highValue}`, hint: '高消费或高复购会员' }
  ];

  return (
    <ManagementListPage
      config={membersConfig}
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      initialSearch={search}
      initialFilter={status}
      metrics={metrics}
      canWrite={hasPermission(user, membersConfig.writePermission)}
    />
  );
}
