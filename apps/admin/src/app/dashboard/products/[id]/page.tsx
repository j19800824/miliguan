import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getProductDetail } from '@/lib/database.js';
import { ProductSkuManager } from '@/features/admin/components/product-sku-manager';

export const metadata = {
  title: '米粒冠后台 - 商品详情'
};

export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('products:view');
  const { id } = await params;
  const product = await getProductDetail(id);

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
        <div className='grid gap-4 lg:grid-cols-4'>
          <Card><CardHeader><CardDescription>SPU 编码</CardDescription><CardTitle>{product.spu_code}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>品牌 / 分类</CardDescription><CardTitle>{product.brand} / {product.category}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>适用场景</CardDescription><CardTitle>{product.scenario}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>状态</CardDescription><CardTitle><Badge variant='outline'>{product.status}</Badge></CardTitle></CardHeader></Card>
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
              canEdit={hasPermission(user, 'products:edit')}
              skus={product.skus}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>库存分布</CardTitle>
            <CardDescription>按分公司查看当前库存余量和预警状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>分公司</TableHead>
                    <TableHead>SKU 编码</TableHead>
                    <TableHead>库存数</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.inventory.map((row: (typeof product.inventory)[number]) => (
                    <TableRow key={`${row.company_name}-${row.sku_code}`}>
                      <TableCell>{row.company_name}</TableCell>
                      <TableCell>{row.sku_code}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
