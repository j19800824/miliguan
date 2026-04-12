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
import { Textarea } from '@/components/ui/textarea';

export function CompanyDetailActions({
  companyId,
  canEditCompanyStores,
  canEditPoints
}: {
  companyId: string;
  canEditCompanyStores: boolean;
  canEditPoints: boolean;
}) {
  const router = useRouter();
  const [storeOpen, setStoreOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [storeForm, setStoreForm] = useState({
    name: '',
    code: '',
    address: '',
    manager_name: '',
    status: '营业中'
  });
  const [pointsForm, setPointsForm] = useState({
    change_type: '增加',
    points_amount: '0',
    reason: '',
    status: '待审核'
  });

  const submitStore = async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/companies/${companyId}/stores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(storeForm)
    });
    setLoading(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '新增门店失败' }));
      toast.error(error.message ?? '新增门店失败');
      return;
    }

    toast.success('门店已新增');
    setStoreOpen(false);
    setStoreForm({
      name: '',
      code: '',
      address: '',
      manager_name: '',
      status: '营业中'
    });
    router.refresh();
  };

  const submitPoints = async () => {
    setLoading(true);
    const response = await fetch('/api/admin/points/adjustments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...pointsForm,
        company_id: companyId
      })
    });
    setLoading(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '积分调整申请失败' }));
      toast.error(error.message ?? '积分调整申请失败');
      return;
    }

    toast.success('积分调整申请已提交');
    setPointsOpen(false);
    setPointsForm({
      change_type: '增加',
      points_amount: '0',
      reason: '',
      status: '待审核'
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
            <DialogDescription>新增分公司下属社区门店，并在后台纳管。</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='store-name'>门店名称</Label>
              <Input
                id='store-name'
                value={storeForm.name}
                onChange={(event) => setStoreForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='store-code'>门店编码</Label>
              <Input
                id='store-code'
                value={storeForm.code}
                onChange={(event) => setStoreForm((prev) => ({ ...prev, code: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='store-address'>地址</Label>
              <Input
                id='store-address'
                value={storeForm.address}
                onChange={(event) => setStoreForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='store-manager'>负责人</Label>
              <Input
                id='store-manager'
                value={storeForm.manager_name}
                onChange={(event) =>
                  setStoreForm((prev) => ({ ...prev, manager_name: event.target.value }))
                }
              />
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

      <Dialog open={pointsOpen} onOpenChange={setPointsOpen}>
        <DialogTrigger asChild>
          <Button disabled={!canEditPoints}>发起积分调整</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>发起积分调整</DialogTitle>
            <DialogDescription>提交总部对分公司的积分增减申请。</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label>变更类型</Label>
              <Select
                value={pointsForm.change_type}
                onValueChange={(value) => setPointsForm((prev) => ({ ...prev, change_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='增加'>增加</SelectItem>
                  <SelectItem value='减少'>减少</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='points-amount'>积分数</Label>
              <Input
                id='points-amount'
                type='number'
                value={pointsForm.points_amount}
                onChange={(event) =>
                  setPointsForm((prev) => ({ ...prev, points_amount: event.target.value }))
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='points-reason'>原因</Label>
              <Textarea
                id='points-reason'
                value={pointsForm.reason}
                onChange={(event) => setPointsForm((prev) => ({ ...prev, reason: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setPointsOpen(false)}>
              取消
            </Button>
            <Button onClick={submitPoints} disabled={loading}>
              {loading ? '提交中...' : '提交申请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
