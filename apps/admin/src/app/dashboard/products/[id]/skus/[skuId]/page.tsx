import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { TableCell, TableRow } from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getSkuDetail } from '@/lib/database.js';
import { SkuImageUploader } from '@/features/admin/components/sku-image-uploader';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - SKU 详情'
};

type SkuDetail = NonNullable<Awaited<ReturnType<typeof getSkuDetail>>>;
type SkuInventoryRow = SkuDetail['inventory']['rows'][number];
type SkuUsageRow = SkuDetail['recentUsage']['rows'][number];
type SkuWriteoffRow = SkuDetail['writeoffs']['rows'][number];
type SkuRequestRow = SkuDetail['pendingRequests']['rows'][number];

export default async function ProductSkuDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string; skuId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, skuId } = await params;
  const user = await requirePermission('products:view');
  const resolvedSearchParams = await searchParams;
  const pageSize = Number(Array.isArray(resolvedSearchParams.pageSize) ? resolvedSearchParams.pageSize[0] : resolvedSearchParams.pageSize ?? '10');
  const detail = await getSkuDetail(id, skuId, {
    inventoryPage: Number(Array.isArray(resolvedSearchParams.inventoryPage) ? resolvedSearchParams.inventoryPage[0] : resolvedSearchParams.inventoryPage ?? '1'),
    recentUsagePage: Number(Array.isArray(resolvedSearchParams.recentUsagePage) ? resolvedSearchParams.recentUsagePage[0] : resolvedSearchParams.recentUsagePage ?? '1'),
    writeoffsPage: Number(Array.isArray(resolvedSearchParams.writeoffsPage) ? resolvedSearchParams.writeoffsPage[0] : resolvedSearchParams.writeoffsPage ?? '1'),
    requestsPage: Number(Array.isArray(resolvedSearchParams.requestsPage) ? resolvedSearchParams.requestsPage[0] : resolvedSearchParams.requestsPage ?? '1'),
    pageSize
  });

  if (!detail) {
    return (
      <PageContainer pageTitle='SKU 不存在' pageDescription='当前 SKU 记录不存在或已被删除。'>
        <Card>
          <CardContent className='py-10 text-sm text-muted-foreground'>
            请返回商品详情页重新选择 SKU。
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const canEdit = hasPermission(user, 'products:edit');

  return (
    <PageContainer
      pageTitle={`SKU 详情 · ${detail.sku_code}`}
      pageDescription={`所属商品：${detail.product_name}（${detail.spu_code}）`}
      pageHeaderAction={
        <Link href={`/dashboard/products/${detail.product_id}`} className='text-sm text-primary underline-offset-4 hover:underline'>
          返回商品详情
        </Link>
      }
    >
      {detail.delete_status === '已删除' ? (
        <div className='mb-4 flex justify-start'>
          <Badge variant='destructive'>已删除</Badge>
        </div>
      ) : null}
      <div className='grid gap-4 xl:grid-cols-[1.3fr_0.7fr]'>
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>展示 SKU 编码、规格、价格、条码和二维码信息。</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div><p className='text-sm text-muted-foreground'>SKU 编码</p><p className='font-medium'>{detail.sku_code}</p></div>
            <div><p className='text-sm text-muted-foreground'>SKU 名称</p><p className='font-medium'>{detail.name}</p></div>
            <div><p className='text-sm text-muted-foreground'>状态</p><StatusBadge status={detail.status} /></div>
            <div><p className='text-sm text-muted-foreground'>规格</p><p className='font-medium'>{detail.spec}</p></div>
            <div><p className='text-sm text-muted-foreground'>包装</p><p className='font-medium'>{detail.packaging}</p></div>
            <div><p className='text-sm text-muted-foreground'>单位</p><p className='font-medium'>{detail.unit}</p></div>
            <div><p className='text-sm text-muted-foreground'>订货额单价</p><p className='font-medium'>{detail.order_quota_price}</p></div>
            <div><p className='text-sm text-muted-foreground'>积分兑换价</p><p className='font-medium'>{detail.redeem_points_price}</p></div>
            <div><p className='text-sm text-muted-foreground'>售价</p><p className='font-medium'>¥{detail.sale_price}</p></div>
            <div><p className='text-sm text-muted-foreground'>条码</p><p className='font-medium'>{detail.barcode}</p></div>
            <div><p className='text-sm text-muted-foreground'>二维码</p><p className='font-medium break-all'>{detail.qr_code}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SKU 图片</CardTitle>
            <CardDescription>图片已归属 SKU 维度维护，可单独预览和替换。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {detail.image_url ? (
              <div className='overflow-hidden rounded-lg border bg-muted/20 p-4'>
                <img src={detail.image_url} alt={detail.sku_code} className='mx-auto max-h-80 rounded-md object-contain' />
              </div>
            ) : (
              <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                当前 SKU 尚未上传图片
              </div>
            )}
            <SkuImageUploader productId={detail.product_id} skuId={detail.id} canEdit={canEdit && detail.delete_status !== '已删除'} />
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>库存分布</CardTitle>
            <CardDescription>查看该 SKU 在各分公司的库存数量和预警状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['分公司', '当前库存', '安全库存', '状态']}
              emptyMessage='暂无库存记录'
              total={detail.inventory.total}
              page={detail.inventory.page}
              pageSize={detail.inventory.pageSize}
              pageParamName='inventoryPage'
              rows={detail.inventory.rows.map((row: SkuInventoryRow, index: number) => (
                <TableRow key={`${row.company_name}-${row.status}-${row.quantity}-${index}`}>
                  <TableCell>{row.company_name}</TableCell>
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
            <CardTitle>最近业务使用</CardTitle>
            <CardDescription>汇总订货单和会员订单里最近引用该 SKU 的记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['来源', '单号', '数量', '时间']}
              emptyMessage='暂无业务使用记录'
              total={detail.recentUsage.total}
              page={detail.recentUsage.page}
              pageSize={detail.recentUsage.pageSize}
              pageParamName='recentUsagePage'
              rows={detail.recentUsage.rows.map((row: SkuUsageRow, index: number) => (
                <TableRow key={`${row.source_type}-${row.source_no}-${row.created_at}-${index}`}>
                  <TableCell>{row.source_type}</TableCell>
                  <TableCell>{row.source_no}</TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleString('zh-CN')}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>核销记录</CardTitle>
            <CardDescription>显示最近的门店核销结果和处理备注。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['状态', '商品码', '销售员工', '核销时间']}
              emptyMessage='暂无核销记录'
              total={detail.writeoffs.total}
              page={detail.writeoffs.page}
              pageSize={detail.writeoffs.pageSize}
              pageParamName='writeoffsPage'
              rows={detail.writeoffs.rows.map((row: SkuWriteoffRow, index: number) => (
                <TableRow key={`${row.product_code}-${row.writeoff_time}-${index}`}>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>{row.product_code}</TableCell>
                  <TableCell>{row.sales_staff_name}</TableCell>
                  <TableCell>{row.writeoff_time}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>变更申请</CardTitle>
            <CardDescription>查看该 SKU 关联的最近审核申请，便于追踪变更历史。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['操作', '状态', '提交人', '提交时间']}
              emptyMessage='暂无 SKU 变更申请'
              total={detail.pendingRequests.total}
              page={detail.pendingRequests.page}
              pageSize={detail.pendingRequests.pageSize}
              pageParamName='requestsPage'
              rows={detail.pendingRequests.rows.map((row: SkuRequestRow, index: number) => (
                <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                  <TableCell>{row.action}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell>{row.created_by}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleString('zh-CN')}</TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
