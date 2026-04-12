import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: '商品图片已迁移到 SKU 层，请在 SKU 行内上传图片。' },
    { status: 410 }
  );
}
