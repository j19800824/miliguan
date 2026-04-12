'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Option = { value: string; label: string };

export function StaffOrganizationActions({
  staffId,
  companyOptions,
  storeOptions,
  initialCompanyId,
  initialStoreId,
  canEdit
}: {
  staffId: string;
  companyOptions: Option[];
  storeOptions: Option[];
  initialCompanyId: string;
  initialStoreId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(initialCompanyId || 'none');
  const [storeId, setStoreId] = useState(initialStoreId || 'none');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/staff/${staffId}/organization`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, store_id: storeId })
    });
    setLoading(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '保存失败' }));
      toast.error(error.message ?? '保存失败');
      return;
    }

    toast.success('员工组织关系已保存');
    router.refresh();
  };

  return (
    <div className='space-y-4'>
      <div className='grid gap-2'>
        <div className='text-sm font-medium'>所属分公司</div>
        <Select value={companyId} onValueChange={setCompanyId} disabled={!canEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>未绑定</SelectItem>
            {companyOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-2'>
        <div className='text-sm font-medium'>所属门店</div>
        <Select value={storeId} onValueChange={setStoreId} disabled={!canEdit}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>未绑定</SelectItem>
            {storeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={save} disabled={!canEdit || loading}>
        {loading ? '保存中...' : '保存组织关系'}
      </Button>
    </div>
  );
}
