import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { initializeDatabase, submitProductSkuImageUpdateRequest } from '@/lib/database.js';
import { createOssClient, getOssConfig, isOssEnabled } from '@/lib/oss';
import { auditRoute } from '@/lib/audit';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MIME_TO_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
} as const;

async function uploadToOss(skuId: string, file: File, extension: string) {
  if (!isOssEnabled()) {
    throw new Error('阿里云 OSS 未配置，请先在 .env.local 中填写 OSS 参数');
  }

  const config = getOssConfig();
  const client = createOssClient();
  const objectKey = `${config.uploadPrefix}/sku-${skuId}-${Date.now()}-${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await client.put(objectKey, buffer, {
    headers: { 'Content-Type': file.type }
  });

  return config.baseUrl
    ? `${config.baseUrl.replace(/\/$/, '')}/${objectKey}`
    : result.url;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; skuId: string }> }
) {
  initializeDatabase();
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'products',
    action: '上传SKU图片',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'products:edit')) {
        return NextResponse.json({ message: '当前账号无权限上传 SKU 图片' }, { status: 403 });
      }

      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
          return NextResponse.json({ message: '请先选择图片文件' }, { status: 400 });
        }
        if (!(file.type in MIME_TO_EXTENSION)) {
          return NextResponse.json({ message: '仅支持 JPG、PNG、WEBP 图片' }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json({ message: '图片大小不能超过 5MB' }, { status: 400 });
        }

        const { id, skuId } = await context.params;
        const extension = MIME_TO_EXTENSION[file.type as keyof typeof MIME_TO_EXTENSION];
        const imageUrl = await uploadToOss(skuId, file, extension);
        const requestId = await submitProductSkuImageUpdateRequest(
          id,
          skuId,
          imageUrl,
          user.name ?? user.account ?? '后台用户'
        );
        return NextResponse.json({
          id: String(requestId),
          url: imageUrl,
          message: 'SKU 图片变更申请已提交，待审核通过后生效'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '上传 SKU 图片失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
