import { NextResponse } from 'next/server';
import { getLatestAppRelease } from '@/lib/database.js';
import { buildPublicOssUrl, isOssEnabled } from '@/lib/oss';

// 公开接口：无需登录，返回最新可用版本 + 签名下载链接。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'android';

  const release = await getLatestAppRelease(platform);
  if (!release) {
    return NextResponse.json({ release: null });
  }

  // CDN/OSS 直链优先；未配置公开加速域名时退回应用域名代理。
  const publicUrl = buildPublicOssUrl(release.fileKey);
  const downloadUrl = publicUrl || (isOssEnabled()
    ? `/api/public/app-release/download?platform=${platform}`
    : '');

  return NextResponse.json({
    release: {
      platform: release.platform,
      version: release.version,
      versionCode: release.versionCode,
      notes: release.notes,
      fileName: release.fileName,
      fileSize: release.fileSize,
      createdAt: release.createdAt,
      downloadUrl
    }
  });
}
