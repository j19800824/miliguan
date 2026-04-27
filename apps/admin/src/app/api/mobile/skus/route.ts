import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getProductSkuOptions } from '@/lib/database.js';

interface DbSkuOption {
  value: string;
  label: string;
  meta?: { price?: number | string; spec?: string; product_name?: string };
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const options = (await getProductSkuOptions()) as DbSkuOption[];
    return NextResponse.json(
      options.map((opt) => ({
        id: opt.value,
        label: opt.label,
        price: Number(opt.meta?.price ?? 0),
      })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询 SKU 失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
