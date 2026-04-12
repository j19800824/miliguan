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
import { getPurchaseOrderDetail } from '@/lib/database.js';
import { PurchaseOrderApproveActions } from '@/features/admin/components/purchase-order-approve-actions';

export const metadata = {
  title: '米粒冠后台 - 订货单详情'
};

export default async function PurchaseOrderDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('purchase-orders:view');
  const { id } = await params;
  const order = await getPurchaseOrderDetail(id);

  if (!order) {
    return (
      <PageContainer pageTitle='订货单详情' pageDescription='未找到该订货单'>
        <Card><CardContent className='py-10 text-center text-sm text-muted-foreground'>该订货单不存在。</CardContent></Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`${order.order_no} / 订货单详情`}
      pageDescription='查看积分扣减、入库状态和审核流转。'
      pageHeaderAction={
        order.approval_status === '待审核' ? (
          <PurchaseOrderApproveActions
            orderId={order.id}
            disabled={!hasPermission(user, 'purchase-orders:approve')}
          />
        ) : null
      }
    >
      <div className='space-y-4'>
        <div className='grid gap-4 lg:grid-cols-5'>
          <Card><CardHeader><CardDescription>分公司</CardDescription><CardTitle>{order.company_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>状态</CardDescription><CardTitle><Badge variant='outline'>{order.status}</Badge></CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>审核状态</CardDescription><CardTitle><Badge variant='outline'>{order.approval_status}</Badge></CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>积分消耗</CardDescription><CardTitle>{order.points_total}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>库存入库</CardDescription><CardTitle>{order.stock_received ? '已入库' : '未入库'}</CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>订货备注</CardTitle>
            <CardDescription>{order.remark || '暂无备注'}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>订货明细</CardTitle>
            <CardDescription>当前按 SKU 维度记录订货数量和积分单价。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品名称</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>规格</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>积分单价</TableHead>
                    <TableHead>小计积分</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item: (typeof order.items)[number]) => (
                    <TableRow key={`${item.sku_code}-${item.spec}`}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.sku_code}</TableCell>
                      <TableCell>{item.spec}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.points_unit_price}</TableCell>
                      <TableCell>{item.subtotal_points}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>审核与流转记录</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>动作</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead>操作人</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.approvals.map((item: (typeof order.approvals)[number], index: number) => (
                    <TableRow key={`${item.action}-${index}`}>
                      <TableCell>{item.action}</TableCell>
                      <TableCell><Badge variant='outline'>{item.result}</Badge></TableCell>
                      <TableCell>{item.note}</TableCell>
                      <TableCell>{item.created_by}</TableCell>
                      <TableCell>{item.created_at}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
