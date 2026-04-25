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

export function CompanyOrderQuotaActions({
  canEditOrderQuota,
  companyOptions,
  levelOptions
}: {
  canEditOrderQuota: boolean;
  companyOptions: { value: string; label: string }[];
  levelOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    company_id: companyOptions[0]?.value ?? '',
    adjustment_type: '临时额度调整',
    change_type: '增加',
    order_quota_amount: '0',
    reason: '',
    expires_at: '',
    target_company_level: levelOptions[0]?.value ?? '',
    status: '待审核'
  });

  const clearFieldError = (name: string) => {
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[name];
      return next;
    });
  };

  const submit = async () => {
    const nextErrors: FieldErrors = {};
    if (!form.company_id) {
      nextErrors.company_id = '请选择分公司';
    }
    if (!form.reason.trim()) {
      nextErrors.reason = '请填写订货额度调整原因';
    }
    if (form.adjustment_type === '临时额度调整') {
      if (!(Number(form.order_quota_amount) > 0)) {
        nextErrors.order_quota_amount = '临时额度调整的订货额度必须大于 0';
      }
      if (!form.expires_at) {
        nextErrors.expires_at = '请设置回调日期';
      }
    }
    if (form.adjustment_type === '等级调整' && !form.target_company_level) {
      nextErrors.target_company_level = '请选择目标分公司等级';
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
    const response = await fetch('/api/admin/order-quota/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setLoading(false);

    if (!response.ok) {
      const error = await readApiError(response, '订货额度调整申请失败');
      setFieldErrors(error.fieldErrors ?? {});
      setFormError(error.message ?? '订货额度调整申请失败');
      toast.error(error.message ?? '订货额度调整申请失败');
      return;
    }

    toast.success('订货额度调整申请已提交');
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='secondary' disabled={!canEditOrderQuota}>
          发起订货额度调整
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发起订货额度调整</DialogTitle>
          <DialogDescription>在分公司列表页统一提交临时额度调整或等级调整申请。</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {formError ? (
            <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
              {formError}
            </div>
          ) : null}
          <div className='grid gap-2'>
            <Label>分公司</Label>
            <Select value={form.company_id} onValueChange={(value) => { clearFieldError('company_id'); setForm((prev) => ({ ...prev, company_id: value })); }}>
              <SelectTrigger className={cn(fieldErrors.company_id && 'border-destructive ring-destructive/30')}><SelectValue /></SelectTrigger>
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
            <Label>调整途径</Label>
            <Select
              value={form.adjustment_type}
              onValueChange={(value) => {
                clearFieldError('adjustment_type');
                setForm((prev) => ({
                  ...prev,
                  adjustment_type: value,
                  order_quota_amount: value === '等级调整' ? '0' : prev.order_quota_amount,
                  expires_at: value === '临时额度调整' ? prev.expires_at : '',
                  target_company_level: value === '等级调整' ? prev.target_company_level : levelOptions[0]?.value ?? ''
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='临时额度调整'>临时额度调整</SelectItem>
                <SelectItem value='等级调整'>等级调整</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label>变更类型</Label>
            <Select
              value={form.change_type}
              onValueChange={(value) => { clearFieldError('change_type'); setForm((prev) => ({ ...prev, change_type: value })); }}
              disabled={form.adjustment_type === '等级调整'}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='增加'>增加</SelectItem>
                <SelectItem value='减少'>减少</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label>{form.adjustment_type === '等级调整' ? '等级调整通过后自动重算' : '订货额度'}</Label>
            <Input
              type='number'
              value={form.order_quota_amount}
              disabled={form.adjustment_type === '等级调整'}
              className={cn(fieldErrors.order_quota_amount && 'border-destructive ring-destructive/30')}
              onChange={(event) => { clearFieldError('order_quota_amount'); setForm((prev) => ({ ...prev, order_quota_amount: event.target.value })); }}
            />
            {fieldErrors.order_quota_amount ? <p className='text-xs text-destructive'>{fieldErrors.order_quota_amount}</p> : null}
          </div>
          {form.adjustment_type === '临时额度调整' ? (
            <div className='grid gap-2'>
              <Label>回调日期</Label>
              <Input
                type='datetime-local'
                value={form.expires_at}
                className={cn(fieldErrors.expires_at && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('expires_at'); setForm((prev) => ({ ...prev, expires_at: event.target.value })); }}
              />
              {fieldErrors.expires_at ? <p className='text-xs text-destructive'>{fieldErrors.expires_at}</p> : null}
            </div>
          ) : (
            <div className='grid gap-2'>
              <Label>目标分公司等级</Label>
              <Select value={form.target_company_level} onValueChange={(value) => { clearFieldError('target_company_level'); setForm((prev) => ({ ...prev, target_company_level: value })); }}>
                <SelectTrigger className={cn(fieldErrors.target_company_level && 'border-destructive ring-destructive/30')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {levelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.target_company_level ? <p className='text-xs text-destructive'>{fieldErrors.target_company_level}</p> : null}
            </div>
          )}
          <div className='grid gap-2'>
            <Label>原因</Label>
            <Textarea
              value={form.reason}
              className={cn(fieldErrors.reason && 'border-destructive ring-destructive/30')}
              onChange={(event) => { clearFieldError('reason'); setForm((prev) => ({ ...prev, reason: event.target.value })); }}
            />
            {fieldErrors.reason ? <p className='text-xs text-destructive'>{fieldErrors.reason}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading ? '提交中...' : '提交申请'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
