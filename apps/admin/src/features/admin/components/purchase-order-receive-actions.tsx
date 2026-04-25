'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function PurchaseOrderReceiveActions({
  orderId,
  disabled
}: {
  orderId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/purchase-orders/${orderId}/receive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '分公司确认收货，库存正式入库' })
    });
    setLoading(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '确认入库失败' }));
      toast.error(error.message ?? '确认入库失败');
      return;
    }

    toast.success('订货单已确认入库');
    router.refresh();
  };

  return (
    <Button disabled={disabled || loading} onClick={submit}>
      {loading ? '入库中...' : '确认入库'}
    </Button>
  );
}
