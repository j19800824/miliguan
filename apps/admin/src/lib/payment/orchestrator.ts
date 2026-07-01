/**
 * Orchestrates the payment lifecycle:
 *   createPayment   : precreate via SQB (or mock) + record payment_order + qr
 *   settlePayment   : mark paid + compute splits + record payment_splits +
 *                     fire push/SSE notifications
 *   refundPayment   : reverse SQB charge + reverse writeoff + restore inventory
 *
 * Public-facing API routes import only from here, never from
 * lib/shouqianba/* directly. This way mock-mode behavior + retry logic
 * stays in one place.
 */

import {
  // payment_orders
  createPaymentOrder,
  getPaymentOrderById,
  updatePaymentOrderAfterPrecreate,
  markPaymentOrderPaid,
  markPaymentOrderRefunded,
  // splits + rules
  computeSplitsForPayment,
  recordPaymentSplit,
  markPaymentSplitDone,
  // writeoff
  getWriteoffPayableAmount,
  revertWriteoff,
  resolveMobileCartPayment,
  completeCartPaymentWriteoff,
  // SQB credentials per store
  getStoreTerminal,
} from '@/lib/database.js';
import {
  precreate,
  refundOrder,
  isSqbConfigured,
} from '@/lib/shouqianba';
import { publishEvent } from '@/lib/event-bus';
import { sendPushToUser } from '@/lib/push';

interface Context {
  companyId?: string;
  storeId?: string;
  salesStaffName?: string;
  fullName?: string;
  account?: string;
  id?: string;
}

interface CreatePaymentInput {
  sourceType?: 'writeoff' | 'topup' | 'standalone' | 'cart';
  sourceId?: string | number;
  amount?: number;  // yuan; resolved from sourceId when omitted (writeoff)
  subject?: string;
  items?: Array<{ skuId?: string | number; sku_id?: string | number; quantity?: number }>;
  user: Context;
}

export interface CreatePaymentResult {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  qrCode: string;
  sqbSn: string;
  mockMode: boolean;
}

/**
 * Create a payment order:
 * 1. resolve amount from writeoff (or use input.amount)
 * 2. INSERT payment_orders
 * 3. call SQB precreate (or generate a mock QR when not configured)
 * 4. update payment_order with sqb_sn + qr_code
 */
export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  if (!input.user?.companyId) {
    throw new Error('当前账号未绑定分公司，无法发起支付');
  }

  let amount = input.amount;
  let cartItems: unknown[] = [];
  if (input.sourceType === 'cart') {
    const cart = await resolveMobileCartPayment(input.user, input.items ?? []);
    amount = cart.amount;
    cartItems = cart.items;
  }
  if (amount == null && input.sourceType === 'writeoff' && input.sourceId) {
    amount = (await getWriteoffPayableAmount(input.sourceId)) ?? 0;
  }
  if (!amount || amount <= 0) {
    throw new Error('支付金额无效');
  }

  const created = await createPaymentOrder({
    sourceType: input.sourceType ?? 'writeoff',
    sourceId: input.sourceId ?? null,
    companyId: input.user.companyId,
    storeId: input.user.storeId,
    salesStaffName: input.user.fullName ?? input.user.account ?? '',
    amount,
    sqbTerminalSn: '',
    remark: input.subject ?? '',
    cartItems,
  });

  // Try SQB precreate. Fall through to mock when not configured.
  const terminal = input.user.storeId
    ? await getStoreTerminal(input.user.storeId)
    : null;
  if (isSqbConfigured() && terminal) {
    try {
      const res = await precreate({
        terminal,
        clientSn: created.clientSn,
        amountYuan: amount,
        subject: input.subject ?? '米粒冠门店核销',
        operator: input.user.fullName ?? input.user.account ?? 'mobile',
        notifyUrl: process.env.SQB_NOTIFY_URL,
      });
      if (res.result_code !== '200' || !res.biz_response) {
        throw new Error(
          `SQB precreate 失败: ${res.error_message ?? res.error_code ?? 'unknown'}`,
        );
      }
      const biz = res.biz_response;
      await updatePaymentOrderAfterPrecreate(
        created.id,
        biz.sn,
        biz.qr_code,
      );
      return {
        id: created.id,
        orderNo: created.orderNo,
        amount,
        status: '待支付',
        qrCode: biz.qr_code,
        sqbSn: biz.sn,
        mockMode: false,
      };
    } catch (err) {
      // Real SQB failed — surface to caller (don't silently fall back to mock).
      throw err;
    }
  }

  // Mock mode: synthesize a placeholder QR + sn so the UI can still flow.
  const mockSn = `MOCK-${created.orderNo}`;
  const mockQr = `miliguan://mock-pay?order=${created.orderNo}&amount=${amount}`;
  await updatePaymentOrderAfterPrecreate(created.id, mockSn, mockQr);
  return {
    id: created.id,
    orderNo: created.orderNo,
    amount,
    status: '待支付',
    qrCode: mockQr,
    sqbSn: mockSn,
    mockMode: true,
  };
}

