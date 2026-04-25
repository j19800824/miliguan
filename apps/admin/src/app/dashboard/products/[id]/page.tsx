import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientPaginatedTable } from '@/features/admin/components/client-paginated-table';
import { TableCell, TableRow } from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getProductDetail } from '@/lib/database.js';
import { ProductSkuManager } from '@/features/admin/components/product-sku-manager';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - 商品详情'
};

export default async function ProductDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('products:view');
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const skusPage = Number(Array.isArray(resolvedSearchParams.skusPage) ? resolvedSearchParams.skusPage[0] : resolvedSearchParams.skusPage ?? '1');
  const inventoryPage = Number(Array.isArray(resolvedSearchParams.inventoryPage) ? resolvedSearchParams.inventoryPage[0] : resolvedSearchParams.inventoryPage ?? '1');
  const pageSize = Number(Array.isArray(resolvedSearchParams.pageSize) ? resolvedSearchParams.pageSize[0] : resolvedSearchParams.pageSize ?? '10');
  const product = await getProductDetail(id, { skusPage, inventoryPage, pageSize });

  if (!product) {
    return (
      <PageContainer pageTitle='商品详情' pageDescription='未找到该商品'>
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            该商品不存在或已被删除，返回 <Link href='/dashboard/products'>商品列表</Link> 查看其他记录。
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`${product.name} / 商品详情`}
      pageDescription='查看 SPU 基本信息、SKU 清单与各分公司库存分布。'
    >
      <div className='space-y-4'>
        {product.delete_status === '已删除' ? (
          <div className='flex justify-start'>
            <Badge variant='destructive'>已删除</Badge>
          </div>
        ) : null}
        <div className='grid gap-4 lg:grid-cols-4'>
          <Card><CardHeader><CardDescription>SPU 编码</CardDescription><CardTitle>{product.spu_code}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>品牌 / 分类</CardDescription><CardTitle>{product.brand} / {product.category}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>适用场景</CardDescription><CardTitle>{product.scenario}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>状态</CardDescription><CardTitle><StatusBadge status={product.status} /></CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>商品描述</CardTitle>
            <CardDescription>{product.description}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SKU 清单</CardTitle>
            <CardDescription>先创建 SPU，再在这里独立新增、编辑、上传图片和删除 SKU。</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductSkuManager
              productId={product.id}
              canEdit={hasPermission(user, 'products:edit') && product.delete_status !== '已删除'}
              skus={product.skus.rows}
              total={product.skus.total}
              page={product.skus.page}
              pageSize={product.skus.pageSize}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>库存分布</CardTitle>
            <CardDescription>按分公司查看当前库存余量和预警状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientPaginatedTable
              headers={['分公司', 'SKU 编码', '库存数', '状态']}
              emptyMessage='暂无库存分布'
              total={product.inventory.total}
              page={product.inventory.page}
              pageSize={product.inventory.pageSize}
              pageParamName='inventoryPage'
              rows={product.inventory.rows.map((row: (typeof product.inventory.rows)[number]) => (
                <TableRow key={`${row.company_name}-${row.sku_code}`}>
                  <TableCell>{row.company_name}</TableCell>
                  <TableCell>{row.sku_code}</TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                </TableRow>
              ))}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
