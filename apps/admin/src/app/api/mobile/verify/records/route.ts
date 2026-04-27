import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listWriteoffRecords } from '@/lib/database.js';

interface DbWriteoffRow {
  id: string | number;
  product_name?: string;
  product_code?: string;
  sales_staff_name?: string;
  status?: string;
  writeoff_time?: string | Date;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const rows = (await listWriteoffRecords({})) as DbWriteoffRow[];
    const records = rows.slice(0, 30).map((row) => {
      const time = row.writeoff_time
        ? new Date(row.writeoff_time).toTimeString().slice(0, 5)
        : '';
      return {
        id: String(row.id),
        product: row.product_name ?? '商品',
        barcode: row.product_code ?? '',
        time,
        staff: row.sales_staff_name ?? '-',
        status: row.status === '失败' ? 'fail' : 'success',
        pts: row.status === '失败' ? 0 : 20,
      };
    });
    return NextResponse.json(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询核销记录失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
