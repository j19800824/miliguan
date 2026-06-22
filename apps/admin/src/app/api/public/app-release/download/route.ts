import { NextResponse } from 'next/server';
import { getLatestAppRelease } from '@/lib/database.js';
import { isOssEnabled, signGetUrl } from '@/lib/oss';

// 公开下载（免登录）：服务端从 OSS 拉取 .bin 对象并以 .apk 文件名流式下发。
// 走应用自有域名，不经 OSS 公网端点，绕开阿里云 ApkDownloadForbidden 限制。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'android';

  const release = await getLatestAppRelease(platform);
  if (!release) {
    return new NextResponse('暂无可下载的版本', { status: 404 });
  }
  if (!isOssEnabled()) {
    return new NextResponse('存储未配置', { status: 503 });
  }

  let ossRes: Response;
  try {
    ossRes = await fetch(signGetUrl(release.fileKey, 600));
  } catch {
    return new NextResponse('下载源不可用', { status: 502 });
  }
  if (!ossRes.ok || !ossRes.body) {
    return new NextResponse('下载源返回异常', { status: 502 });
  }

  // 下发文件名固定 ascii，避免响应头编码问题
  const filename = `miliguan-${(release.version || 'app').replace(/[^a-zA-Z0-9._-]/g, '')}.apk`;
  const headers = new Headers({
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store'
  });
  const len = ossRes.headers.get('content-length');
  if (len) headers.set('Content-Length', len);

  return new Response(ossRes.body, { status: 200, headers });
}
