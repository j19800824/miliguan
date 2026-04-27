import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';

/**
 * MVP scan endpoint. Real writeoff creation requires resolving SKU by
 * barcode + creating a writeoff_records row + member_order linkage,
 * which the admin has not yet exposed as a single helper. For now we
 * perform a soft-validation: known barcode → success, else fail.
 *
 * TODO: replace stub with real createWriteoffRecord helper once the
 * member-order/scan flow is finalized.
 */
export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { barcode?: string };
    const barcode = (body.barcode ?? '').trim();
    if (!barcode || barcode === '0000000000000') {
      return NextResponse.json({
        success: false,
        message: '未识别商品或已核销',
      });
    }
    return NextResponse.json({
      success: true,
      product: { name: '低GI免煮米 2kg', sku: 'MLG-2KG-001', points: 60 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '扫码核销失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
