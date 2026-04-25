import PageContainer from '@/components/layout/page-container';
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listInventoryAdjustments } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 库存调整审核'
};

export default async function InventoryApprovalsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('inventory:approve');
  const params = await searchParams;
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listInventoryAdjustments({ page, pageSize });
  const rows = result.rows;

  return (
    <PageContainer pageTitle='库存调整审核' pageDescription='审核手工库存调整申请，保证分公司库存可信。'>
      <Card>
        <CardHeader>
          <CardTitle>审核列表</CardTitle>
          <CardDescription>待审核记录通过后会直接更新库存和库存流水。</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientPaginatedTable
            headers={['分公司', '商品', 'SKU', '申请库存', '申请人', '原因', '状态', '申请时间', '审核']}
            emptyMessage='暂无库存调整审核记录'
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            rows={rows.map((row: (typeof rows)[number], index: number) => (
              <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                <TableCell>{row.company_name}</TableCell>
                <TableCell>{row.product_name}</TableCell>
                <TableCell>{row.sku_code}</TableCell>
                <TableCell>{row.requested_quantity}</TableCell>
                <TableCell>{row.created_by}</TableCell>
                <TableCell className='max-w-[260px] whitespace-normal text-sm text-muted-foreground'>{row.reason}</TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell>{row.created_at}</TableCell>
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
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
