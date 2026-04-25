import PageContainer from '@/components/layout/page-container';
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listOrderQuotaAdjustments } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 订货额度调整审核'
};

function buildAdjustmentSummary(
  row: {
    adjustment_type: string;
    change_type: string;
    order_quota_amount: number;
    expires_at: string;
    target_company_level: string;
    source_order_no: string;
    source_order_type?: string;
  }
) {
  if (row.adjustment_type === '临时额度调整') {
    return `临时${row.change_type} ${row.order_quota_amount}，到期回调：${row.expires_at || '未设置'}`;
  }
  if (row.adjustment_type === '等级调整') {
    return `审批通过后分公司等级切换为 ${row.target_company_level || '未设置'}，系统按等级规则重算订货额度`;
  }
  return `${row.source_order_type || '订单'} ${row.source_order_no || '未关联'} 完成退货，额度按订单金额自动返还`;
}

export default async function OrderQuotaApprovalsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('order-quota:approve');
  const params = await searchParams;
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const adjustments = await listOrderQuotaAdjustments({ page, pageSize });
  const rows = adjustments.rows;

  return (
    <PageContainer pageTitle='订货额度调整审核' pageDescription='审核分公司订货额度增减申请，确保订货额度流转可追溯。'>
      <Card>
        <CardHeader>
          <CardTitle>审核列表</CardTitle>
          <CardDescription>待审核记录通过后将直接影响分公司的可用订货额度。</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientPaginatedTable
            headers={['分公司', '调整途径', '类型', '订货额度', '回调日期', '目标等级', '退货订单', '执行说明', '申请人', '原因', '状态', '申请时间', '审核']}
            emptyMessage='暂无订货额度审核记录'
            total={adjustments.total}
            page={adjustments.page}
            pageSize={adjustments.pageSize}
            rows={rows.map((row: (typeof rows)[number], index: number) => (
              <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                <TableCell>{row.company_name}</TableCell>
                <TableCell>{row.adjustment_type}</TableCell>
                <TableCell>{row.change_type}</TableCell>
                <TableCell>{row.order_quota_amount}</TableCell>
                <TableCell>{row.expires_at || '-'}</TableCell>
                <TableCell>{row.target_company_level || '-'}</TableCell>
                <TableCell>{row.source_order_no || '-'}</TableCell>
                <TableCell className='max-w-[280px] whitespace-normal text-sm text-muted-foreground'>{buildAdjustmentSummary(row)}</TableCell>
                <TableCell>{row.created_by}</TableCell>
                <TableCell className='max-w-[260px] whitespace-normal text-sm text-muted-foreground'>{row.reason}</TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell>{row.created_at}</TableCell>
                <TableCell>
                  {row.status === '待审核' ? (
                    <ApprovalDecisionActions
                      endpoint={`/api/admin/order-quota/adjustments/${row.id}/approve`}
                      canApprove={hasPermission(user, 'order-quota:approve')}
                      label='订货额度审核'
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
