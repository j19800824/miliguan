import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { TableCell, TableRow } from '@/components/ui/table';
import { InventoryAdjustmentActions } from '@/features/admin/components/inventory-adjustment-actions';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import {
  getCompanyOptions,
  getInventoryStats,
  getProductSkuOptions,
  listInventory,
  listInventoryAdjustments,
  listInventoryLogs,
  listLowInventoryRecords
} from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 库存管理'
};

export default async function InventoryPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('inventory:view');
  const params = await searchParams;
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const inventoryPage = Number(Array.isArray(params.inventoryPage) ? params.inventoryPage[0] : params.inventoryPage ?? '1');
  const adjustmentsPage = Number(Array.isArray(params.adjustmentsPage) ? params.adjustmentsPage[0] : params.adjustmentsPage ?? '1');
  const logsPage = Number(Array.isArray(params.logsPage) ? params.logsPage[0] : params.logsPage ?? '1');
  const warningsPage = Number(Array.isArray(params.warningsPage) ? params.warningsPage[0] : params.warningsPage ?? '1');
  const stats = await getInventoryStats(user);
  const inventoryResult = await listInventory({ page: inventoryPage, pageSize, user });
  const inventoryRows = inventoryResult.rows;
  const adjustmentResult = await listInventoryAdjustments({ page: adjustmentsPage, pageSize, user });
  const adjustmentRows = adjustmentResult.rows;
  const logsResult = await listInventoryLogs({ page: logsPage, pageSize, user });
  const logs = logsResult.rows;
  const companyOptions = await getCompanyOptions(user);
  const skuOptions = await getProductSkuOptions();
  const warningResult = await listLowInventoryRecords({ page: warningsPage, pageSize, user });
  const warningRows = warningResult.rows;

  return (
    <PageContainer
      pageTitle='库存管理'
      pageDescription='管理分公司库存总览、入库出库流水、调整申请与库存预警。'
      pageHeaderAction={
        <InventoryAdjustmentActions
          canEdit={hasPermission(user, 'inventory:edit')}
          companyOptions={companyOptions}
          skuOptions={skuOptions}
        />
      }
    >
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
            <ClientPaginatedTable
              headers={['分公司', '商品', 'SKU', '规格', '库存数', '安全库存', '状态']}
              emptyMessage='暂无库存记录'
              total={inventoryResult.total}
              page={inventoryResult.page}
              pageSize={inventoryResult.pageSize}
              pageParamName='inventoryPage'
              rows={inventoryRows.map((row: (typeof inventoryRows)[number], index: number) => (
                <TableRow key={`${row.id}-${row.company_name}-${index}`}>
                  <TableCell>{row.company_name}</TableCell>
                  <TableCell>{row.product_name}</TableCell>
                  <TableCell>{row.sku_code}</TableCell>
                  <TableCell>{row.spec}</TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell>{row.safety_stock}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>库存调整申请</CardTitle>
            <CardDescription>手工调整库存必须经过审核，保证数据可信。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['分公司', '商品', 'SKU', '申请库存', '原因', '申请人', '状态', '申请时间']}
              emptyMessage='暂无库存调整申请'
              total={adjustmentResult.total}
              page={adjustmentResult.page}
              pageSize={adjustmentResult.pageSize}
              pageParamName='adjustmentsPage'
              rows={adjustmentRows.map((row: (typeof adjustmentRows)[number], index: number) => (
                <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                  <TableCell>{row.company_name}</TableCell>
                  <TableCell>{row.product_name}</TableCell>
                  <TableCell>{row.sku_code}</TableCell>
                  <TableCell>{row.requested_quantity}</TableCell>
                  <TableCell>{row.reason}</TableCell>
                  <TableCell>{row.created_by}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>{row.created_at}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>库存流水</CardTitle>
              <CardDescription>展示订货入库、散客订单出库、异常扣减等流水。</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientPaginatedTable
                headers={['分公司', '商品', 'SKU', '来源', '变更', '数量', '结存']}
                emptyMessage='暂无库存流水'
                total={logsResult.total}
                page={logsResult.page}
                pageSize={logsResult.pageSize}
                pageParamName='logsPage'
                rows={logs.map((row: (typeof logs)[number], index: number) => (
                  <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                    <TableCell>{row.company_name}</TableCell>
                    <TableCell>{row.product_name}</TableCell>
                    <TableCell>{row.sku_code}</TableCell>
                    <TableCell>{row.source_type}</TableCell>
                    <TableCell>{row.change_type}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.balance_after}</TableCell>
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>库存预警</CardTitle>
              <CardDescription>低库存商品辅助总部和分公司补货。</CardDescription>
            </CardHeader>
            <CardContent>
              <ClientPaginatedTable
                headers={['分公司', '商品', 'SKU', '库存数', '安全库存']}
                emptyMessage='暂无库存预警'
                total={warningResult.total}
                page={warningResult.page}
                pageSize={warningResult.pageSize}
                pageParamName='warningsPage'
                rows={warningRows.map((row: (typeof warningRows)[number], index: number) => (
                  <TableRow key={`${row.id}-${row.company_name}-${index}`}>
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
