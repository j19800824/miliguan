import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listInventoryForCompany, listInventory } from '@/lib/database.js';

interface DbInventoryRow {
  product_name?: string;
  sku_code?: string;
  spec?: string;
  quantity?: number | string;
  safety_stock?: number | string;
  status?: string;
}

function shape(row: DbInventoryRow) {
  const stock = Number(row.quantity ?? 0);
  const warn = Number(row.safety_stock ?? 0) > 0 && stock <= Number(row.safety_stock ?? 0);
  return {
    sku: `${row.product_name ?? '商品'} ${row.spec ?? ''}`.trim(),
    stock,
    warn,
  };
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    if (user.companyId) {
      const result = await listInventoryForCompany(user.companyId, {
        page: 1,
        pageSize: 50,
      });
      return NextResponse.json((result.rows ?? []).map(shape));
    }
    const result = await listInventory({ page: 1, pageSize: 50, user });
    return NextResponse.json((result.rows ?? []).map(shape));
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询库存失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
