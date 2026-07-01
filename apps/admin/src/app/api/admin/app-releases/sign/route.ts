import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { isOssEnabled, signPutUrl } from '@/lib/oss';

// 注意：阿里云禁止用默认 OSS 域名分发 .apk（ApkDownloadForbidden）。
// 因此对象以 .bin 后缀存储，下载时由应用服务端代理并以 .apk 文件名下发。
const STORAGE_CONTENT_TYPE = 'application/octet-stream';

function safeBase(name: string) {
  return (name || 'app')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 40);
}

export async function POST(req: Request) {
  const user = await getAdminSession();
  return auditRoute(req, {
    module: 'app-releases',
    action: '生成应用安装包上传签名',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'app-releases:edit')) {
        return NextResponse.json({ message: '当前账号无权限上传应用安装包' }, { status: 403 });
      }
      if (!isOssEnabled()) {
        return NextResponse.json({ message: 'OSS 未配置，无法上传安装包' }, { status: 503 });
      }

      try {
        const body = (await req.json()) as { filename?: string };
        const ts = Date.now();
        // 关键：存储 key 不含 .apk，避免触发阿里云 APK 分发限制。
        const key = `apps/android/${ts}-${safeBase(body.filename ?? 'app')}.bin`;
        const uploadUrl = signPutUrl(key, STORAGE_CONTENT_TYPE);
        return NextResponse.json({ ok: true, uploadUrl, key, contentType: STORAGE_CONTENT_TYPE });
      } catch (error) {
        const message = error instanceof Error ? error.message : '签名失败';
        return NextResponse.json({ message }, { status: 500 });
      }
    }
  });
}
