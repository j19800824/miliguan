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
import { readApiError, type FieldErrors } from '@/lib/form-errors';
import { cn } from '@/lib/utils';

export function CompanyDetailActions({
  companyId,
  canEditCompanyStores
}: {
  companyId: string;
  canEditCompanyStores: boolean;
}) {
  const router = useRouter();
  const [storeOpen, setStoreOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [storeForm, setStoreForm] = useState({
    name: '',
    address: '',
    manager_name: '',
    manager_phone: '',
    status: '营业中'
  });
  const clearFieldError = (name: string) => {
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[name];
      return next;
    });
  };

  const submitStore = async () => {
    const nextErrors: FieldErrors = {};
    if (!storeForm.name.trim()) nextErrors.name = '请填写门店名称';
    if (!storeForm.address.trim()) nextErrors.address = '请填写门店地址';
    if (!storeForm.manager_name.trim()) nextErrors.manager_name = '请填写负责人姓名';
    if (!storeForm.manager_phone.trim()) nextErrors.manager_phone = '请填写负责人电话';
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
    const response = await fetch(`/api/admin/companies/${companyId}/stores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(storeForm)
    });
    setLoading(false);

    if (!response.ok) {
      const error = await readApiError(response, '新增门店失败');
      setFieldErrors(error.fieldErrors ?? {});
      setFormError(error.message ?? '新增门店失败');
      toast.error(error.message ?? '新增门店失败');
      return;
    }

    toast.success('门店已新增');
    setStoreOpen(false);
    setStoreForm({
      name: '',
      address: '',
      manager_name: '',
      manager_phone: '',
      status: '营业中'
    });
    router.refresh();
  };

  return (
    <div className='flex gap-2'>
      <Dialog open={storeOpen} onOpenChange={setStoreOpen}>
        <DialogTrigger asChild>
          <Button variant='outline' disabled={!canEditCompanyStores}>
            新增门店
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增门店</DialogTitle>
            <DialogDescription>新增分公司下属社区门店，门店编码会根据分公司编码自动生成。</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            {formError ? (
              <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {formError}
              </div>
            ) : null}
            <div className='grid gap-2'>
              <Label htmlFor='store-name'>门店名称</Label>
              <Input
                id='store-name'
                value={storeForm.name}
                className={cn(fieldErrors.name && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('name'); setStoreForm((prev) => ({ ...prev, name: event.target.value })); }}
              />
              {fieldErrors.name ? <p className='text-xs text-destructive'>{fieldErrors.name}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='store-address'>地址</Label>
              <Input
                id='store-address'
                value={storeForm.address}
                className={cn(fieldErrors.address && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('address'); setStoreForm((prev) => ({ ...prev, address: event.target.value })); }}
              />
              {fieldErrors.address ? <p className='text-xs text-destructive'>{fieldErrors.address}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='store-manager-name'>负责人姓名</Label>
              <Input
                id='store-manager-name'
                value={storeForm.manager_name}
                className={cn(fieldErrors.manager_name && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('manager_name'); setStoreForm((prev) => ({ ...prev, manager_name: event.target.value })); }}
              />
              {fieldErrors.manager_name ? <p className='text-xs text-destructive'>{fieldErrors.manager_name}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='store-manager-phone'>负责人电话</Label>
              <Input
                id='store-manager-phone'
                value={storeForm.manager_phone}
                className={cn(fieldErrors.manager_phone && 'border-destructive ring-destructive/30')}
                onChange={(event) => { clearFieldError('manager_phone'); setStoreForm((prev) => ({ ...prev, manager_phone: event.target.value })); }}
              />
              {fieldErrors.manager_phone ? <p className='text-xs text-destructive'>{fieldErrors.manager_phone}</p> : null}
            </div>
            <div className='grid gap-2'>
              <Label>状态</Label>
              <Select
                value={storeForm.status}
                onValueChange={(value) => setStoreForm((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='营业中'>营业中</SelectItem>
                  <SelectItem value='筹备中'>筹备中</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setStoreOpen(false)}>
              取消
            </Button>
            <Button onClick={submitStore} disabled={loading}>
              {loading ? '保存中...' : '保存门店'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
