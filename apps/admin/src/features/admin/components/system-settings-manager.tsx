'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { readApiError, type FieldErrors } from '@/lib/form-errors';
import { cn } from '@/lib/utils';

type SettingRow = {
  id: string;
  setting_key: string;
  category: string;
  setting_name: string;
  setting_value: string;
  description: string;
  updated_by: string;
  updated_at: string;
};

export function SystemSettingsManager({
  rows,
  canEdit
}: {
  rows: SettingRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, { setting_value: string; description: string }>>(
    Object.fromEntries(
      rows.map((row) => [
        row.id,
        { setting_value: row.setting_value, description: row.description }
      ])
    )
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const clearRowFieldError = (rowId: string, field: string) => {
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[`${rowId}.${field}`];
      return next;
    });
    setFormErrors((errors) => {
      const next = { ...errors };
      delete next[rowId];
      return next;
    });
  };

  const parseLevelRules = (value: string) => {
    try {
      return JSON.parse(value) as Record<string, number>;
    } catch {
      return {
        战略级: 598000,
        成长级: 398000,
        标准级: 298000,
        孵化级: 198000
      };
    }
  };

  const managedOrderQuotaKeys = new Set([
    'order_quota.default_company_level',
    'order_quota.level_rules',
    'order_quota.default_store_quota',
    'order_quota.first_store_receipt_return_ratio',
    'order_quota.rebate_ratio'
  ]);
  const orderQuotaSettings = rows.filter((row) => row.category === '订货额度规则');
  const otherSettings = rows.filter((row) => !managedOrderQuotaKeys.has(row.setting_key));
  const defaultLevelRow = orderQuotaSettings.find((row) => row.setting_key === 'order_quota.default_company_level');
  const levelRulesRow = orderQuotaSettings.find((row) => row.setting_key === 'order_quota.level_rules');
  const storeQuotaRows = orderQuotaSettings.filter((row) =>
    [
      'order_quota.default_store_quota',
      'order_quota.first_store_receipt_return_ratio',
      'order_quota.rebate_ratio'
    ].includes(row.setting_key)
  );

  const renderSettingEditor = (row: SettingRow) => {
    if (row.setting_key === 'order_quota.default_company_level') {
      return (
        <div className='grid gap-3 lg:grid-cols-[1fr_1.2fr]'>
          <Select
            value={drafts[row.id]?.setting_value ?? '标准级'}
            onValueChange={(value) =>
              setDrafts((prev) => ({
                ...prev,
                [row.id]: { ...prev[row.id], setting_value: value }
              }))
            }
            disabled={!canEdit}
          >
            <SelectTrigger className={cn(fieldErrors[`${row.id}.setting_value`] && 'border-destructive ring-destructive/30')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(parseLevelRules(drafts[levelRulesRow?.id ?? row.id]?.setting_value ?? '{}')).map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={drafts[row.id]?.description ?? ''}
            onChange={(event) => {
              clearRowFieldError(row.id, 'description');
              setDrafts((prev) => ({
                ...prev,
                [row.id]: { ...prev[row.id], description: event.target.value }
              }));
            }}
            disabled={!canEdit}
          />
        </div>
      );
    }

    if (row.setting_key === 'order_quota.level_rules') {
      const levelRules = parseLevelRules(drafts[row.id]?.setting_value ?? '{}');
      const defaultLevel = drafts[defaultLevelRow?.id ?? '']?.setting_value ?? '标准级';
      return (
        <div className='space-y-4'>
          <div className='rounded-lg border bg-muted/20 p-4'>
            <div className='text-sm font-medium'>分公司等级额度配置</div>
            <div className='mt-1 text-sm text-muted-foreground'>
              新建分公司会按默认等级自动初始化可用订货额度。调整这里后，现有分公司也会同步按等级重算订货额度。
            </div>
          </div>
          <div className='grid gap-3 md:grid-cols-2'>
            {Object.entries(levelRules).map(([level, quota]) => (
              <div key={level} className='rounded-lg border p-4'>
                <div className='mb-3 flex items-center justify-between gap-3'>
                  <div className='font-medium'>{level}</div>
                  {defaultLevel === level ? (
                    <span className='rounded-full bg-primary/10 px-2 py-1 text-xs text-primary'>默认等级</span>
                  ) : null}
                </div>
                <div className='grid gap-2'>
                  <Label>{level}订货额度</Label>
                  <Input
                    type='number'
                    value={String(quota)}
                    disabled={!canEdit}
                    className={cn(fieldErrors[`${row.id}.setting_value`] && 'border-destructive ring-destructive/30')}
                    onChange={(event) => {
                      clearRowFieldError(row.id, 'setting_value');
                      const next = parseLevelRules(drafts[row.id]?.setting_value ?? '{}');
                      next[level] = Number(event.target.value || 0);
                      setDrafts((prev) => ({
                        ...prev,
                        [row.id]: {
                          ...prev[row.id],
                          setting_value: JSON.stringify(next)
                        }
                      }));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className='rounded-lg border p-4'>
            <Label className='mb-2 block'>规则说明</Label>
            <Textarea
              value={drafts[row.id]?.description ?? ''}
              onChange={(event) =>
                {
                  clearRowFieldError(row.id, 'description');
                  setDrafts((prev) => ({
                  ...prev,
                  [row.id]: { ...prev[row.id], description: event.target.value }
                  }));
                }
              }
              disabled={!canEdit}
            />
          </div>
        </div>
      );
    }

    return (
      <div className='grid gap-3 lg:grid-cols-[1fr_1.2fr]'>
        <Input
          value={drafts[row.id]?.setting_value ?? ''}
          className={cn(fieldErrors[`${row.id}.setting_value`] && 'border-destructive ring-destructive/30')}
          onChange={(event) =>
            {
              clearRowFieldError(row.id, 'setting_value');
              setDrafts((prev) => ({
              ...prev,
              [row.id]: { ...prev[row.id], setting_value: event.target.value }
              }));
            }
          }
          disabled={!canEdit}
        />
        <Textarea
          value={drafts[row.id]?.description ?? ''}
          onChange={(event) =>
            {
              clearRowFieldError(row.id, 'description');
              setDrafts((prev) => ({
              ...prev,
              [row.id]: { ...prev[row.id], description: event.target.value }
              }));
            }
          }
          disabled={!canEdit}
        />
      </div>
    );
  };

  const save = async (id: string) => {
    const draft = drafts[id];
    if (!String(draft?.setting_value ?? '').trim()) {
      setFieldErrors((errors) => ({ ...errors, [`${id}.setting_value`]: '请填写配置值' }));
      setFormErrors((errors) => ({ ...errors, [id]: '请填写配置值' }));
      toast.error('请填写配置值');
      return;
    }
    setSavingId(id);
    setFieldErrors((errors) => {
      const next = { ...errors };
      delete next[`${id}.setting_value`];
      delete next[`${id}.description`];
      return next;
    });
    setFormErrors((errors) => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
    const response = await fetch(`/api/admin/settings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...drafts[id],
        updated_by: '后台用户'
      })
    });
    setSavingId(null);

    if (!response.ok) {
      const error = await readApiError(response, '保存失败');
      setFormErrors((errors) => ({ ...errors, [id]: error.message ?? '保存失败' }));
      if (error.fieldErrors?.setting_value) {
        setFieldErrors((errors) => ({ ...errors, [`${id}.setting_value`]: error.fieldErrors!.setting_value }));
      }
      toast.error(error.message ?? '保存失败');
      return;
    }

    toast.success('系统设置已保存');
    router.refresh();
  };

  return (
    <div className='space-y-4'>
      {defaultLevelRow || levelRulesRow || storeQuotaRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>订货额度配置</CardTitle>
            <CardDescription>统一维护分公司等级额度、门店默认额度、首次收货回补和核销回弹比例。</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {[defaultLevelRow, levelRulesRow, ...storeQuotaRows].filter(Boolean).map((row) => (
              <div key={row!.id} className='rounded-lg border p-4'>
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div>
                    <div className='text-sm text-muted-foreground'>{row!.category} / {row!.setting_key}</div>
                    <div className='font-medium'>{row!.setting_name}</div>
                  </div>
                  <Button
                    size='sm'
                    disabled={!canEdit || savingId === row!.id}
                    onClick={() => save(row!.id)}
                  >
                    {savingId === row!.id ? '保存中...' : '保存'}
                  </Button>
                </div>
                {renderSettingEditor(row!)}
                {formErrors[row!.id] ? (
                  <div className='mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                    {formErrors[row!.id]}
                  </div>
                ) : null}
                {fieldErrors[`${row!.id}.setting_value`] ? (
                  <p className='mt-2 text-xs text-destructive'>{fieldErrors[`${row!.id}.setting_value`]}</p>
                ) : null}
                <div className='mt-3 text-xs text-muted-foreground'>
                  最近更新：{row!.updated_at} / {row!.updated_by}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {otherSettings.map((row) => (
        <div key={row.id} className='rounded-lg border p-4'>
          <div className='mb-3 flex items-start justify-between gap-3'>
            <div>
              <div className='text-sm text-muted-foreground'>{row.category} / {row.setting_key}</div>
              <div className='font-medium'>{row.setting_name}</div>
            </div>
            <Button
              size='sm'
              disabled={!canEdit || savingId === row.id}
              onClick={() => save(row.id)}
            >
              {savingId === row.id ? '保存中...' : '保存'}
            </Button>
          </div>
          {renderSettingEditor(row)}
          {formErrors[row.id] ? (
            <div className='mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
              {formErrors[row.id]}
            </div>
          ) : null}
          {fieldErrors[`${row.id}.setting_value`] ? (
            <p className='mt-2 text-xs text-destructive'>{fieldErrors[`${row.id}.setting_value`]}</p>
          ) : null}
          <div className='mt-3 text-xs text-muted-foreground'>
            最近更新：{row.updated_at} / {row.updated_by}
          </div>
        </div>
      ))}
    </div>
  );
}
