import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RedeemManager } from '@/features/admin/components/redeem-manager';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listRedeemItems, listRedeemOrders } from '@/lib/database.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const metadata = {
  title: '米粒冠后台 - 积分兑换'
};

export default async function RedeemPage() {
  const user = await requirePermission('settings:view');
  const items = await listRedeemItems();
  const orders = await listRedeemOrders();

  return (
    <PageContainer
      pageTitle='积分兑换'
      pageDescription='提供一期轻量积分兑换能力，维护兑换商品和兑换订单。'
      pageHeaderAction={<RedeemManager canEdit={hasPermission(user, 'settings:view')} />}
    >
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>兑换商品</CardTitle>
            <CardDescription>维护可兑换商品、积分成本和库存。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader><TableRow><TableHead>商品名称</TableHead><TableHead>编码</TableHead><TableHead>积分成本</TableHead><TableHead>库存</TableHead><TableHead>状态</TableHead><TableHead>说明</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.map((row: (typeof items)[number]) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.item_name}</TableCell>
                      <TableCell>{row.item_code}</TableCell>
                      <TableCell>{row.points_cost}</TableCell>
                      <TableCell>{row.stock}</TableCell>
                      <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                      <TableCell>{row.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>兑换订单</CardTitle>
            <CardDescription>查看会员积分兑换结果与状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader><TableRow><TableHead>订单号</TableHead><TableHead>兑换商品</TableHead><TableHead>会员</TableHead><TableHead>手机号</TableHead><TableHead>积分消耗</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                <TableBody>
                  {orders.map((row: (typeof orders)[number]) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.order_no}</TableCell>
                      <TableCell>{row.item_name}</TableCell>
                      <TableCell>{row.member_name}</TableCell>
                      <TableCell>{row.member_phone}</TableCell>
                      <TableCell>{row.points_cost}</TableCell>
                      <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
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
