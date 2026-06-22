import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { listAppReleases, createAppRelease } from '@/lib/database.js';
import { auditRoute } from '@/lib/audit';

export async function GET(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'app-releases',
    action: '查看应用版本列表',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'app-releases:view')) {
        return NextResponse.json({ message: '当前账号无权限查看应用版本' }, { status: 403 });
      }
      return NextResponse.json({ rows: await listAppReleases('android') });
    }
  });
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'app-releases',
    action: '发布应用新版本',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'app-releases:edit')) {
        return NextResponse.json({ message: '当前账号无权限发布应用版本' }, { status: 403 });
      }
      const body = (await request.json()) as {
        version?: string;
        versionCode?: number;
        fileKey?: string;
        fileName?: string;
        fileSize?: number;
        notes?: string;
      };
      if (!body.version || !body.fileKey) {
        return NextResponse.json({ message: '缺少版本号或安装包文件' }, { status: 400 });
      }
      const release = await createAppRelease({
        platform: 'android',
        version: body.version,
        versionCode: body.versionCode ?? 0,
        fileKey: body.fileKey,
        fileName: body.fileName ?? '',
        fileSize: body.fileSize ?? 0,
        notes: body.notes ?? '',
        createdBy: user.name || user.account || ''
      });
      return NextResponse.json({ release });
    }
  });
}
