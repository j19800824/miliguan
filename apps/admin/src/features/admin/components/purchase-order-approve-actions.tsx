'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function PurchaseOrderApproveActions({
  orderId,
  disabled = false
}: {
  orderId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const submit = async (result: '通过' | '驳回') => {
    setLoading(result === '通过' ? 'approve' : 'reject');
    const response = await fetch(`/api/admin/purchase-orders/${orderId}/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        result,
        note: result === '通过' ? '总部审核通过，进入待入库' : '总部审核驳回，请重新调整订货信息',
        final_status: '待入库'
      })
    });
    setLoading(null);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '操作失败' }));
      toast.error(error.message ?? '操作失败');
      return;
    }

    toast.success(result === '通过' ? '订货单已审核通过，等待确认入库' : '订货单已驳回');
    router.refresh();
  };

  return (
    <div className='flex gap-2'>
      <Button disabled={disabled || loading !== null} onClick={() => submit('通过')}>
        {loading === 'approve' ? '审核中...' : '审核通过'}
      </Button>
      <Button
        variant='destructive'
        disabled={disabled || loading !== null}
        onClick={() => submit('驳回')}
      >
        {loading === 'reject' ? '处理中...' : '驳回'}
      </Button>
    </div>
  );
}
