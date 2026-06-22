import { NextResponse } from 'next/server';
import { getLatestAppRelease } from '@/lib/database.js';
import { isOssEnabled } from '@/lib/oss';

// 公开接口：无需登录，返回最新可用版本 + 签名下载链接。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'android';

  const release = await getLatestAppRelease(platform);
  if (!release) {
    return NextResponse.json({ release: null });
  }

  // 经应用域名代理下载（绕开 OSS 默认域名的 APK 分发限制）
  const downloadUrl = isOssEnabled()
    ? `/api/public/app-release/download?platform=${platform}`
    : '';

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
