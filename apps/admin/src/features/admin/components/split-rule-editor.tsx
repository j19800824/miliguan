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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface SplitRuleFormValue {
  id?: string;
  scope: 'global' | 'company' | 'store' | 'sku';
  scopeId: string;
  recipientType: 'hq' | 'company' | 'store' | 'sales_staff';
  rateType: 'percent' | 'fixed' | 'percent_of_store' | 'residual';
  rateValue: number;
  priority: number;
  status: '启用' | '停用';
  remark: string;
}

const SCOPE_LABEL: Record<SplitRuleFormValue['scope'], string> = {
  global: '全局',
  company: '分公司',
  store: '门店',
  sku: 'SKU',
};

const RECIPIENT_LABEL: Record<SplitRuleFormValue['recipientType'], string> = {
  hq: '总部',
  company: '分公司',
  store: '门店',
  sales_staff: '销售员',
};

const RATE_TYPE_LABEL: Record<SplitRuleFormValue['rateType'], string> = {
  percent: '百分比 (0.05 = 5%)',
  fixed: '固定金额 (元)',
  percent_of_store: '门店净收入百分比',
  residual: '剩余',
};

const EMPTY: SplitRuleFormValue = {
  scope: 'global',
  scopeId: '',
  recipientType: 'hq',
  rateType: 'percent',
  rateValue: 0.05,
  priority: 100,
  status: '启用',
  remark: '',
};

interface Props {
  initial?: SplitRuleFormValue;
  trigger?: React.ReactNode;
  canEdit: boolean;
}

export function SplitRuleEditor({ initial, trigger, canEdit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SplitRuleFormValue>(initial ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(initial?.id);

  const submit = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const url = isEdit
        ? `/api/admin/payment-split-rules/${initial?.id}`
        : '/api/admin/payment-split-rules';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message ?? '保存失败');
        return;
      }
      toast.success(isEdit ? '已更新' : '已新建');
      setOpen(false);
      if (!isEdit) setValue(EMPTY);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size='sm'>编辑</Button>}
      </DialogTrigger>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑分账规则' : '新建分账规则'}</DialogTitle>
          <DialogDescription>
            规则按 priority 升序匹配。同一收款方多条规则只取优先级最高的生效。
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-2'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>作用范围</Label>
              <Select
                value={value.scope}
                onValueChange={(v: string) =>
                  setValue({ ...value, scope: v as SplitRuleFormValue['scope'] })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCOPE_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>范围 ID</Label>
              <Input
                value={value.scopeId}
                onChange={(e) => setValue({ ...value, scopeId: e.target.value })}
                placeholder={
                  value.scope === 'global' ? '(全局留空)' : '对应实体的 id'
                }
                disabled={value.scope === 'global'}
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>收款方</Label>
              <Select
                value={value.recipientType}
                onValueChange={(v: string) =>
                  setValue({
                    ...value,
                    recipientType: v as SplitRuleFormValue['recipientType'],
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECIPIENT_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>优先级</Label>
              <Input
                type='number'
                value={value.priority}
                onChange={(e) =>
                  setValue({ ...value, priority: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label>分账方式</Label>
              <Select
                value={value.rateType}
                onValueChange={(v: string) =>
                  setValue({
                    ...value,
                    rateType: v as SplitRuleFormValue['rateType'],
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RATE_TYPE_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label>数值</Label>
              <Input
                type='number'
                step='0.0001'
                value={value.rateValue}
                onChange={(e) =>
                  setValue({ ...value, rateValue: Number(e.target.value) || 0 })
                }
                disabled={value.rateType === 'residual'}
                placeholder={value.rateType === 'residual' ? '剩余（自动）' : ''}
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>状态</Label>
            <Select
              value={value.status}
              onValueChange={(v: string) =>
                setValue({ ...value, status: v as SplitRuleFormValue['status'] })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='启用'>启用</SelectItem>
                <SelectItem value='停用'>停用</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label>备注</Label>
            <Textarea
              value={value.remark}
              onChange={(e) => setValue({ ...value, remark: e.target.value })}
              rows={2}
              placeholder='例: 总部技术服务费 5%'
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
          <Button onClick={submit} disabled={loading || !canEdit}>
            {loading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
