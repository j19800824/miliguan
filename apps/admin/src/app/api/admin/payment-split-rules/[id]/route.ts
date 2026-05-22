import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import {
  getSplitRuleById,
  updateSplitRule,
  deleteSplitRule,
} from '@/lib/database.js';

interface UpdateBody {
  scope?: 'global' | 'company' | 'store' | 'sku';
  scopeId?: string;
  recipientType?: 'hq' | 'company' | 'store' | 'sales_staff';
  recipientAccountId?: string;
  rateType?: 'percent' | 'fixed' | 'percent_of_store' | 'residual';
  rateValue?: number;
  priority?: number;
  status?: '启用' | '停用';
  remark?: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  if (!hasPermission(user, 'overview:view')) {
    return NextResponse.json({ message: '无权限' }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const rule = await getSplitRuleById(id);
    if (!rule) {
      return NextResponse.json({ message: '规则不存在' }, { status: 404 });
    }
    return NextResponse.json(rule);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'payment-split-rules',
    action: '更新分账规则',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'stores:edit')) {
        return NextResponse.json({ message: '无权限' }, { status: 403 });
      }
      const { id } = await context.params;
      try {
        const body = (await request.json()) as UpdateBody;
        await updateSplitRule(id, body);
        return NextResponse.json({ ok: true });
      } catch (e) {
        return NextResponse.json(
          { message: e instanceof Error ? e.message : '更新失败' },
          { status: 400 },
        );
      }
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'payment-split-rules',
    action: '停用分账规则',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'stores:edit')) {
        return NextResponse.json({ message: '无权限' }, { status: 403 });
      }
      const { id } = await context.params;
      try {
        await deleteSplitRule(id);
        return NextResponse.json({ ok: true });
      } catch (e) {
        return NextResponse.json(
          { message: e instanceof Error ? e.message : '停用失败' },
          { status: 400 },
        );
      }
    },
  });
}
