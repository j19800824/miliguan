'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function PurchaseOrderRefundActions({
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
    const confirmed = window.confirm('确认这张订货单已发生退货吗？确认后会回退库存并回补分公司的订货额度。');
    if (!confirmed) {
      setLoading(false);
      return;
    }
    const response = await fetch(`/api/admin/purchase-orders/${orderId}/refund`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: '订货单完成退货，系统自动回补订货额度并回退库存'
      })
    });
    setLoading(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '订货单退货失败' }));
      toast.error(error.message ?? '订货单退货失败');
      return;
    }

    toast.success('订货单已退货并自动回补订货额度');
    router.refresh();
  };

  return (
    <Button variant='secondary' disabled={disabled || loading} onClick={submit}>
      {loading ? '处理中...' : '完成退货'}
    </Button>
  );
}
