import { NextResponse } from 'next/server';
import { auditRoute } from '@/lib/audit';

export async function POST(request: Request) {
  return auditRoute(request, {
    module: 'products',
    action: '上传商品图片',
    handler: async () =>
      NextResponse.json(
        { message: '商品图片已迁移到 SKU 层，请在 SKU 行内上传图片。' },
        { status: 410 }
      )
  });
}
