import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getCompanyOptions, getStaffDetail, getStoreOptions } from '@/lib/database.js';
import { StaffOrganizationActions } from '@/features/admin/components/staff-organization-actions';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - 员工详情'
};

export default async function StaffDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('staff:view');
  const { id } = await params;
  const staff = await getStaffDetail(id);

  if (!staff) {
    return (
      <PageContainer pageTitle='员工详情' pageDescription='未找到该员工'>
        <Card><CardContent className='py-10 text-center text-sm text-muted-foreground'>该员工不存在。</CardContent></Card>
      </PageContainer>
    );
  }

  const companyOptions = await getCompanyOptions();
  const storeOptions = await getStoreOptions(staff.company_id || 'all');

  return (
    <PageContainer pageTitle={`${staff.name} / 员工详情`} pageDescription='查看员工角色、组织关系、门店绑定和销售归属配置。'>
      <div className='space-y-4'>
        {staff.delete_status === '已删除' ? (
          <div className='flex justify-start'>
            <Badge variant='destructive'>已删除</Badge>
          </div>
        ) : null}
        <div className='grid gap-4 lg:grid-cols-4'>
          <Card><CardHeader><CardDescription>登录账号</CardDescription><CardTitle>{staff.account}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>岗位角色</CardDescription><CardTitle>{staff.role_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>状态</CardDescription><CardTitle><StatusBadge status={staff.status} /></CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>最近登录</CardDescription><CardTitle>{staff.last_login}</CardTitle></CardHeader></Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>员工信息</CardTitle>
              <CardDescription>后台账号、联系方式和归属部门。</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div>姓名：{staff.name}</div>
              <div>部门：{staff.department}</div>
              <div>手机号：{staff.phone}</div>
              <div>邮箱：{staff.email}</div>
              <div>当前绑定分公司：{staff.company_name}</div>
              <div>当前绑定门店：{staff.store_name}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>组织 / 门店绑定</CardTitle>
              <CardDescription>建立员工、分公司、门店与销售记录之间的关系。</CardDescription>
            </CardHeader>
            <CardContent>
              <StaffOrganizationActions
                staffId={staff.id}
                companyOptions={companyOptions}
                storeOptions={storeOptions}
                initialCompanyId={staff.company_id}
                initialStoreId={staff.store_id}
                canEdit={hasPermission(user, 'staff:edit') && staff.delete_status !== '已删除'}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
