import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { reconcilePayments } from '@/lib/payment/reconciliation';
import { getLatestReconciliationRun, listReconciliationDriftsByRun } from '@/lib/database.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * GET — quick status: latest run + its drifts. Useful for a dashboard widget.
 *   ?runId=...  → specific run
 */
export async function GET(req: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'payments:reconcile') && !hasPermission(user, 'overview:view')) {
    return NextResponse.json({ message: '无权限' }, { status: 403 });
  }
  const url = new URL(req.url);
  const runIdParam = url.searchParams.get('runId');
  try {
    if (runIdParam) {
      const drifts = await listReconciliationDriftsByRun(runIdParam);
      return NextResponse.json({ runId: runIdParam, drifts });
    }
    const latest = await getLatestReconciliationRun();
    return NextResponse.json({ latest });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}

/**
 * POST — trigger reconciliation for a given date.
 *   body: { date?: 'YYYY-MM-DD' }   (defaults to yesterday)
 *
 * For automation: hit this endpoint via system cron at 00:10 daily.
 *   curl -X POST -H "Cookie: $ADMIN_SESSION" \\
 *     "$ADMIN_BASE/api/admin/payments/reconcile" -d '{"date":"2026-05-17"}'
 */
export async function POST(req: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'payments:reconcile') && !hasPermission(user, 'overview:view')) {
    return NextResponse.json({ message: '无权限' }, { status: 403 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string };
    let date = body.date;
    if (!date) {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      date = yesterday.toISOString().slice(0, 10);
    }
    if (!isValidDate(date)) {
      return NextResponse.json(
        { message: 'date 格式必须为 YYYY-MM-DD' },
        { status: 400 },
      );
    }
    const summary = await reconcilePayments(date);
    return NextResponse.json({
      ok: true,
      ...summary,
      generatedAt: new Date().toISOString(),
      requestedDate: date,
      today: today(),
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '对账失败' },
      { status: 500 },
    );
  }
}
