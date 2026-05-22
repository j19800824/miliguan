import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import {
  listAllSplitRules,
  createSplitRule,
  seedDefaultSplitRules,
} from '@/lib/database.js';

interface CreateBody {
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

export async function GET(request: Request) {
  const user = await getAdminSession();
  if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  if (!hasPermission(user, 'overview:view')) {
    return NextResponse.json({ message: '无权限' }, { status: 403 });
  }
  try {
    // Lazy-seed the 4 default rules on first read so the page is never empty.
    await seedDefaultSplitRules();
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? undefined;
    const rows = await listAllSplitRules({ scope });
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'payment-split-rules',
    action: '创建分账规则',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'stores:edit')) {
        return NextResponse.json({ message: '无权限' }, { status: 403 });
      }
      try {
        const body = (await request.json()) as CreateBody;
        if (!body.recipientType) {
          return NextResponse.json(
            { message: 'recipientType 不能为空' },
            { status: 400 },
          );
        }
        if (!body.rateType) {
          return NextResponse.json(
            { message: 'rateType 不能为空' },
            { status: 400 },
          );
        }
        const id = await createSplitRule({
          scope: body.scope ?? 'global',
          scopeId: body.scopeId ?? '',
          recipientType: body.recipientType,
          recipientAccountId: body.recipientAccountId,
          rateType: body.rateType,
          rateValue: body.rateValue ?? 0,
          priority: body.priority ?? 100,
          status: body.status ?? '启用',
          remark: body.remark ?? '',
        });
        return NextResponse.json({ ok: true, id });
      } catch (e) {
        return NextResponse.json(
          { message: e instanceof Error ? e.message : '创建失败' },
          { status: 400 },
        );
      }
    },
  });
}
