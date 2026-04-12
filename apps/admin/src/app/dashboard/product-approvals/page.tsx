import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
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
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listProductChangeRequests } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 商品审核'
};

type ProductApprovalRow = Awaited<ReturnType<typeof listProductChangeRequests>>[number];

export default async function ProductApprovalsPage() {
  const user = await requirePermission('products:approve');
  const rows = await listProductChangeRequests();

  return (
    <PageContainer pageTitle='商品审核' pageDescription='审核商品 SPU 与 SKU 的新增、修改、删除申请。'>
      <Card>
        <CardHeader>
          <CardTitle>审核列表</CardTitle>
          <CardDescription>商品资料变更需经审核通过后才会真正写入业务数据。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>操作</TableHead>
                  <TableHead>商品/规格</TableHead>
                  <TableHead>编码</TableHead>
                  <TableHead>申请人</TableHead>
                  <TableHead>申请说明</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>详情</TableHead>
                  <TableHead>审核</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className='py-10 text-center text-sm text-muted-foreground'>
                      暂无商品审核记录
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row: ProductApprovalRow) => (
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
                        <Badge variant='outline'>{row.status}</Badge>
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
