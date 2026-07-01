import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getPurchaseOrderDetail, handlePurchaseOrderReceive } from '@/lib/database.js';
import { notifyPurchaseReceived } from '@/lib/events';

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.companyId) {
    return NextResponse.json({ message: '当前账号未绑定分公司' }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const detail = await getPurchaseOrderDetail(
      id,
      { itemsPage: 1, approvalsPage: 1, pageSize: 1 },
      user,
    );
    if (!detail) {
      return NextResponse.json({ message: '进货单不存在' }, { status: 404 });
    }

    if (user.storeId && String(detail.store_id ?? '') !== String(user.storeId)) {
      return NextResponse.json({ message: '只能确认本门店的进货单入库' }, { status: 403 });
    }
    if (user.storeId && !detail.store_id) {
      return NextResponse.json({ message: '门店账号不能确认分公司向总部进货单' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { note?: string };
    await handlePurchaseOrderReceive(
      id,
      { note: body.note ?? 'App 确认收货，库存正式入库' },
      user.fullName ?? user.account ?? '移动端用户',
      user,
    );

    void notifyPurchaseReceived({
      orderNo: detail.order_no,
      companyId: user.companyId,
      actor: user.fullName ?? user.account,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '确认入库失败' },
      { status: 400 },
    );
  }
}
