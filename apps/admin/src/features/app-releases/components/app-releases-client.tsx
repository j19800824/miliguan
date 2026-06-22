'use client';

import { useState } from 'react';

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
  const [version, setVersion] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [notes, setNotes] = useState('');
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

  async function handleUpload() {
    if (!file) return setMsg({ type: 'err', text: '请选择 APK 文件' });
    if (!version.trim()) return setMsg({ type: 'err', text: '请填写版本号' });
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
          version: version.trim(),
          versionCode: Number(versionCode) || 0,
          fileKey: sign.key,
          fileName: file.name,
          fileSize: file.size,
          notes: notes.trim()
        })
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.message || '保存版本失败');
      setMsg({ type: 'ok', text: `已发布 v${version.trim()}` });
      setVersion('');
      setVersionCode('');
      setNotes('');
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

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none';

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-bold'>应用发布</h1>
        <p className='text-sm text-slate-500'>
          上传安卓 APK 并发布新版本。公开下载页：
          <a href='/download' target='_blank' className='text-emerald-600 underline'>
            /download
          </a>
        </p>
      </div>

      {canEdit && (
        <div className='rounded-xl border bg-white p-5'>
          <h2 className='mb-4 font-semibold'>上传新版本</h2>
          <div className='grid gap-4 sm:grid-cols-2'>
            <label className='block'>
              <span className='mb-1 block text-sm text-slate-600'>版本号（如 1.2.0）</span>
              <input
                className={inputCls}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className='block'>
              <span className='mb-1 block text-sm text-slate-600'>versionCode（整数，可选）</span>
              <input
                className={inputCls}
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value)}
                disabled={busy}
                inputMode='numeric'
              />
            </label>
          </div>
          <label className='mt-4 block'>
            <span className='mb-1 block text-sm text-slate-600'>更新说明（可选）</span>
            <textarea
              className={inputCls}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className='mt-4 block'>
            <span className='mb-1 block text-sm text-slate-600'>APK 文件</span>
            <input
              type='file'
              accept='.apk,application/vnd.android.package-archive'
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className='text-sm'
            />
          </label>

          {busy && (
            <div className='mt-4'>
              <div className='h-2 w-full overflow-hidden rounded bg-slate-100'>
                <div className='h-full bg-emerald-500 transition-all' style={{ width: `${progress}%` }} />
              </div>
              <p className='mt-1 text-xs text-slate-500'>上传中 {progress}%</p>
            </div>
          )}

          {msg && (
            <p className={`mt-3 text-sm ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
              {msg.text}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={busy}
            className='mt-4 rounded-lg bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50'
          >
            {busy ? '上传中…' : '上传并发布'}
          </button>
        </div>
      )}

      <div className='rounded-xl border bg-white p-5'>
        <h2 className='mb-4 font-semibold'>版本列表</h2>
        {releases.length === 0 ? (
          <p className='py-6 text-center text-slate-400'>暂无版本</p>
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
                      <span className='rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700'>
                        当前版本
                      </span>
                    )}
                  </div>
                  <p className='truncate text-xs text-slate-400'>
                    {formatSize(r.fileSize)} · {new Date(r.createdAt).toLocaleString('zh-CN')} ·{' '}
                    {r.createdBy || '-'}
                  </p>
                  {r.notes && <p className='mt-1 text-xs text-slate-500'>{r.notes}</p>}
                </div>
                {canEdit && (
                  <div className='flex gap-2'>
                    {!r.isActive && (
                      <button
                        onClick={() => setActive(r.id)}
                        className='rounded border px-3 py-1 text-xs hover:bg-slate-50'
                      >
                        设为当前
                      </button>
                    )}
                    <button
                      onClick={() => remove(r.id)}
                      className='rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50'
                    >
                      删除
                    </button>
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
