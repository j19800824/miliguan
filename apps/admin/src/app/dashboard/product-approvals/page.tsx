import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listProductChangeRequests } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 商品审核'
};

type ProductApprovalRow = Awaited<ReturnType<typeof listProductChangeRequests>>['rows'][number];

export default async function ProductApprovalsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('products:approve');
  const params = await searchParams;
  const page = Number(Array.isArray(params.page) ? params.page[0] : params.page ?? '1');
  const pageSize = Number(Array.isArray(params.pageSize) ? params.pageSize[0] : params.pageSize ?? '10');
  const result = await listProductChangeRequests({ page, pageSize });
  const rows = result.rows;

  return (
    <PageContainer pageTitle='商品审核' pageDescription='审核商品 SPU 与 SKU 的新增、修改、删除申请。'>
      <Card>
        <CardHeader>
          <CardTitle>审核列表</CardTitle>
          <CardDescription>商品资料变更需经审核通过后才会真正写入业务数据。</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientPaginatedTable
            headers={['类型', '操作', '商品/规格', '编码', '申请人', '申请说明', '状态', '详情', '审核']}
            emptyMessage='暂无商品审核记录'
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            rows={rows.map((row: ProductApprovalRow) => (
              <TableRow key={row.id}>
                <TableCell>{row.entity_label}</TableCell>
                <TableCell>{row.action}</TableCell>
                <TableCell>{row.summary}</TableCell>
                <TableCell>
                  {row.entity_type === 'sku' ? row.sku_code || '-' : row.spu_code || '-'}
                </TableCell>
                <TableCell>{row.created_by}</TableCell>
                <TableCell className='max-w-[280px] whitespace-normal text-sm text-muted-foreground'>
                  {row.request_note || '未填写'}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  {row.entity_type === 'sku' && row.entity_id && row.product_id ? (
                    <Link
                      href={`/dashboard/products/${row.product_id}/skus/${row.entity_id}`}
                      className='text-sm text-primary underline-offset-4 hover:underline'
                    >
                      查看 SKU
                    </Link>
                  ) : row.entity_type === 'product' && row.product_id ? (
                    <Link
                      href={`/dashboard/products/${row.product_id}`}
                      className='text-sm text-primary underline-offset-4 hover:underline'
                    >
                      查看商品
                    </Link>
                  ) : (
                    <span className='text-xs text-muted-foreground'>待创建</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.status === '待审核' ? (
                    <ApprovalDecisionActions
                      endpoint={`/api/admin/products/approvals/${row.id}`}
                      canApprove={hasPermission(user, 'products:approve')}
                      label='商品审核'
                    />
                  ) : (
                    <div className='space-y-1 text-xs text-muted-foreground'>
                      <div>{row.approved_by ? `审核人：${row.approved_by}` : '已完成'}</div>
                      {row.approved_note ? <div>{row.approved_note}</div> : null}
                    </div>
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
