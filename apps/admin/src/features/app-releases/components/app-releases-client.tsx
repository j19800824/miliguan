'use client';

import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface AppRelease {
  id: string;
  platform: string;
  version: string;
  versionCode: number;
  fileName: string;
  fileSize: number;
  notes: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
}

function formatSize(bytes: number) {
  if (!bytes) return '-';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AppReleasesClient({
  initialReleases,
  canEdit
}: {
  initialReleases: AppRelease[];
  canEdit: boolean;
}) {
  const [releases, setReleases] = useState<AppRelease[]>(initialReleases);
  const [draft, setDraft] = useState({
    version: '',
    versionCode: '',
    notes: ''
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function refresh() {
    const res = await fetch('/api/admin/app-releases');
    if (res.ok) {
      const data = await res.json();
      setReleases(data.rows ?? []);
    }
  }

  function putWithProgress(url: string, body: File, contentType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`上传失败(${xhr.status})`));
      xhr.onerror = () => reject(new Error('上传失败（网络/跨域）'));
      xhr.send(body);
    });
  }

  function updateDraft(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleUpload() {
    if (!file) return setMsg({ type: 'err', text: '请选择 APK 文件' });
    if (!draft.version.trim()) return setMsg({ type: 'err', text: '请填写版本号' });
    setBusy(true);
    setProgress(0);
    setMsg(null);
    try {
      const signRes = await fetch('/api/admin/app-releases/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name })
      });
      const sign = await signRes.json();
      if (!signRes.ok) throw new Error(sign.message || '签名失败');
      await putWithProgress(sign.uploadUrl, file, sign.contentType || 'application/octet-stream');
      const createRes = await fetch('/api/admin/app-releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: draft.version.trim(),
          versionCode: Number(draft.versionCode) || 0,
          fileKey: sign.key,
          fileName: file.name,
          fileSize: file.size,
          notes: draft.notes.trim()
        })
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.message || '保存版本失败');
      setMsg({ type: 'ok', text: `已发布 v${draft.version.trim()}` });
      setDraft({ version: '', versionCode: '', notes: '' });
      setFile(null);
      await refresh();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : '上传失败' });
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string) {
    await fetch(`/api/admin/app-releases/${id}`, { method: 'PATCH' });
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm('确认删除该版本？（仅删除记录，OSS 文件需另行清理）')) return;
    await fetch(`/api/admin/app-releases/${id}`, { method: 'DELETE' });
    await refresh();
  }

  const fieldCls = 'pointer-events-auto bg-background text-foreground';

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-bold text-foreground'>应用发布</h1>
        <p className='text-sm text-muted-foreground'>
          上传安卓 APK 并发布新版本。公开下载页：
          <a href='/download' target='_blank' className='text-primary underline underline-offset-4'>
            /download
          </a>
        </p>
      </div>

      {canEdit && (
        <div className='relative z-0 rounded-xl border bg-card p-5 text-card-foreground'>
          <h2 className='mb-4 font-semibold'>上传新版本</h2>
          <div className='grid gap-4 sm:grid-cols-2'>
            <label className='block'>
              <span className='mb-1 block text-sm text-muted-foreground'>版本号（如 1.2.0）</span>
              <Input
                name='version'
                type='text'
                autoComplete='off'
                className={fieldCls}
                value={draft.version}
                onChange={(e) => updateDraft('version', e.target.value)}
                onInput={(e) => updateDraft('version', e.currentTarget.value)}
                disabled={busy}
              />
            </label>
            <label className='block'>
              <span className='mb-1 block text-sm text-muted-foreground'>versionCode（整数，可选）</span>
              <Input
                name='versionCode'
                type='text'
                autoComplete='off'
                className={fieldCls}
                value={draft.versionCode}
                onChange={(e) => updateDraft('versionCode', e.target.value.replace(/\D/g, ''))}
                onInput={(e) => updateDraft('versionCode', e.currentTarget.value.replace(/\D/g, ''))}
                disabled={busy}
                inputMode='numeric'
              />
            </label>
          </div>
          <label className='mt-4 block'>
            <span className='mb-1 block text-sm text-muted-foreground'>更新说明（可选）</span>
            <Textarea
              name='notes'
              className={cn(fieldCls, 'min-h-24 resize-y')}
              rows={3}
              value={draft.notes}
              onChange={(e) => updateDraft('notes', e.target.value)}
              onInput={(e) => updateDraft('notes', e.currentTarget.value)}
              disabled={busy}
            />
          </label>
          <label className='mt-4 block'>
            <span className='mb-1 block text-sm text-muted-foreground'>APK 文件</span>
            <Input
              type='file'
              accept='.apk,application/vnd.android.package-archive'
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className={fieldCls}
            />
          </label>

          {busy && (
            <div className='mt-4'>
              <div className='h-2 w-full overflow-hidden rounded bg-muted'>
                <div className='h-full bg-primary transition-all' style={{ width: `${progress}%` }} />
              </div>
              <p className='mt-1 text-xs text-muted-foreground'>上传中 {progress}%</p>
            </div>
          )}

          {msg && (
            <Alert variant={msg.type === 'err' ? 'destructive' : 'default'} className='mt-3'>
              <AlertDescription>{msg.text}</AlertDescription>
            </Alert>
          )}

          <Button
            type='button'
            onClick={handleUpload}
            isLoading={busy}
            className='mt-4'
          >
            上传并发布
          </Button>
        </div>
      )}

      <div className='rounded-xl border bg-card p-5 text-card-foreground'>
        <h2 className='mb-4 font-semibold'>版本列表</h2>
        {releases.length === 0 ? (
          <p className='py-6 text-center text-muted-foreground'>暂无版本</p>
        ) : (
          <div className='space-y-2'>
            {releases.map((r) => (
              <div
                key={r.id}
                className='flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3'
              >
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium'>v{r.version}</span>
                    {r.isActive && (
                      <span className='rounded bg-primary/10 px-2 py-0.5 text-xs text-primary'>
                        当前版本
                      </span>
                    )}
                  </div>
                  <p className='truncate text-xs text-muted-foreground'>
                    versionCode {r.versionCode || '-'} · {formatSize(r.fileSize)} · {new Date(r.createdAt).toLocaleString('zh-CN')} ·{' '}
                    {r.createdBy || '-'}
                  </p>
                  {r.notes && <p className='mt-1 text-xs text-muted-foreground'>{r.notes}</p>}
                </div>
                {canEdit && (
                  <div className='flex gap-2'>
                    {!r.isActive && (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setActive(r.id)}
                      >
                        设为当前
                      </Button>
                    )}
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => remove(r.id)}
                      className='border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive'
                    >
                      删除
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
