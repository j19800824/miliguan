'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  TableCell,
  TableRow
} from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { SkuImageUploader } from './sku-image-uploader';
import { ClientPaginatedTable } from './client-paginated-table';
import { cn } from '@/lib/utils';
import { readApiError, type FieldErrors } from '@/lib/form-errors';

type ProductSku = {
  id: string;
  name: string;
  sku_code: string;
  spec: string;
  packaging: string;
  unit: string;
  barcode: string;
  qr_code: string;
  image_url: string;
  order_quota_price: number;
  redeem_points_price: number;
  sale_price: number;
  status: string;
};

type FormState = {
  name: string;
  sku_code: string;
  spec: string;
  packaging: string;
  unit: string;
  barcode: string;
  qr_code: string;
  order_quota_price: string;
  redeem_points_price: string;
  sale_price: string;
  status: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  sku_code: '',
  spec: '',
  packaging: '',
  unit: '',
  barcode: '',
  qr_code: '',
  order_quota_price: '',
  redeem_points_price: '',
  sale_price: '',
  status: '启用'
};

export function ProductSkuManager({
  productId,
  canEdit,
  skus: initialSkus,
  total: initialTotal,
  page: initialPage,
  pageSize: initialPageSize
}: {
  productId: string;
  canEdit: boolean;
  skus: ProductSku[];
  total?: number;
  page?: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [previewSku, setPreviewSku] = useState<ProductSku | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [skus, setSkus] = useState<ProductSku[]>(initialSkus);
  const [total, setTotal] = useState<number | undefined>(initialTotal);
  const [page, setPage] = useState<number | undefined>(initialPage);
  const [pageSize, setPageSize] = useState<number | undefined>(initialPageSize);
  const [loadingRows, setLoadingRows] = useState(false);

  const dialogTitle = useMemo(() => '新增 SKU', []);

  useEffect(() => {
    setSkus(initialSkus);
    setTotal(initialTotal);
    setPage(initialPage);
    setPageSize(initialPageSize);
  }, [initialSkus, initialTotal, initialPage, initialPageSize]);

  useEffect(() => {
    const currentPage = Number(searchParams.get('skusPage') ?? String(initialPage ?? 1));
    const currentPageSize = Number(searchParams.get('pageSize') ?? String(initialPageSize ?? 10));
    const controller = new AbortController();

    async function loadRows() {
      setLoadingRows(true);
      const response = await fetch(
        `/api/admin/products/${productId}/skus?page=${currentPage}&pageSize=${currentPageSize}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        setLoadingRows(false);
        return;
      }

      const body = (await response.json()) as {
        rows: ProductSku[];
        total: number;
        page: number;
        pageSize: number;
      };
      setSkus(body.rows);
      setTotal(body.total);
      setPage(body.page);
      setPageSize(body.pageSize);
      setLoadingRows(false);
    }

    void loadRows();
    return () => controller.abort();
  }, [productId, searchParams, initialPage, initialPageSize]);

  function openCreate() {
    setFormData(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setIsOpen(true);
  }

  const clearFieldError = (name: string) => {
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[name];
      return next;
    });
  };

  async function submit() {
    const nextErrors: FieldErrors = {};
    const requiredTextFields: Array<[keyof FormState, string]> = [
      ['name', 'SKU 名称'],
      ['sku_code', 'SKU 编码'],
      ['spec', '规格'],
      ['packaging', '包装'],
      ['unit', '单位'],
      ['barcode', '条码'],
      ['qr_code', '二维码']
    ];

    for (const [key, label] of requiredTextFields) {
      if (!String(formData[key] ?? '').trim()) {
        nextErrors[key] = `${label}不能为空`;
      }
    }

    const requiredNumberFields: Array<[keyof FormState, string]> = [
      ['order_quota_price', '订货额单价'],
      ['redeem_points_price', '积分兑换价'],
      ['sale_price', '售价']
    ];

    for (const [key, label] of requiredNumberFields) {
      if (!(Number(formData[key] || 0) > 0)) {
        nextErrors[key] = `${label}必须大于 0`;
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      const message = Object.values(nextErrors)[0] ?? '请检查 SKU 表单字段';
      setFormError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError('');
    const method = 'POST';
    const url = `/api/admin/products/${productId}/skus`;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        order_quota_price: Number(formData.order_quota_price || 0),
        redeem_points_price: Number(formData.redeem_points_price || 0),
        sale_price: Number(formData.sale_price || 0)
      })
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const error = await readApiError(response, '保存 SKU 失败');
      setFieldErrors(error.fieldErrors ?? {});
      setFormError(error.message ?? '保存 SKU 失败');
      toast.error(error.message ?? '保存 SKU 失败');
      return;
    }

    const body = await response.json().catch(() => ({ message: 'SKU 新增成功' }));
    setIsOpen(false);
    toast.success(body.message ?? 'SKU 新增成功');
    router.refresh();
  }

  async function removeSku(sku: ProductSku) {
    if (!window.confirm(`确认提交 SKU ${sku.sku_code} 的删除申请吗？`)) {
      return;
    }

    const response = await fetch(`/api/admin/products/${productId}/skus/${sku.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '删除 SKU 失败' }));
      toast.error(error.message ?? '删除 SKU 失败');
      return;
    }

    const body = await response.json().catch(() => ({ message: `SKU ${sku.sku_code} 已删除` }));
    toast.success(body.message ?? `SKU ${sku.sku_code} 已删除`);
    router.refresh();
  }

  return (
    <>
      <div className='mb-4 flex justify-end'>
        {canEdit ? <Button onClick={openCreate}>新增 SKU</Button> : <Button disabled>新增 SKU</Button>}
      </div>
      <ClientPaginatedTable
        headers={['SKU 编码', 'SKU 名称', '规格', '包装', '单位', '条码', '图片', '二维码', '订货额度价', '积分兑换价', '售价', '状态', '操作']}
        emptyMessage={loadingRows ? 'SKU 加载中...' : '暂无 SKU，请先新增一条 SKU 记录。'}
        total={total}
        page={page}
        pageSize={pageSize}
        pageParamName='skusPage'
        rows={skus.map((sku, index) => (
          <TableRow key={`${sku.id}-${sku.sku_code}-${index}`}>
            <TableCell>{sku.sku_code}</TableCell>
            <TableCell>{sku.name}</TableCell>
            <TableCell>{sku.spec}</TableCell>
            <TableCell>{sku.packaging}</TableCell>
            <TableCell>{sku.unit}</TableCell>
            <TableCell>{sku.barcode}</TableCell>
            <TableCell>
              {sku.image_url ? (
                <button
                  type='button'
                  className='block'
                  onClick={() => setPreviewSku(sku)}
                >
                  <img
                    src={sku.image_url}
                    alt={sku.sku_code}
                    className='h-12 w-12 rounded-md border object-cover'
                  />
                </button>
              ) : (
                <span className='text-xs text-muted-foreground'>未上传</span>
              )}
            </TableCell>
            <TableCell className='max-w-[220px] truncate'>{sku.qr_code}</TableCell>
            <TableCell>{sku.order_quota_price}</TableCell>
            <TableCell>{sku.redeem_points_price}</TableCell>
            <TableCell>¥{sku.sale_price}</TableCell>
            <TableCell>
              <StatusBadge status={sku.status} />
            </TableCell>
            <TableCell className='text-right'>
              <div className='flex justify-end gap-2'>
                {canEdit ? (
                  <>
                    <Button
                      variant='secondary'
                      size='sm'
                      onClick={() => router.push(`/dashboard/products/${productId}/skus/${sku.id}`)}
                    >
                      详情
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setPreviewSku(sku)}
                      disabled={!sku.image_url}
                    >
                      预览
                    </Button>
                    <SkuImageUploader productId={productId} skuId={sku.id} canEdit={canEdit} />
                    <Button variant='outline' size='sm' disabled>
                      编辑
                    </Button>
                    <Button variant='destructive' size='sm' onClick={() => removeSku(sku)}>
                      提交删除申请
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant='secondary' size='sm' onClick={() => router.push(`/dashboard/products/${productId}/skus/${sku.id}`)}>
                      详情
                    </Button>
                    <Button variant='outline' size='sm' disabled={!sku.image_url}>
                      预览
                    </Button>
                    <Button variant='secondary' size='sm' disabled>
                      上传图片
                    </Button>
                    <Button variant='outline' size='sm' disabled>
                      编辑
                    </Button>
                    <Button variant='destructive' size='sm' disabled>
                      提交删除申请
                    </Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>提交后将进入商品审核，审核通过后才会生效。</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            {formError ? (
              <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {formError}
              </div>
            ) : null}
            <div className='grid gap-2'>
              <Label htmlFor='name'>SKU 名称</Label>
              <Input
                id='name'
                value={formData.name}
                className={cn(fieldErrors.name && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('name'); setFormData((prev) => ({ ...prev, name: event.target.value })); }}
              />
              {fieldErrors.name ? <p className='text-xs text-destructive'>{fieldErrors.name}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='sku_code'>SKU 编码</Label>
              <Input
                id='sku_code'
                value={formData.sku_code}
                className={cn(fieldErrors.sku_code && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('sku_code'); setFormData((prev) => ({ ...prev, sku_code: event.target.value })); }}
              />
              {fieldErrors.sku_code ? <p className='text-xs text-destructive'>{fieldErrors.sku_code}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='spec'>规格</Label>
              <Input
                id='spec'
                value={formData.spec}
                className={cn(fieldErrors.spec && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('spec'); setFormData((prev) => ({ ...prev, spec: event.target.value })); }}
              />
              {fieldErrors.spec ? <p className='text-xs text-destructive'>{fieldErrors.spec}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='packaging'>包装</Label>
              <Input
                id='packaging'
                value={formData.packaging}
                className={cn(fieldErrors.packaging && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('packaging'); setFormData((prev) => ({ ...prev, packaging: event.target.value })); }}
              />
              {fieldErrors.packaging ? <p className='text-xs text-destructive'>{fieldErrors.packaging}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='unit'>单位</Label>
              <Input
                id='unit'
                value={formData.unit}
                className={cn(fieldErrors.unit && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('unit'); setFormData((prev) => ({ ...prev, unit: event.target.value })); }}
              />
              {fieldErrors.unit ? <p className='text-xs text-destructive'>{fieldErrors.unit}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='barcode'>条码</Label>
              <Input
                id='barcode'
                value={formData.barcode}
                className={cn(fieldErrors.barcode && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('barcode'); setFormData((prev) => ({ ...prev, barcode: event.target.value })); }}
              />
              {fieldErrors.barcode ? <p className='text-xs text-destructive'>{fieldErrors.barcode}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='qr_code'>二维码</Label>
              <Textarea
                id='qr_code'
                value={formData.qr_code}
                className={cn(fieldErrors.qr_code && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('qr_code'); setFormData((prev) => ({ ...prev, qr_code: event.target.value })); }}
              />
              {fieldErrors.qr_code ? <p className='text-xs text-destructive'>{fieldErrors.qr_code}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='order_quota_price'>订货额单价</Label>
              <Input
                id='order_quota_price'
                type='number'
                value={formData.order_quota_price}
                className={cn(fieldErrors.order_quota_price && 'border-destructive ring-destructive/30')}
                onChange={(event) =>
                  { clearFieldError('order_quota_price'); setFormData((prev) => ({ ...prev, order_quota_price: event.target.value })); }
                }
              />
              {fieldErrors.order_quota_price ? <p className='text-xs text-destructive'>{fieldErrors.order_quota_price}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='redeem_points_price'>积分兑换价</Label>
              <Input
                id='redeem_points_price'
                type='number'
                min='0'
                value={formData.redeem_points_price}
                className={cn(fieldErrors.redeem_points_price && 'border-destructive ring-destructive/30')}
                onChange={(event) =>
                  { clearFieldError('redeem_points_price'); setFormData((prev) => ({ ...prev, redeem_points_price: event.target.value })); }
                }
              />
              {fieldErrors.redeem_points_price ? <p className='text-xs text-destructive'>{fieldErrors.redeem_points_price}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='sale_price'>售价</Label>
              <Input
                id='sale_price'
                type='number'
                min='0'
                value={formData.sale_price}
                className={cn(fieldErrors.sale_price && 'border-destructive ring-destructive/30')}
                onChange={(event) =>
                  { clearFieldError('sale_price'); setFormData((prev) => ({ ...prev, sale_price: event.target.value })); }
                }
              />
              {fieldErrors.sale_price ? <p className='text-xs text-destructive'>{fieldErrors.sale_price}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label>状态</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder='请选择状态' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='启用'>启用</SelectItem>
                  <SelectItem value='停用'>停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewSku)} onOpenChange={(open) => (!open ? setPreviewSku(null) : null)}>
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>{previewSku ? `SKU 图片预览 - ${previewSku.sku_code}` : 'SKU 图片预览'}</DialogTitle>
            <DialogDescription>用于确认 SKU 图片是否上传正确、清晰可用。</DialogDescription>
          </DialogHeader>
          {previewSku?.image_url ? (
            <div className='overflow-hidden rounded-lg border bg-muted/20 p-4'>
              <img
                src={previewSku.image_url}
                alt={previewSku.sku_code}
                className='mx-auto max-h-[60vh] rounded-md object-contain'
              />
            </div>
          ) : (
            <div className='rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground'>
              当前 SKU 还没有上传图片。
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
