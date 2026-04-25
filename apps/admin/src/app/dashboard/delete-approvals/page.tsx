import PageContainer from '@/components/layout/page-container';
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listDeleteRequests } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 删除审核'
};

export default async function DeleteApprovalsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('delete:approve');
  const params = await searchParams;
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listDeleteRequests({ page, pageSize });
  const rows = result.rows;

  return (
    <PageContainer pageTitle='删除审核' pageDescription='审核后台各模块的删除申请，审核通过后执行逻辑删除。'>
      <Card>
        <CardHeader>
          <CardTitle>审核列表</CardTitle>
          <CardDescription>删除申请默认不会物理删库，只会在审核通过后标记为已删除。</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientPaginatedTable
            headers={['模块', '名称', '编码', '申请人', '说明', '状态', '申请时间', '审核']}
            emptyMessage='暂无删除审核记录'
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            rows={rows.map((row: (typeof rows)[number], index: number) => (
              <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                <TableCell>{row.entity_type}</TableCell>
                <TableCell>{row.summary.title ?? '-'}</TableCell>
                <TableCell>{row.summary.code ?? '-'}</TableCell>
                <TableCell>{row.created_by}</TableCell>
                <TableCell className='max-w-[260px] whitespace-normal text-sm text-muted-foreground'>
                  {row.request_note || '未填写'}
                </TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell>{row.created_at}</TableCell>
                <TableCell>
                  {row.status === '待审核' ? (
                    <ApprovalDecisionActions
                      endpoint={`/api/admin/delete-requests/${row.id}/approve`}
                      canApprove={hasPermission(user, 'delete:approve')}
                      label='删除审核'
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
