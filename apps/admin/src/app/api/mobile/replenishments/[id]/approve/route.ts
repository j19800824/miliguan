import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { approveReplenishment } from '@/lib/database.js';
import { notifyReplenishmentApproved } from '@/lib/events';

interface ApproveBody {
  decision?: '通过' | '驳回';
  remark?: string;
}

interface ApproveResult {
  id: string;
  orderNo: string;
  status: string;
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.companyId) {
    return NextResponse.json(
      { message: '当前账号未绑定分公司，无法审核' },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as ApproveBody;
    const decision: '通过' | '驳回' = body.decision === '驳回' ? '驳回' : '通过';
    const result = (await approveReplenishment(
      id,
      decision,
      user.fullName ?? user.account ?? '审核人',
    )) as ApproveResult;
    void notifyReplenishmentApproved({
      orderNo: result.orderNo,
      companyId: user.companyId,
      decision,
      reviewer: user.fullName ?? user.account,
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '审核失败' },
      { status: 400 },
    );
  }
}
