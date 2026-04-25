import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { TableCell, TableRow } from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getMemberOrderDetail } from '@/lib/database.js';
import { MemberOrderHandleActions } from '@/features/admin/components/member-order-handle-actions';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - 散客订单详情'
};

export default async function MemberOrderDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('member-orders:view');
  const { id } = await params;
  const paramsState = await searchParams;
  const pageSize = Number(Array.isArray(paramsState.pageSize) ? paramsState.pageSize[0] : paramsState.pageSize ?? '10');
  const order = await getMemberOrderDetail(id, {
    itemsPage: Number(Array.isArray(paramsState.itemsPage) ? paramsState.itemsPage[0] : paramsState.itemsPage ?? '1'),
    writeoffsPage: Number(Array.isArray(paramsState.writeoffsPage) ? paramsState.writeoffsPage[0] : paramsState.writeoffsPage ?? '1'),
    logsPage: Number(Array.isArray(paramsState.logsPage) ? paramsState.logsPage[0] : paramsState.logsPage ?? '1'),
    pageSize
  }, user);

  if (!order) {
    return (
      <PageContainer pageTitle='散客订单详情' pageDescription='未找到该订单'>
        <Card><CardContent className='py-10 text-center text-sm text-muted-foreground'>该订单不存在。</CardContent></Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`${order.order_no} / 散客订单详情`}
      pageDescription='查看销售归属、核销记录和库存影响。'
      pageHeaderAction={
        <MemberOrderHandleActions
          orderId={order.id}
          status={order.status}
          canHandle={hasPermission(user, 'member-orders:handle') && order.delete_status !== '已删除'}
          orderQuotaReturned={order.order_quota_returned}
        />
      }
    >
      <div className='space-y-4'>
        {order.delete_status === '已删除' ? (
          <div className='flex justify-start'>
            <Badge variant='destructive'>已删除</Badge>
          </div>
        ) : null}
        <div className='grid gap-4 lg:grid-cols-6'>
          <Card><CardHeader><CardDescription>分公司</CardDescription><CardTitle>{order.company_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>门店</CardDescription><CardTitle>{order.store_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>顾客类型</CardDescription><CardTitle>{order.customer_type}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>顾客</CardDescription><CardTitle>{order.member_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>销售归属</CardDescription><CardTitle>{order.sales_staff_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>订单状态</CardDescription><CardTitle><StatusBadge status={order.status} /></CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>订单摘要</CardTitle>
            <CardDescription>关联订货单：{order.purchase_order_no ?? '未关联'}；顾客：{order.member_name}；手机号：{order.member_phone || '未填写'}</CardDescription>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            成交金额：{order.total_amount}，库存扣减：{order.stock_deducted ? '已完成' : '未完成'}，订货额度回补：{order.order_quota_returned ? '已完成' : '未回补'}，创建时间：{order.created_at}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>商品明细</CardTitle>
            <CardDescription>散客订单产生后按明细记录商品、金额和核销状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['商品名称', 'SKU', '规格', '数量', '单价', '订货额回弹基数', '核销状态']}
              emptyMessage='暂无商品明细'
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
                  <TableCell>{item.unit_price}</TableCell>
                  <TableCell>{item.point_rebate_base}</TableCell>
                  <TableCell><StatusBadge status={item.writeoff_status} /></TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>核销记录</CardTitle>
            <CardDescription>核销记录归属于散客订单，用于库存扣减和销售追踪。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['商品', 'SKU', '门店', '销售员工', '商品码', '状态', '核销时间']}
              emptyMessage='暂无核销记录'
              total={order.writeoffs.total}
              page={order.writeoffs.page}
              pageSize={order.writeoffs.pageSize}
              pageParamName='writeoffsPage'
              rows={order.writeoffs.rows.map((item: (typeof order.writeoffs.rows)[number], index: number) => (
                <TableRow key={`${item.id}-${item.writeoff_time}-${index}`}>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell>{item.sku_code}</TableCell>
                  <TableCell>{item.store_name}</TableCell>
                  <TableCell>{item.sales_staff_name}</TableCell>
                  <TableCell>{item.product_code}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell>{item.writeoff_time}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>处理记录</CardTitle>
            <CardDescription>散客订单异常处理、人工核销等动作会记录在这里。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['动作', '结果', '说明', '操作人', '时间']}
              emptyMessage='暂无处理记录'
              total={order.logs.total}
              page={order.logs.page}
              pageSize={order.logs.pageSize}
              pageParamName='logsPage'
              rows={order.logs.rows.map((item: (typeof order.logs.rows)[number]) => (
                <TableRow key={`${item.action}-${item.created_at}`}>
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
