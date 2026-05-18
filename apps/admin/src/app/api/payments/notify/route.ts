import { NextResponse } from 'next/server';
import {
  getStoreTerminal,
  getPaymentOrderBySqbSn,
  getPaymentOrderByClientSn,
  recordPaymentWebhook,
  markWebhookProcessed,
} from '@/lib/database.js';
import { verifyWebhookSignature } from '@/lib/shouqianba';
import { settlePayment } from '@/lib/payment/orchestrator';

interface SqbNotifyBody {
  sn?: string;
  client_sn?: string;
  status?: string;
  order_status?: string;
  total_amount?: string;
  net_amount?: string;
  payway?: string;
  payer_uid?: string;
  trade_no?: string;
  finish_time?: string;
}

interface PaymentRow {
  id: number;
  store_id?: number;
  amount: number | string;
}

/**
 * 收钱吧 异步回调入口（公网可达，无 JWT，靠 Authorization 头里的签名验证身份）。
 * 收钱吧 retries up to ~5 times with backoff if we don't return 200 — so
 * idempotency is critical (key: sqb sn / client_sn dedupe).
 *
 * Response body must contain `"result_code": "200"` to acknowledge.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const authHeader = req.headers.get('authorization');

  // We don't yet know which store sent this. SQB's webhook auth header
  // is `<terminal_sn> <md5(body+terminal_key)>` — extract terminal_sn,
  // look up the terminal_key from company_stores, then verify.
  let body: SqbNotifyBody = {};
  try {
    body = JSON.parse(rawBody) as SqbNotifyBody;
  } catch {
    return NextResponse.json(
      { result_code: 'SIGN_ERROR', message: 'body not json' },
      { status: 400 },
    );
  }

  const verification = await verifyWebhookSignature(
    authHeader,
    rawBody,
    async (terminalSn: string) => {
      // Look up by terminal_sn — scan stores.
      const { query } = await import('@/lib/database.js') as unknown as {
        query: (sql: string, params: unknown[]) => Promise<{ rows: Array<{ sqb_terminal_key: string }> }>;
      };
      const row = (
        await query(
          `SELECT sqb_terminal_key FROM company_stores WHERE sqb_terminal_sn = $1 LIMIT 1`,
          [terminalSn],
        )
      ).rows[0];
      return row?.sqb_terminal_key ?? null;
    },
  );

  // Log the raw webhook first (audit + replay safety).
  const webhookId = await recordPaymentWebhook({
    eventType: body.order_status ?? 'payment.notify',
    sqbSn: body.sn ?? '',
    rawBody: body,
    signature: verification.signature ?? '',
    signatureValid: verification.ok,
  });

  if (!verification.ok) {
    await markWebhookProcessed(webhookId, '签名验证失败');
    return NextResponse.json(
      { result_code: 'SIGN_ERROR' },
      { status: 401 },
    );
  }

  if (body.order_status !== 'PAID') {
    // We only act on PAID. Other states (CANCELED/REFUNDED) ride their own paths.
    await markWebhookProcessed(webhookId, `未处理状态 ${body.order_status}`);
    return NextResponse.json({ result_code: '200' });
  }

  let order: PaymentRow | null = null;
  if (body.sn) {
    order = (await getPaymentOrderBySqbSn(body.sn)) as PaymentRow | null;
  }
  if (!order && body.client_sn) {
    order = (await getPaymentOrderByClientSn(body.client_sn)) as PaymentRow | null;
  }
  if (!order) {
    await markWebhookProcessed(webhookId, '未找到对应订单');
    // Still return 200 — we'll fix up via reconciliation. Don't make SQB retry forever.
    return NextResponse.json({ result_code: '200' });
  }

  try {
    const paidYuan = body.total_amount
      ? Number(body.total_amount) / 100
      : Number(order.amount);
    await settlePayment({
      paymentOrderId: String(order.id),
      paidAmount: paidYuan,
      payWay: body.payway ?? '',
      payerUid: body.payer_uid ?? '',
      sqbSn: body.sn ?? '',
    });
    await markWebhookProcessed(webhookId, '');
    return NextResponse.json({ result_code: '200' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'settle failed';
    await markWebhookProcessed(webhookId, msg);
    // Still return 200 — already logged. SQB retry won't fix it.
    return NextResponse.json({ result_code: '200' });
  }
}
