'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ApprovalDecisionActions({
  endpoint,
  canApprove,
  label = '审核'
}: {
  endpoint: string;
  canApprove: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const submit = async (result: '通过' | '驳回') => {
    setLoading(result === '通过' ? 'approve' : 'reject');
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, note: `${label}${result}` })
    });
    setLoading(null);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `${label}失败` }));
      toast.error(error.message ?? `${label}失败`);
      return;
    }

    toast.success(result === '通过' ? `${label}已通过` : `${label}已驳回`);
    router.refresh();
  };

  return (
    <div className='flex gap-2'>
      <Button
        size='sm'
        variant='outline'
        disabled={!canApprove || loading !== null}
        onClick={() => submit('通过')}
      >
        {loading === 'approve' ? '处理中...' : '通过'}
      </Button>
      <Button
        size='sm'
        variant='destructive'
        disabled={!canApprove || loading !== null}
        onClick={() => submit('驳回')}
      >
        {loading === 'reject' ? '处理中...' : '驳回'}
      </Button>
    </div>
  );
}
