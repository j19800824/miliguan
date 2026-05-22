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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  storeId: string;
  storeName: string;
  activated: boolean;
  terminalSn?: string;
  canEdit: boolean;
}

export function SqbTerminalActivator({
  storeId,
  storeName,
  activated,
  terminalSn,
  canEdit,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState(`米粒冠 - ${storeName}`);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error('请输入激活码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/stores/${storeId}/sqb-activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed, name }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        terminalSn?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.message ?? '激活失败');
        return;
      }
      toast.success(`激活成功 · ${data.terminalSn ?? ''}`);
      setOpen(false);
      setCode('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size='sm'
          variant={activated ? 'outline' : 'default'}
          disabled={!canEdit}
        >
          {activated ? '重新激活' : '激活收钱吧终端'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>激活收钱吧终端 · {storeName}</DialogTitle>
          <DialogDescription>
            激活码可在收钱吧商户后台 → 终端管理 → 添加终端 获取。每个门店只需激活一次；如果重新激活会覆盖原有 terminal_key。
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3 py-2'>
          {activated && terminalSn && (
            <div className='rounded border bg-muted px-3 py-2 text-xs text-muted-foreground'>
              当前 terminal_sn:{' '}
              <span className='font-mono'>{terminalSn}</span>
            </div>
          )}
          <div className='space-y-1.5'>
            <Label htmlFor='sqb-activate-code'>激活码</Label>
            <Input
              id='sqb-activate-code'
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder='例如 4SO64ZLAXR'
              autoFocus
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='sqb-activate-name'>终端名称</Label>
            <Input
              id='sqb-activate-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='显示在收钱吧后台'
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={loading || !code.trim()}>
            {loading ? '激活中...' : '提交激活'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
