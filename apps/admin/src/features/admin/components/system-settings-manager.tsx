'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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

  const save = async (id: string) => {
    setSavingId(id);
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
      const error = await response.json().catch(() => ({ message: '保存失败' }));
      toast.error(error.message ?? '保存失败');
      return;
    }

    toast.success('系统设置已保存');
    router.refresh();
  };

  return (
    <div className='space-y-4'>
      {rows.map((row) => (
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
          <div className='grid gap-3 lg:grid-cols-[1fr_1.2fr]'>
            <Input
              value={drafts[row.id]?.setting_value ?? ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [row.id]: { ...prev[row.id], setting_value: event.target.value }
                }))
              }
              disabled={!canEdit}
            />
            <Textarea
              value={drafts[row.id]?.description ?? ''}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [row.id]: { ...prev[row.id], description: event.target.value }
                }))
              }
              disabled={!canEdit}
            />
          </div>
          <div className='mt-3 text-xs text-muted-foreground'>
            最近更新：{row.updated_at} / {row.updated_by}
          </div>
        </div>
      ))}
    </div>
  );
}