/**
 * Mark a payment as successfully paid + execute its splits + notify.
 * Called from:
 *   - webhook handler when SQB notifies payment.success
 *   - dev-only mock-pay endpoint
 */
export async function settlePayment(input: {
  paymentOrderId: string;
  paidAmount: number;
  payWay?: string;
  payerUid?: string;
  sqbSn?: string;
}): Promise<{ paymentOrderId: string; splits: Array<{ recipientType: string; amount: number }> }> {
  await markPaymentOrderPaid(
    input.paymentOrderId,
    input.paidAmount,
    input.payerUid ?? '',
    input.payWay ?? '',
    input.sqbSn ?? '',
  );
  await completeCartPaymentWriteoff(
    input.paymentOrderId,
    input.payerUid || input.payWay || '系统',
  );

  const splits = await computeSplitsForPayment(input.paymentOrderId);
  for (const s of splits) {
    const splitId = await recordPaymentSplit({
      paymentOrderId: input.paymentOrderId,
      ruleId: s.ruleId,
      recipientType: s.recipientType,
      recipientAccountId: s.recipientAccountId,
      amount: s.amount,
    });
    // For pre-payment splits (when SQB did the work) we just mark each as done.
    // For mock mode + post-payment splits, this is also where we'd call splitOrder().
    // For now we always mark done — TODO once real SQB sub-merchants are wired,
    // either pass split_info at precreate-time (preferred) or call /upay/v2/split here.
    await markPaymentSplitDone(splitId, '');
  }

  const order = await getPaymentOrderById(input.paymentOrderId);
  if (order) {
    void publishEvent({
      type: 'payment.success',
      scope: { companyId: order.company_id, storeId: order.store_id },
      data: {
        orderId: String(order.id),
        orderNo: order.order_no,
        paidAmount: input.paidAmount,
        splits: splits.map((s) => ({
          recipientType: s.recipientType,
          amount: s.amount,
        })),
      },
    });
    // Best-effort push to the submitter (if we tracked them).
    if (order.sales_staff_name) {
      void sendPushToUser(order.sales_staff_name, {
        title: '支付完成',
        body: `订单 ${order.order_no} 已收款 ¥${input.paidAmount}`,
        data: { kind: 'payment.success', orderNo: order.order_no },
      });
    }
  }

  return {
    paymentOrderId: input.paymentOrderId,
    splits: splits.map((s) => ({ recipientType: s.recipientType, amount: s.amount })),
  };
}

/**
 * Full or partial refund. When fully refunded against a writeoff source,
 * also reverses the writeoff + restores inventory in the same logical step.
 */
export async function refundPayment(input: {
  paymentOrderId: string;
  amount?: number; // omit = full refund
  reason?: string;
  actor?: string;
}): Promise<{ refundedAmount: number; writeoffReverted: boolean }> {
  const order = await getPaymentOrderById(input.paymentOrderId);
  if (!order) throw new Error('支付订单不存在');
  if (order.status === '已退款') throw new Error('订单已全额退款');

  const paidAmount = Number(order.paid_amount ?? 0);
  const remaining = paidAmount - Number(order.refund_amount ?? 0);
  const requested = input.amount ?? remaining;
  if (requested <= 0 || requested > remaining) {
    throw new Error('退款金额无效');
  }

  // SQB refund (only when configured + we have a real sqb_sn).
  const terminal = order.store_id ? await getStoreTerminal(order.store_id) : null;
  if (isSqbConfigured() && terminal && !order.sqb_sn?.startsWith('MOCK-')) {
    const refundRequestNo = `${order.sqb_client_sn}-R${Math.floor(Date.now() / 1000)}`;
    const res = await refundOrder({
      terminal,
      clientSn: order.sqb_client_sn,
      refundRequestNo,
      refundAmountYuan: requested,
      operator: input.actor ?? '后台用户',
    });
    if (res.result_code !== '200') {
      throw new Error(
        `SQB refund 失败: ${res.error_message ?? res.error_code ?? 'unknown'}`,
      );
    }
  }
  // Mock mode: just bookkeeping; no external call.

  await markPaymentOrderRefunded(input.paymentOrderId, requested);

  // For writeoff-sourced full refunds: reverse the writeoff.
  let writeoffReverted = false;
  if (
    order.source_type === 'writeoff' &&
    order.source_id &&
    requested >= remaining
  ) {
    await revertWriteoff(order.source_id, input.actor ?? '退款');
    writeoffReverted = true;
  }

  const refreshed = await getPaymentOrderById(input.paymentOrderId);
  if (refreshed) {
    void publishEvent({
      type: 'payment.refunded',
      scope: { companyId: refreshed.company_id, storeId: refreshed.store_id },
      data: {
        orderId: String(refreshed.id),
        orderNo: refreshed.order_no,
        refundedAmount: requested,
        writeoffReverted,
      },
    });
  }

  return { refundedAmount: requested, writeoffReverted };
}
