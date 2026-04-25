'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function MemberOrderHandleActions({
  orderId,
  status,
  canHandle,
  orderQuotaReturned
}: {
  orderId: string;
  status: string;
  canHandle: boolean;
  orderQuotaReturned: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<'writeoff' | 'resolve' | 'refund' | null>(null);

  const submit = async (action: 'writeoff' | 'resolve' | 'refund') => {
    setLoading(action);
    const response = await fetch(`/api/admin/member-orders/${orderId}/handle`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        note:
          action === 'writeoff'
            ? '后台人工触发核销并完成库存扣减'
            : action === 'refund'
              ? '散客订单退货完成，系统自动回补订货额度并回库'
            : '后台人工标记异常散客订单已处理'
      })
    });
    setLoading(null);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '处理失败' }));
      toast.error(error.message ?? '处理失败');
      return;
    }

    toast.success(
      action === 'writeoff'
        ? '散客订单已核销'
        : action === 'refund'
          ? '散客订单已退货并自动回补订货额度'
          : '异常订单已标记处理'
    );
    router.refresh();
  };

  return (
    <div className='flex gap-2'>
      <Button
        variant='outline'
        disabled={!canHandle || status === '已核销' || status === '已处理' || loading !== null}
        onClick={() => submit('writeoff')}
      >
        {loading === 'writeoff' ? '处理中...' : '执行核销'}
      </Button>
      <Button
        variant='secondary'
        disabled={!canHandle || status !== '已核销' || orderQuotaReturned || loading !== null}
        onClick={() => submit('refund')}
      >
        {loading === 'refund' ? '处理中...' : '完成退货'}
      </Button>
      <Button
        disabled={!canHandle || status !== '异常' || loading !== null}
        onClick={() => submit('resolve')}
      >
        {loading === 'resolve' ? '处理中...' : '标记异常已处理'}
      </Button>
    </div>
  );
}
