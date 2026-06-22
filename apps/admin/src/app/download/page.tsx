import { getLatestAppRelease } from '@/lib/database.js';
import { isOssEnabled } from '@/lib/oss';

export const metadata = {
  title: '米粒冠 App 下载'
};
export const dynamic = 'force-dynamic';

function formatSize(bytes: number) {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default async function DownloadPage() {
  const release = await getLatestAppRelease('android');
  // 经应用域名代理下载（绕开 OSS 默认域名的 APK 分发限制）
  const downloadUrl = release && isOssEnabled() ? '/api/public/app-release/download?platform=android' : '';

  return (
    <div className='flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 py-12'>
      <div className='w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm'>
        <div className='mb-6 text-center'>
          <h1 className='text-2xl font-bold text-slate-900'>米粒冠 App</h1>
          <p className='mt-1 text-sm text-slate-500'>安卓版安装包下载</p>
        </div>

        {!release ? (
          <p className='py-8 text-center text-slate-400'>暂无可下载的版本</p>
        ) : (
          <div className='space-y-5'>
            <div className='flex items-center justify-between'>
              <span className='text-sm text-slate-500'>当前版本</span>
              <span className='font-semibold text-slate-900'>v{release.version}</span>
            </div>
            {release.fileSize ? (
              <div className='flex items-center justify-between'>
                <span className='text-sm text-slate-500'>安装包大小</span>
                <span className='text-slate-700'>{formatSize(release.fileSize)}</span>
              </div>
            ) : null}
            {release.notes ? (
              <div>
                <span className='text-sm text-slate-500'>更新说明</span>
                <p className='mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700'>
                  {release.notes}
                </p>
              </div>
            ) : null}

            {downloadUrl ? (
              <a
                href={downloadUrl}
                className='block w-full rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white transition hover:bg-emerald-700'
              >
                下载安装包（.apk）
              </a>
            ) : (
              <p className='rounded-lg bg-amber-50 p-3 text-center text-sm text-amber-700'>
                下载暂不可用（存储未配置）
              </p>
            )}

            <p className='text-center text-xs text-slate-400'>
              下载后在手机上打开安装；如提示「未知来源」，请在系统设置中允许安装。
            </p>
          </div>
        )}
      </div>
      <p className='text-xs text-slate-400'>仅支持安卓设备 · iOS 请通过 App Store / TestFlight 获取</p>
    </div>
  );
}
