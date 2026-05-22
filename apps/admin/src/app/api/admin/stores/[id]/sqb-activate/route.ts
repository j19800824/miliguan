import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { saveStoreTerminal } from '@/lib/database.js';
import { activateTerminal, isSqbConfigured } from '@/lib/shouqianba';

interface ActivateBody {
  code?: string;
  name?: string;
}

interface ActivateBizResponse {
  terminal_sn?: string;
  terminal_key?: string;
}

/**
 * Activate a store's 收钱吧 terminal.
 *
 * Body:  { code: string, name?: string }
 *        — `code` is the activation code printed in the SQB merchant
 *          portal for this terminal/device.
 *
 * On success the terminal_sn + terminal_key are persisted to
 * company_stores.sqb_terminal_*. After this, the store can accept
 * payments via /api/mobile/payments + receive SQB webhooks.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'payment-terminals',
    action: '激活收钱吧终端',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'stores:edit')) {
        return NextResponse.json({ message: '无权限激活终端' }, { status: 403 });
      }
      if (!isSqbConfigured()) {
        return NextResponse.json(
          { message: '收钱吧未配置: SQB_VENDOR_SN / SQB_VENDOR_KEY 缺失' },
          { status: 503 },
        );
      }

      const { id } = await context.params;
      const body = (await request.json().catch(() => ({}))) as ActivateBody;
      const code = (body.code ?? '').trim();
      if (!code) {
        return NextResponse.json(
          { message: '请输入激活码' },
          { status: 400 },
        );
      }

      const deviceId = `MILIGUAN-STORE-${id}`;
      try {
        const res = await activateTerminal({
          code,
          deviceId,
          name: body.name ?? `米粒冠门店 #${id}`,
        });
        if (res.result_code !== '200' || !res.biz_response) {
          return NextResponse.json(
            {
              message: `收钱吧激活失败: ${res.error_message ?? res.error_code ?? 'unknown'}`,
            },
            { status: 400 },
          );
        }
        const biz = res.biz_response as ActivateBizResponse;
        if (!biz.terminal_sn || !biz.terminal_key) {
          return NextResponse.json(
            { message: '收钱吧未返回 terminal_sn / terminal_key' },
            { status: 502 },
          );
        }
        await saveStoreTerminal(id, biz.terminal_sn, biz.terminal_key, deviceId);
        return NextResponse.json({
          ok: true,
          terminalSn: biz.terminal_sn,
          deviceId,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : '激活失败';
        return NextResponse.json({ message }, { status: 500 });
      }
    },
  });
}
