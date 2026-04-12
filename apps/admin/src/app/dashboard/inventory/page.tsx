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
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import {
  getInventoryStats,
  listInventory,
  listInventoryAdjustments,
  listInventoryLogs
} from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 库存管理'
};

export default async function InventoryPage() {
  const user = await requirePermission('inventory:view');
  const stats = await getInventoryStats();
  const inventoryRows = await listInventory();
  const adjustmentRows = await listInventoryAdjustments();
  const logs = await listInventoryLogs();
  const warningRows = inventoryRows.filter(
    (row: (typeof inventoryRows)[number]) => row.quantity <= row.safety_stock
  );

  return (
    <PageContainer pageTitle='库存管理' pageDescription='管理分公司库存总览、入库出库流水、调整申请与库存预警。'>
      <div className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-3'>
          <Card><CardHeader><CardDescription>库存记录</CardDescription><CardTitle>{stats.total}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>分公司维度库存总记录数</CardContent></Card>
          <Card><CardHeader><CardDescription>预警记录</CardDescription><CardTitle>{stats.warning}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>低于安全库存的记录数</CardContent></Card>
          <Card><CardHeader><CardDescription>低库存</CardDescription><CardTitle>{stats.low}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>需要尽快补货的 SKU 数量</CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>库存总览</CardTitle>
            <CardDescription>一期库存只统计分公司维度，不做门店精细库存。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>商品</TableHead><TableHead>SKU</TableHead><TableHead>规格</TableHead><TableHead>库存数</TableHead><TableHead>安全库存</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
                <TableBody>
                  {inventoryRows.map((row: (typeof inventoryRows)[number]) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.company_name}</TableCell>
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

        <Card>
          <CardHeader>
            <CardTitle>库存调整申请</CardTitle>
            <CardDescription>手工调整库存必须经过审核，保证数据可信。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>商品</TableHead><TableHead>SKU</TableHead><TableHead>申请库存</TableHead><TableHead>原因</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                <TableBody>
                  {adjustmentRows.map((row: (typeof adjustmentRows)[number]) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.company_name}</TableCell>
                      <TableCell>{row.product_name}</TableCell>
                      <TableCell>{row.sku_code}</TableCell>
                      <TableCell>{row.requested_quantity}</TableCell>
                      <TableCell>{row.reason}</TableCell>
                      <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                      <TableCell>
                        {row.status === '待审核' ? (
                          <ApprovalDecisionActions
                            endpoint={`/api/admin/inventory/adjustments/${row.id}/approve`}
                            canApprove={hasPermission(user, 'inventory:approve')}
                            label='库存审核'
                          />
                        ) : (
                          <span className='text-xs text-muted-foreground'>已完成</span>
                        )}
                      </TableCell>
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
              <CardTitle>库存流水</CardTitle>
              <CardDescription>展示订货入库、会员订单出库、异常扣减等流水。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>商品</TableHead><TableHead>SKU</TableHead><TableHead>来源</TableHead><TableHead>变更</TableHead><TableHead>数量</TableHead><TableHead>结存</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {logs.map((row: (typeof logs)[number]) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.product_name}</TableCell>
                        <TableCell>{row.sku_code}</TableCell>
                        <TableCell>{row.source_type}</TableCell>
                        <TableCell>{row.change_type}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{row.balance_after}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>库存预警</CardTitle>
              <CardDescription>低库存商品辅助总部和分公司补货。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>商品</TableHead><TableHead>SKU</TableHead><TableHead>库存数</TableHead><TableHead>安全库存</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {warningRows.map((row: (typeof warningRows)[number]) => (
                      <TableRow key={row.id}>
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
