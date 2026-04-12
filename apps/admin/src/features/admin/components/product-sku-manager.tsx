'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { SkuImageUploader } from './sku-image-uploader';

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
  points_price: number;
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
  points_price: string;
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
  points_price: '',
  redeem_points_price: '',
  sale_price: '',
  status: '启用'
};

function mapSkuToForm(sku: ProductSku): FormState {
  return {
    name: sku.name,
    sku_code: sku.sku_code,
    spec: sku.spec,
    packaging: sku.packaging,
    unit: sku.unit,
    barcode: sku.barcode,
    qr_code: sku.qr_code,
    points_price: String(sku.points_price),
    redeem_points_price: String(sku.redeem_points_price),
    sale_price: String(sku.sale_price),
    status: sku.status
  };
}

export function ProductSkuManager({
  productId,
  canEdit,
  skus
}: {
  productId: string;
  canEdit: boolean;
  skus: ProductSku[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingSku, setEditingSku] = useState<ProductSku | null>(null);
  const [previewSku, setPreviewSku] = useState<ProductSku | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const dialogTitle = useMemo(
    () => (editingSku ? `编辑 SKU ${editingSku.sku_code}` : '新增 SKU'),
    [editingSku]
  );

  function openCreate() {
    setEditingSku(null);
    setFormData(EMPTY_FORM);
    setIsOpen(true);
  }

  function openEdit(sku: ProductSku) {
    setEditingSku(sku);
    setFormData(mapSkuToForm(sku));
    setIsOpen(true);
  }

  async function submit() {
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
        toast.error(`${label}不能为空`);
        return;
      }
    }

    const requiredNumberFields: Array<[keyof FormState, string]> = [
      ['points_price', '订货积分价'],
      ['redeem_points_price', '积分兑换价'],
      ['sale_price', '售价']
    ];

    for (const [key, label] of requiredNumberFields) {
      if (!(Number(formData[key] || 0) > 0)) {
        toast.error(`${label}必须大于 0`);
        return;
      }
    }

    setIsSubmitting(true);
    const method = editingSku ? 'PUT' : 'POST';
    const url = editingSku
      ? `/api/admin/products/${productId}/skus/${editingSku.id}`
      : `/api/admin/products/${productId}/skus`;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        points_price: Number(formData.points_price || 0),
        redeem_points_price: Number(formData.redeem_points_price || 0),
        sale_price: Number(formData.sale_price || 0)
      })
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '保存 SKU 失败' }));
      toast.error(error.message ?? '保存 SKU 失败');
      return;
    }

    const body = await response.json().catch(() => ({ message: editingSku ? 'SKU 更新成功' : 'SKU 新增成功' }));
    setIsOpen(false);
    toast.success(body.message ?? (editingSku ? 'SKU 更新成功' : 'SKU 新增成功'));
    router.refresh();
  }

  async function removeSku(sku: ProductSku) {
    if (!window.confirm(`确认删除 SKU ${sku.sku_code} 吗？`)) {
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
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU 编码</TableHead>
              <TableHead>SKU 名称</TableHead>
              <TableHead>规格</TableHead>
              <TableHead>包装</TableHead>
              <TableHead>单位</TableHead>
              <TableHead>条码</TableHead>
              <TableHead>图片</TableHead>
              <TableHead>二维码</TableHead>
              <TableHead>订货积分价</TableHead>
              <TableHead>积分兑换价</TableHead>
              <TableHead>售价</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skus.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className='py-10 text-center text-sm text-muted-foreground'>
                  暂无 SKU，请先新增一条 SKU 记录。
                </TableCell>
              </TableRow>
            ) : (
              skus.map((sku) => (
                <TableRow key={sku.id}>
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
                  <TableCell>{sku.points_price}</TableCell>
                  <TableCell>{sku.redeem_points_price}</TableCell>
                  <TableCell>¥{sku.sale_price}</TableCell>
                  <TableCell>
                    <Badge variant='outline'>{sku.status}</Badge>
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
                          <Button variant='outline' size='sm' onClick={() => openEdit(sku)}>
                            编辑
                          </Button>
                          <Button variant='destructive' size='sm' onClick={() => removeSku(sku)}>
                            删除
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
                            删除
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>提交后将进入商品审核，审核通过后才会生效。</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='name'>SKU 名称</Label>
              <Input
                id='name'
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='sku_code'>SKU 编码</Label>
              <Input
                id='sku_code'
                value={formData.sku_code}
                onChange={(event) => setFormData((prev) => ({ ...prev, sku_code: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='spec'>规格</Label>
              <Input
                id='spec'
                value={formData.spec}
                onChange={(event) => setFormData((prev) => ({ ...prev, spec: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='packaging'>包装</Label>
              <Input
                id='packaging'
                value={formData.packaging}
                onChange={(event) => setFormData((prev) => ({ ...prev, packaging: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='unit'>单位</Label>
              <Input
                id='unit'
                value={formData.unit}
                onChange={(event) => setFormData((prev) => ({ ...prev, unit: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='barcode'>条码</Label>
              <Input
                id='barcode'
                value={formData.barcode}
                onChange={(event) => setFormData((prev) => ({ ...prev, barcode: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='qr_code'>二维码</Label>
              <Textarea
                id='qr_code'
                value={formData.qr_code}
                onChange={(event) => setFormData((prev) => ({ ...prev, qr_code: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='points_price'>积分价</Label>
              <Input
                id='points_price'
                type='number'
                value={formData.points_price}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, points_price: event.target.value }))
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='redeem_points_price'>积分兑换价</Label>
              <Input
                id='redeem_points_price'
                type='number'
                min='0'
                value={formData.redeem_points_price}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, redeem_points_price: event.target.value }))
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='sale_price'>售价</Label>
              <Input
                id='sale_price'
                type='number'
                min='0'
                value={formData.sale_price}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, sale_price: event.target.value }))
                }
              />
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
