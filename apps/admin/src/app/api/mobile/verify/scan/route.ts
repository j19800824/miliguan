import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import {
  createMobileWriteoff,
  getCompanyInventoryForSku,
} from '@/lib/database.js';
import { notifyWriteoffCreated, notifyInventoryWarning } from '@/lib/events';

interface ScanBody {
  barcode?: string;
}

interface WriteoffResult {
  ok: boolean;
  id?: string;
  skuId?: string;
  message?: string;
  product?: { name: string; sku: string; points: number };
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as ScanBody;
    const result = (await createMobileWriteoff(body.barcode ?? '', user)) as WriteoffResult;
    if (!result.ok) {
      return NextResponse.json({
        success: false,
        message: result.message ?? '核销失败',
      });
    }

    // Fan out: writeoff event + push to staff in this store.
    if (result.product) {
      void notifyWriteoffCreated({
        companyId: user.companyId,
        storeId: user.storeId,
        productName: result.product.name,
        skuCode: result.product.sku,
        points: result.product.points,
        staffName: user.fullName ?? user.name ?? user.account,
      });
    }

    // Inventory threshold: if the company's stock for this SKU is at or
    // below safety_stock after the writeoff, raise an inventory warning.
    if (result.skuId && user.companyId) {
      try {
        const inv = await getCompanyInventoryForSku(user.companyId, result.skuId);
        if (
          inv &&
          inv.safety_stock > 0 &&
          inv.quantity <= inv.safety_stock
        ) {
          void notifyInventoryWarning({
            companyId: user.companyId,
            storeId: user.storeId,
            productName: inv.product_name,
            skuCode: inv.sku_code,
            remaining: inv.quantity,
            threshold: inv.safety_stock,
          });
        }
      } catch {
        /* don't block scan on inventory warning failure */
      }
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
