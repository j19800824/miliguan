import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { ClientPaginatedItems } from '@/features/admin/components/client-paginated-items';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { requirePermission } from '@/lib/auth/server';
import { getReportsData } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 数据报表'
};

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('reports:view');
  const params = await searchParams;
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const reports = await getReportsData({
    companyRankingPage: Number(Array.isArray(params.companyRankingPage) ? params.companyRankingPage[0] : params.companyRankingPage ?? '1'),
    orderQuotaRankingPage: Number(Array.isArray(params.orderQuotaRankingPage) ? params.orderQuotaRankingPage[0] : params.orderQuotaRankingPage ?? '1'),
    salesTrendPage: Number(Array.isArray(params.salesTrendPage) ? params.salesTrendPage[0] : params.salesTrendPage ?? '1'),
    writeoffTrendPage: Number(Array.isArray(params.writeoffTrendPage) ? params.writeoffTrendPage[0] : params.writeoffTrendPage ?? '1'),
    lowInventoryPage: Number(Array.isArray(params.lowInventoryPage) ? params.lowInventoryPage[0] : params.lowInventoryPage ?? '1'),
    pageSize
  });

  return (
    <PageContainer pageTitle='数据报表' pageDescription='聚合销售、核销、订货额、库存和排行结果，支撑老板与总部运营决策。'>
      <div className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-4'>
          <Card><CardHeader><CardDescription>总销售额</CardDescription><CardTitle>{reports.summary.totalSales}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>总核销量</CardDescription><CardTitle>{reports.summary.totalWriteoffs}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>总订货额消耗</CardDescription><CardTitle>{reports.summary.totalOrderQuotaUsed}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>总库存量</CardDescription><CardTitle>{reports.summary.totalInventory}</CardTitle></CardHeader></Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>分公司经营排名</CardTitle>
              <CardDescription>按散客订单销售额和核销表现查看经营结果。</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientPaginatedTable
                headers={['分公司', '销售额', '核销量', '订货额消耗']}
                emptyMessage='暂无分公司经营排名'
                total={reports.companyRanking.total}
                page={reports.companyRanking.page}
                pageSize={reports.companyRanking.pageSize}
                pageParamName='companyRankingPage'
                rows={reports.companyRanking.rows.map((row: (typeof reports.companyRanking.rows)[number]) => (
                  <TableRow key={row.company_name}>
                    <TableCell>{row.company_name}</TableCell>
                    <TableCell>{row.total_sales}</TableCell>
                    <TableCell>{row.writeoff_count}</TableCell>
                    <TableCell>{row.order_quota_spent}</TableCell>
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>订货额排行</CardTitle>
              <CardDescription>按历史累计订货额度和当前可用订货额查看排行。</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientPaginatedTable
                headers={['分公司', '累计订货额度', '可用订货额']}
                emptyMessage='暂无订货额排行'
                total={reports.orderQuotaRanking.total}
                page={reports.orderQuotaRanking.page}
                pageSize={reports.orderQuotaRanking.pageSize}
                pageParamName='orderQuotaRankingPage'
                rows={reports.orderQuotaRanking.rows.map((row: (typeof reports.orderQuotaRanking.rows)[number]) => (
                  <TableRow key={row.company_name}>
                    <TableCell>{row.company_name}</TableCell>
                    <TableCell>{row.total_order_quota}</TableCell>
                    <TableCell>{row.available_order_quota}</TableCell>
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader><CardTitle>销售趋势</CardTitle><CardDescription>按日汇总散客订单金额。</CardDescription></CardHeader>
            <CardContent>
              <ClientPaginatedItems
                emptyState={<div className='rounded-lg border px-3 py-2 text-sm text-muted-foreground'>暂无销售趋势</div>}
                total={reports.salesTrend.total}
                page={reports.salesTrend.page}
                pageSize={reports.salesTrend.pageSize}
                pageParamName='salesTrendPage'
                items={reports.salesTrend.rows.map((row: (typeof reports.salesTrend.rows)[number]) => (
                  <div key={row.period} className='flex items-center justify-between rounded-lg border px-3 py-2 text-sm'>
                    <span>{row.period}</span>
                    <span>{row.amount}</span>
                  </div>
                ))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>核销趋势</CardTitle><CardDescription>按日查看门店核销完成量。</CardDescription></CardHeader>
            <CardContent>
              <ClientPaginatedItems
                emptyState={<div className='rounded-lg border px-3 py-2 text-sm text-muted-foreground'>暂无核销趋势</div>}
                total={reports.writeoffTrend.total}
                page={reports.writeoffTrend.page}
                pageSize={reports.writeoffTrend.pageSize}
                pageParamName='writeoffTrendPage'
                items={reports.writeoffTrend.rows.map((row: (typeof reports.writeoffTrend.rows)[number]) => (
                  <div key={row.period} className='flex items-center justify-between rounded-lg border px-3 py-2 text-sm'>
                    <span>{row.period}</span>
                    <span>{row.count}</span>
                  </div>
                ))}
              />
            </CardContent>
          </Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>待审核事项</CardTitle>
              <CardDescription>总部运营与审核员的待办入口。</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex items-center justify-between rounded-lg border px-3 py-2'><span>订货额调整</span><Badge variant='outline'>{reports.pendingApprovals.orderQuotaAdjustments}</Badge></div>
              <div className='flex items-center justify-between rounded-lg border px-3 py-2'><span>库存调整</span><Badge variant='outline'>{reports.pendingApprovals.inventoryAdjustments}</Badge></div>
              <div className='flex items-center justify-between rounded-lg border px-3 py-2'><span>异常订货单</span><Badge variant='outline'>{reports.pendingApprovals.purchaseOrders}</Badge></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>库存预警</CardTitle>
              <CardDescription>辅助总部和分公司快速识别低库存商品。</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientPaginatedTable
                headers={['分公司', '商品', 'SKU', '库存', '安全库存']}
                emptyMessage='暂无库存预警'
                total={reports.lowInventory.total}
                page={reports.lowInventory.page}
                pageSize={reports.lowInventory.pageSize}
                pageParamName='lowInventoryPage'
                rows={reports.lowInventory.rows.map((row: (typeof reports.lowInventory.rows)[number]) => (
                  <TableRow key={`${row.company_name}-${row.sku_code}`}>
                    <TableCell>{row.company_name}</TableCell>
                    <TableCell>{row.product_name}</TableCell>
                    <TableCell>{row.sku_code}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.safety_stock}</TableCell>
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
