import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { RedeemManager } from '@/features/admin/components/redeem-manager';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listRedeemItems, listRedeemOrders } from '@/lib/database.js';
import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - 积分兑换'
};

export default async function RedeemPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('settings:view');
  const params = await searchParams;
  const itemsPage = Number(Array.isArray(params.itemsPage) ? params.itemsPage[0] : params.itemsPage ?? '1');
  const ordersPage = Number(Array.isArray(params.ordersPage) ? params.ordersPage[0] : params.ordersPage ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const itemsResult = await listRedeemItems({ page: itemsPage, pageSize });
  const ordersResult = await listRedeemOrders({ page: ordersPage, pageSize });
  const items = itemsResult.rows;
  const orders = ordersResult.rows;

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
            <ClientPaginatedTable
              headers={['商品名称', '编码', '积分成本', '库存', '状态', '说明']}
              emptyMessage='暂无兑换商品'
              total={itemsResult.total}
              page={itemsResult.page}
              pageSize={itemsResult.pageSize}
              pageParamName='itemsPage'
              rows={items.map((row: (typeof items)[number]) => (
                <TableRow key={row.id}>
                  <TableCell>{row.item_name}</TableCell>
                  <TableCell>{row.item_code}</TableCell>
                  <TableCell>{row.points_cost}</TableCell>
                  <TableCell>{row.stock}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>{row.description}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>兑换订单</CardTitle>
            <CardDescription>查看会员积分兑换结果与状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['订单号', '兑换商品', '会员', '手机号', '积分消耗', '状态']}
              emptyMessage='暂无兑换订单'
              total={ordersResult.total}
              page={ordersResult.page}
              pageSize={ordersResult.pageSize}
              pageParamName='ordersPage'
              rows={orders.map((row: (typeof orders)[number]) => (
                <TableRow key={row.id}>
                  <TableCell>{row.order_no}</TableCell>
                  <TableCell>{row.item_name}</TableCell>
                  <TableCell>{row.member_name}</TableCell>
                  <TableCell>{row.member_phone}</TableCell>
                  <TableCell>{row.points_cost}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
