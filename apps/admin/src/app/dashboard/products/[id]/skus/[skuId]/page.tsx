import Link from 'next/link';
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
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getSkuDetail } from '@/lib/database.js';
import { SkuImageUploader } from '@/features/admin/components/sku-image-uploader';

export const metadata = {
  title: '米粒冠后台 - SKU 详情'
};

type SkuDetail = NonNullable<Awaited<ReturnType<typeof getSkuDetail>>>;
type SkuInventoryRow = SkuDetail['inventory'][number];
type SkuUsageRow = SkuDetail['recentUsage'][number];
type SkuWriteoffRow = SkuDetail['writeoffs'][number];
type SkuRequestRow = SkuDetail['pendingRequests'][number];

export default async function ProductSkuDetailPage({
  params
}: {
  params: Promise<{ id: string; skuId: string }>;
}) {
  const { id, skuId } = await params;
  const user = await requirePermission('products:view');
  const detail = await getSkuDetail(id, skuId);

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
      <div className='grid gap-4 xl:grid-cols-[1.3fr_0.7fr]'>
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>展示 SKU 编码、规格、价格、条码和二维码信息。</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div><p className='text-sm text-muted-foreground'>SKU 编码</p><p className='font-medium'>{detail.sku_code}</p></div>
            <div><p className='text-sm text-muted-foreground'>SKU 名称</p><p className='font-medium'>{detail.name}</p></div>
            <div><p className='text-sm text-muted-foreground'>状态</p><Badge variant='outline'>{detail.status}</Badge></div>
            <div><p className='text-sm text-muted-foreground'>规格</p><p className='font-medium'>{detail.spec}</p></div>
            <div><p className='text-sm text-muted-foreground'>包装</p><p className='font-medium'>{detail.packaging}</p></div>
            <div><p className='text-sm text-muted-foreground'>单位</p><p className='font-medium'>{detail.unit}</p></div>
            <div><p className='text-sm text-muted-foreground'>订货积分价</p><p className='font-medium'>{detail.points_price}</p></div>
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
            <SkuImageUploader productId={detail.product_id} skuId={detail.id} canEdit={canEdit} />
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
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>分公司</TableHead>
                    <TableHead>当前库存</TableHead>
                    <TableHead>安全库存</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.inventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className='py-8 text-center text-sm text-muted-foreground'>
                        暂无库存记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.inventory.map((row: SkuInventoryRow) => (
                      <TableRow key={`${row.company_name}-${row.status}`}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{row.safety_stock}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近业务使用</CardTitle>
            <CardDescription>汇总订货单和会员订单里最近引用该 SKU 的记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>来源</TableHead>
                    <TableHead>单号</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.recentUsage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className='py-8 text-center text-sm text-muted-foreground'>
                        暂无业务使用记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.recentUsage.map((row: SkuUsageRow) => (
                      <TableRow key={`${row.source_type}-${row.source_no}-${row.created_at}`}>
                        <TableCell>{row.source_type}</TableCell>
                        <TableCell>{row.source_no}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString('zh-CN')}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>商品码</TableHead>
                    <TableHead>销售员工</TableHead>
                    <TableHead>核销时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.writeoffs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className='py-8 text-center text-sm text-muted-foreground'>
                        暂无核销记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.writeoffs.map((row: SkuWriteoffRow) => (
                      <TableRow key={`${row.product_code}-${row.writeoff_time}`}>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>{row.product_code}</TableCell>
                        <TableCell>{row.sales_staff_name}</TableCell>
                        <TableCell>{row.writeoff_time}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>变更申请</CardTitle>
            <CardDescription>查看该 SKU 关联的最近审核申请，便于追踪变更历史。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>操作</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>提交人</TableHead>
                    <TableHead>提交时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.pendingRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className='py-8 text-center text-sm text-muted-foreground'>
                        暂无 SKU 变更申请
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.pendingRequests.map((row: SkuRequestRow) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.action}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>{row.created_by}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString('zh-CN')}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
