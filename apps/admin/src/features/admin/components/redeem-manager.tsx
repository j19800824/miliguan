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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function RedeemManager({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    item_name: '',
    item_code: '',
    points_cost: '0',
    stock: '0',
    status: '启用',
    description: ''
  });

  const submit = async () => {
    setLoading(true);
    const response = await fetch('/api/admin/redeem/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setLoading(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '新增兑换商品失败' }));
      toast.error(error.message ?? '新增兑换商品失败');
      return;
    }

    toast.success('兑换商品已新增');
    setOpen(false);
    setForm({
      item_name: '',
      item_code: '',
      points_cost: '0',
      stock: '0',
      status: '启用',
      description: ''
    });
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!canEdit}>新增兑换商品</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增积分兑换商品</DialogTitle>
          <DialogDescription>用于一期轻量积分兑换能力。</DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'><Label>商品名称</Label><Input value={form.item_name} onChange={(e) => setForm((p) => ({ ...p, item_name: e.target.value }))} /></div>
          <div className='grid gap-2'><Label>兑换编码</Label><Input value={form.item_code} onChange={(e) => setForm((p) => ({ ...p, item_code: e.target.value }))} /></div>
          <div className='grid gap-2'><Label>积分成本</Label><Input type='number' value={form.points_cost} onChange={(e) => setForm((p) => ({ ...p, points_cost: e.target.value }))} /></div>
          <div className='grid gap-2'><Label>库存</Label><Input type='number' value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} /></div>
          <div className='grid gap-2'>
            <Label>状态</Label>
            <Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='启用'>启用</SelectItem>
                <SelectItem value='停用'>停用</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
