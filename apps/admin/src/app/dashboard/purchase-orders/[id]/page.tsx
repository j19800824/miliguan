import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { TableCell, TableRow } from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getPurchaseOrderDetail } from '@/lib/database.js';
import { PurchaseOrderApproveActions } from '@/features/admin/components/purchase-order-approve-actions';
import { PurchaseOrderReceiveActions } from '@/features/admin/components/purchase-order-receive-actions';
import { PurchaseOrderRefundActions } from '@/features/admin/components/purchase-order-refund-actions';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - 订货单详情'
};

export default async function PurchaseOrderDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('purchase-orders:view');
  const { id } = await params;
  const paramsState = await searchParams;
  const pageSize = Number(Array.isArray(paramsState.pageSize) ? paramsState.pageSize[0] : paramsState.pageSize ?? '10');
  const order = await getPurchaseOrderDetail(id, {
    itemsPage: Number(Array.isArray(paramsState.itemsPage) ? paramsState.itemsPage[0] : paramsState.itemsPage ?? '1'),
    approvalsPage: Number(Array.isArray(paramsState.approvalsPage) ? paramsState.approvalsPage[0] : paramsState.approvalsPage ?? '1'),
    pageSize
  }, user);

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
      pageDescription='查看订货额扣减、入库状态和审核流转。'
      pageHeaderAction={
        <div className='flex gap-2'>
          {order.approval_status === '待审核' && order.delete_status !== '已删除' ? (
            <PurchaseOrderApproveActions
              orderId={order.id}
              disabled={!hasPermission(user, 'purchase-orders:approve')}
            />
          ) : null}
          {order.approval_status !== '待审核' && !order.stock_received && order.status !== '已驳回' && order.delete_status !== '已删除' ? (
            <PurchaseOrderReceiveActions
              orderId={order.id}
              disabled={!hasPermission(user, 'purchase-orders:edit')}
            />
          ) : null}
          {order.stock_received && order.status !== '已退货' && order.delete_status !== '已删除' ? (
            <PurchaseOrderRefundActions
              orderId={order.id}
              disabled={!hasPermission(user, 'purchase-orders:edit')}
            />
          ) : null}
        </div>
      }
    >
      <div className='space-y-4'>
        {order.delete_status === '已删除' ? (
          <div className='flex justify-start'>
            <Badge variant='destructive'>已删除</Badge>
          </div>
        ) : null}
        <div className='grid gap-4 lg:grid-cols-5'>
          <Card><CardHeader><CardDescription>分公司</CardDescription><CardTitle>{order.company_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>状态</CardDescription><CardTitle><StatusBadge status={order.status} /></CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>审核状态</CardDescription><CardTitle><StatusBadge status={order.approval_status} /></CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>订货额消耗</CardDescription><CardTitle>{order.order_quota_total}</CardTitle></CardHeader></Card>
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
            <CardDescription>当前按 SKU 维度记录订货数量和订货额单价。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['商品名称', 'SKU', '规格', '数量', '订货额单价', '小计订货额']}
              emptyMessage='暂无订货明细'
              total={order.items.total}
              page={order.items.page}
              pageSize={order.items.pageSize}
              pageParamName='itemsPage'
              rows={order.items.rows.map((item: (typeof order.items.rows)[number], index: number) => (
                <TableRow key={`${item.id}-${item.sku_code}-${index}`}>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell>{item.sku_code}</TableCell>
                  <TableCell>{item.spec}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.order_quota_unit_price}</TableCell>
                  <TableCell>{item.subtotal_order_quota}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>审核与流转记录</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['动作', '结果', '说明', '操作人', '时间']}
              emptyMessage='暂无审核与流转记录'
              total={order.approvals.total}
              page={order.approvals.page}
              pageSize={order.approvals.pageSize}
              pageParamName='approvalsPage'
              rows={order.approvals.rows.map((item: (typeof order.approvals.rows)[number], index: number) => (
                <TableRow key={`${item.action}-${index}`}>
                  <TableCell>{item.action}</TableCell>
                  <TableCell><StatusBadge status={item.result} /></TableCell>
                  <TableCell>{item.note}</TableCell>
                  <TableCell>{item.created_by}</TableCell>
                  <TableCell>{item.created_at}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
