'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  id: string;
  disabled?: boolean;
}

export function SplitRuleDeleteButton({ id, disabled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (!confirm('停用后该规则不再参与新订单分账，确定？')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payment-split-rules/${id}`, {
        method: 'DELETE',
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message ?? '停用失败');
        return;
      }
      toast.success('已停用');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size='sm'
      variant='ghost'
      className='text-destructive hover:text-destructive'
      onClick={onClick}
      disabled={loading || disabled}
    >
      {loading ? '处理中...' : '停用'}
    </Button>
  );
}
