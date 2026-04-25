'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { readApiError, type FieldErrors } from '@/lib/form-errors';
import { cn } from '@/lib/utils';

type SelectOption = {
  value: string;
  label: string;
};

export function InventoryAdjustmentActions({
  canEdit,
  companyOptions,
  skuOptions
}: {
  canEdit: boolean;
  companyOptions: SelectOption[];
  skuOptions: SelectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    company_id: companyOptions[0]?.value ?? '',
    sku_id: skuOptions[0]?.value ?? '',
    requested_quantity: '',
    reason: '',
    status: '待审核'
  });

  const submit = async () => {
    const nextErrors: FieldErrors = {};
    if (!form.company_id) {
      nextErrors.company_id = '请选择分公司';
    }
    if (!form.sku_id) {
      nextErrors.sku_id = '请选择 SKU';
    }
    if (!Number.isInteger(Number(form.requested_quantity)) || Number(form.requested_quantity) < 0) {
      nextErrors.requested_quantity = '申请库存必须为非负整数';
    }
    if (!form.reason.trim()) {
      nextErrors.reason = '请填写库存调整原因';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      const message = Object.values(nextErrors)[0] ?? '请检查表单字段';
      setFormError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    setFieldErrors({});
    setFormError('');
    const response = await fetch('/api/admin/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        requested_quantity: Number(form.requested_quantity)
      })
    });
    setLoading(false);

    if (!response.ok) {
      const error = await readApiError(response, '库存调整申请失败');
      setFieldErrors(error.fieldErrors ?? {});
      setFormError(error.message ?? '库存调整申请失败');
      toast.error(error.message ?? '库存调整申请失败');
      return;
    }

    const body = await response.json().catch(() => ({ message: '库存调整申请已提交' }));
    toast.success(body.message ?? '库存调整申请已提交');
    setOpen(false);
    setForm({
      company_id: companyOptions[0]?.value ?? '',
      sku_id: skuOptions[0]?.value ?? '',
      requested_quantity: '',
      reason: '',
      status: '待审核'
    });
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!canEdit}>发起库存调整</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发起库存调整</DialogTitle>
          <DialogDescription>调整申请提交后需审核通过，库存和流水才会真正更新。</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {formError ? (
            <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
              {formError}
            </div>
          ) : null}
          <div className='grid gap-2'>
            <Label>分公司</Label>
            <Select
              value={form.company_id}
              onValueChange={(value) => {
                setFieldErrors((errors) => {
                  const { company_id: _ignored, ...rest } = errors;
                  return rest;
                });
                setForm((prev) => ({ ...prev, company_id: value }));
              }}
            >
              <SelectTrigger className={cn(fieldErrors.company_id && 'border-destructive ring-destructive/30')}>
                <SelectValue placeholder='请选择分公司' />
              </SelectTrigger>
              <SelectContent>
                {companyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.company_id ? <p className='text-xs text-destructive'>{fieldErrors.company_id}</p> : null}
          </div>

          <div className='grid gap-2'>
            <Label>SKU</Label>
            <Select
              value={form.sku_id}
              onValueChange={(value) => {
                setFieldErrors((errors) => {
                  const { sku_id: _ignored, ...rest } = errors;
                  return rest;
                });
                setForm((prev) => ({ ...prev, sku_id: value }));
              }}
            >
              <SelectTrigger className={cn(fieldErrors.sku_id && 'border-destructive ring-destructive/30')}>
                <SelectValue placeholder='请选择 SKU' />
              </SelectTrigger>
              <SelectContent>
                {skuOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.sku_id ? <p className='text-xs text-destructive'>{fieldErrors.sku_id}</p> : null}
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='requested_quantity'>申请库存</Label>
            <Input
              id='requested_quantity'
              type='number'
              min='0'
              step='1'
              value={form.requested_quantity}
              className={cn(fieldErrors.requested_quantity && 'border-destructive ring-destructive/30')}
              onChange={(event) =>
                {
                  setFieldErrors((errors) => {
                    const { requested_quantity: _ignored, ...rest } = errors;
                    return rest;
                  });
                  setForm((prev) => ({ ...prev, requested_quantity: event.target.value }));
                }
              }
            />
            {fieldErrors.requested_quantity ? <p className='text-xs text-destructive'>{fieldErrors.requested_quantity}</p> : null}
          </div>

          <div className='grid gap-2'>
            <Label htmlFor='reason'>调整原因</Label>
            <Textarea
              id='reason'
              value={form.reason}
              className={cn(fieldErrors.reason && 'border-destructive ring-destructive/30')}
              onChange={(event) => {
                setFieldErrors((errors) => {
                  const { reason: _ignored, ...rest } = errors;
                  return rest;
                });
                setForm((prev) => ({ ...prev, reason: event.target.value }));
              }}
            />
            {fieldErrors.reason ? <p className='text-xs text-destructive'>{fieldErrors.reason}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? '提交中...' : '提交申请'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
