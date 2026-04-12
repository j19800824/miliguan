import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { requirePermission } from '@/lib/auth/server';
import { getReportsData } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 数据报表'
};

export default async function ReportsPage() {
  await requirePermission('reports:view');
  const reports = await getReportsData();

  return (
    <PageContainer pageTitle='数据报表' pageDescription='聚合销售、核销、积分、库存和排行结果，支撑老板与总部运营决策。'>
      <div className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-4'>
          <Card><CardHeader><CardDescription>总销售额</CardDescription><CardTitle>{reports.summary.totalSales}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>总核销量</CardDescription><CardTitle>{reports.summary.totalWriteoffs}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>总积分消耗</CardDescription><CardTitle>{reports.summary.totalPointsUsed}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>总库存量</CardDescription><CardTitle>{reports.summary.totalInventory}</CardTitle></CardHeader></Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>分公司经营排名</CardTitle>
              <CardDescription>按会员订单销售额和核销表现查看经营结果。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>销售额</TableHead><TableHead>核销量</TableHead><TableHead>积分消耗</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {reports.companyRanking.map((row: (typeof reports.companyRanking)[number]) => (
                      <TableRow key={row.company_name}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.total_sales}</TableCell>
                        <TableCell>{row.writeoff_count}</TableCell>
                        <TableCell>{row.points_spent}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>积分排行</CardTitle>
              <CardDescription>按历史累计积分和当前可用积分查看排行。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>累计积分</TableHead><TableHead>可用积分</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {reports.pointsRanking.map((row: (typeof reports.pointsRanking)[number]) => (
                      <TableRow key={row.company_name}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.total_points}</TableCell>
                        <TableCell>{row.available_points}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader><CardTitle>销售趋势</CardTitle><CardDescription>按日汇总会员订单金额。</CardDescription></CardHeader>
            <CardContent className='space-y-2'>
              {reports.salesTrend.map((row: (typeof reports.salesTrend)[number]) => (
                <div key={row.period} className='flex items-center justify-between rounded-lg border px-3 py-2 text-sm'>
                  <span>{row.period}</span>
                  <span>{row.amount}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>核销趋势</CardTitle><CardDescription>按日查看门店核销完成量。</CardDescription></CardHeader>
            <CardContent className='space-y-2'>
              {reports.writeoffTrend.map((row: (typeof reports.writeoffTrend)[number]) => (
                <div key={row.period} className='flex items-center justify-between rounded-lg border px-3 py-2 text-sm'>
                  <span>{row.period}</span>
                  <span>{row.count}</span>
                </div>
              ))}
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
              <div className='flex items-center justify-between rounded-lg border px-3 py-2'><span>积分调整</span><Badge variant='outline'>{reports.pendingApprovals.pointAdjustments}</Badge></div>
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
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>商品</TableHead><TableHead>SKU</TableHead><TableHead>库存</TableHead><TableHead>安全库存</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {reports.lowInventory.map((row: (typeof reports.lowInventory)[number]) => (
                      <TableRow key={`${row.company_name}-${row.sku_code}`}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.product_name}</TableCell>
                        <TableCell>{row.sku_code}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{row.safety_stock}</TableCell>
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
