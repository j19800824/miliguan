import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getCompanyDetail } from '@/lib/database.js';
import { CompanyDetailActions } from '@/features/admin/components/company-detail-actions';

export const metadata = {
  title: '米粒冠后台 - 分公司详情'
};

export default async function CompanyDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('companies:view');
  const { id } = await params;
  const company = await getCompanyDetail(id);

  if (!company) {
    return (
      <PageContainer pageTitle='分公司详情' pageDescription='未找到该分公司'>
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            该分公司不存在或已被删除，返回 <Link href='/dashboard/companies'>分公司列表</Link> 查看其他记录。
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`${company.name} / 分公司详情`}
      pageDescription='查看门店、库存、订货单和会员订单概况。'
      pageHeaderAction={
        <CompanyDetailActions
          companyId={company.id}
          canEditCompanyStores={hasPermission(user, 'company-stores:edit')}
          canEditPoints={hasPermission(user, 'points:edit')}
        />
      }
    >
      <div className='space-y-4'>
        <div className='grid gap-4 lg:grid-cols-4'>
          <Card><CardHeader><CardDescription>分公司编码</CardDescription><CardTitle>{company.code}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>负责人</CardDescription><CardTitle>{company.manager_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>可用积分</CardDescription><CardTitle>{company.available_points}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>状态</CardDescription><CardTitle><Badge variant='outline'>{company.status}</Badge></CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>分公司说明</CardTitle>
            <CardDescription>{company.notes}</CardDescription>
          </CardHeader>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>门店列表</CardTitle>
              <CardDescription>当前分公司下属社区门店与负责人信息。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>门店名称</TableHead>
                      <TableHead>编码</TableHead>
                      <TableHead>负责人</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.stores.map((row: (typeof company.stores)[number]) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.code}</TableCell>
                        <TableCell>{row.manager_name}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>积分调整申请</CardTitle>
              <CardDescription>总部给分公司增加或扣减积分的历史记录。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>变更类型</TableHead>
                      <TableHead>积分数</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>原因</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.pointAdjustments.map((row: (typeof company.pointAdjustments)[number]) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.change_type}</TableCell>
                        <TableCell>{row.points_amount}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>{row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>库存概况</CardTitle>
            <CardDescription>分公司维度库存，一期不记录门店精细库存。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>规格</TableHead>
                    <TableHead>库存数</TableHead>
                    <TableHead>安全库存</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {company.inventory.map((row: (typeof company.inventory)[number]) => (
                    <TableRow key={`${row.sku_code}-${row.product_name}`}>
                      <TableCell>{row.product_name}</TableCell>
                      <TableCell>{row.sku_code}</TableCell>
                      <TableCell>{row.spec}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell>{row.safety_stock}</TableCell>
                      <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>最近订货单</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订货单号</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>积分消耗</TableHead>
                      <TableHead>审核状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.purchaseOrders.map((row: (typeof company.purchaseOrders)[number]) => (
                      <TableRow key={row.order_no}>
                        <TableCell>{row.order_no}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>{row.points_total}</TableCell>
                        <TableCell>{row.approval_status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近会员订单</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>会员</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.memberOrders.map((row: (typeof company.memberOrders)[number]) => (
                      <TableRow key={row.order_no}>
                        <TableCell>{row.order_no}</TableCell>
                        <TableCell>{row.member_name}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>{row.total_amount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
