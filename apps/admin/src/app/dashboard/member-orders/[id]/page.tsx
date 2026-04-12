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
import { getMemberOrderDetail } from '@/lib/database.js';
import { MemberOrderHandleActions } from '@/features/admin/components/member-order-handle-actions';

export const metadata = {
  title: '米粒冠后台 - 会员订单详情'
};

export default async function MemberOrderDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('member-orders:view');
  const { id } = await params;
  const order = await getMemberOrderDetail(id);

  if (!order) {
    return (
      <PageContainer pageTitle='会员订单详情' pageDescription='未找到该订单'>
        <Card><CardContent className='py-10 text-center text-sm text-muted-foreground'>该会员订单不存在。</CardContent></Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`${order.order_no} / 会员订单详情`}
      pageDescription='查看销售归属、核销记录和库存影响。'
      pageHeaderAction={
        <MemberOrderHandleActions
          orderId={order.id}
          status={order.status}
          canHandle={hasPermission(user, 'member-orders:handle')}
        />
      }
    >
      <div className='space-y-4'>
        <div className='grid gap-4 lg:grid-cols-5'>
          <Card><CardHeader><CardDescription>分公司</CardDescription><CardTitle>{order.company_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>门店</CardDescription><CardTitle>{order.store_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>会员</CardDescription><CardTitle>{order.member_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>销售归属</CardDescription><CardTitle>{order.sales_staff_name}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>订单状态</CardDescription><CardTitle><Badge variant='outline'>{order.status}</Badge></CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>订单摘要</CardTitle>
            <CardDescription>关联订货单：{order.purchase_order_no ?? '未关联'}；手机号：{order.member_phone}</CardDescription>
          </CardHeader>
          <CardContent className='text-sm text-muted-foreground'>
            成交金额：{order.total_amount}，库存扣减：{order.stock_deducted ? '已完成' : '未完成'}，创建时间：{order.created_at}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>商品明细</CardTitle>
            <CardDescription>会员订单产生后按明细记录商品、金额和核销状态。</CardDescription>
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
                    <TableHead>单价</TableHead>
                    <TableHead>积分回调基数</TableHead>
                    <TableHead>核销状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item: (typeof order.items)[number]) => (
                    <TableRow key={`${item.sku_code}-${item.spec}`}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.sku_code}</TableCell>
                      <TableCell>{item.spec}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.unit_price}</TableCell>
                      <TableCell>{item.point_rebate_base}</TableCell>
                      <TableCell><Badge variant='outline'>{item.writeoff_status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>核销记录</CardTitle>
            <CardDescription>核销记录归属于会员订单，用于库存扣减和销售追踪。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead>销售员工</TableHead>
                    <TableHead>商品码</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>核销时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.writeoffs.map((item: (typeof order.writeoffs)[number]) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.sku_code}</TableCell>
                      <TableCell>{item.store_name}</TableCell>
                      <TableCell>{item.sales_staff_name}</TableCell>
                      <TableCell>{item.product_code}</TableCell>
                      <TableCell><Badge variant='outline'>{item.status}</Badge></TableCell>
                      <TableCell>{item.writeoff_time}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>处理记录</CardTitle>
            <CardDescription>会员订单异常处理、人工核销等动作会记录在这里。</CardDescription>
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
                  {order.logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className='text-center text-sm text-muted-foreground'>
                        暂无处理记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    order.logs.map((item: (typeof order.logs)[number]) => (
                      <TableRow key={`${item.action}-${item.created_at}`}>
                        <TableCell>{item.action}</TableCell>
                        <TableCell><Badge variant='outline'>{item.result}</Badge></TableCell>
                        <TableCell>{item.note}</TableCell>
                        <TableCell>{item.created_by}</TableCell>
                        <TableCell>{item.created_at}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
