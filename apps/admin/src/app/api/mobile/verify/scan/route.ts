import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { createMobileWriteoff } from '@/lib/database.js';

interface ScanBody {
  barcode?: string;
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ScanBody;
    const result = await createMobileWriteoff(body.barcode ?? '', user);
    if (!result.ok) {
      return NextResponse.json({
        success: false,
        message: result.message ?? '核销失败',
      });
    }
    return NextResponse.json({
      success: true,
      product: result.product,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '扫码核销失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
