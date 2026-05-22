/**
 * 对账 (Reconciliation) — 比对我们 payment_orders 与收钱吧侧权威状态，
 * 发现漂移则记录到 payment_reconciliation_log + 通知 admin。
 *
 * 调用入口：
 *   - 手动: POST /api/admin/payments/reconcile?date=YYYY-MM-DD
 *   - cron: 每天 23:30 拉前一日（建议系统层 cron + 这个路由）
 *
 * Mock 模式（SQB 未配置）：跳过实际调用，只记一条 skipped 日志。
 * 真实环境：对当日 paid_at 或 refunded_at 的每个订单调 SQB /upay/v2/query
 * 取权威状态，对比并分类漂移。
 */

import {
  listPaymentsForReconciliation,
  getStoreTerminal,
  recordReconciliationDrift,
  createAdminNotification,
  markPaymentOrderRefunded,
  markPaymentOrderPaid,
} from '@/lib/database.js';
import { queryOrder, isSqbConfigured, type SqbTerminal } from '@/lib/shouqianba';
import type { SqbQueryResponse } from '@/lib/shouqianba/types';

interface PaymentRow {
  id: number;
  order_no: string;
  status: string;
  sqb_sn: string;
  sqb_client_sn: string;
  amount: number | string;
  paid_amount: number | string;
  refund_amount: number | string;
  store_id?: number | null;
  paid_at?: string | Date | null;
  refunded_at?: string | Date | null;
}

interface DriftRecord {
  paymentOrderId: number;
  orderNo: string;
  sqbSn: string;
  ourStatus: string;
  sqbStatus: string;
  driftType:
    | 'missing_refund'
    | 'missing_payment'
    | 'unknown_sqb'
    | 'amount_mismatch'
    | 'sqb_query_error'
    | 'ok';
  actionTaken: string;
}

export interface ReconciliationSummary {
  runId: string;
  runDate: string;
  totalChecked: number;
  drifts: DriftRecord[];
  mockMode: boolean;
}

function normaliseAmount(value: number | string | undefined): number {
  return Number(value ?? 0);
}

function dateStr(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

function mapSqbStatusToOurs(sqbStatus: string): string {
  switch (sqbStatus) {
    case 'PAID':
      return '已支付';
    case 'REFUNDED':
      return '已退款';
    case 'PARTIAL_REFUNDED':
      return '部分退款';
    case 'PAY_CANCELED':
    case 'CANCELED':
    case 'CLOSED':
      return '已关闭';
    case 'CREATED':
      return '待支付';
    default:
      return sqbStatus;
  }
}

export async function reconcilePayments(date: string): Promise<ReconciliationSummary> {
  const runId = `RECON-${date.replace(/-/g, '')}-${Math.floor(Date.now() / 1000)}`;
  const runDate = date;
  const mockMode = !isSqbConfigured();

  const orders = (await listPaymentsForReconciliation(date)) as PaymentRow[];

  if (mockMode) {
    await recordReconciliationDrift({
      runId,
      runDate,
      paymentOrderId: undefined,
      orderNo: '',
      sqbSn: '',
      ourStatus: 'mock',
      sqbStatus: 'mock',
      driftType: 'sqb_query_error',
      actionTaken: 'skipped: SQB_VENDOR_SN/KEY not configured',
      rawResponse: { mock: true, candidates: orders.length },
    });
    return {
      runId,
      runDate,
      totalChecked: 0,
      drifts: [],
      mockMode: true,
    };
  }

  const drifts: DriftRecord[] = [];

  for (const order of orders) {
    if (!order.sqb_sn || !order.store_id) continue;
    const terminal = (await getStoreTerminal(order.store_id)) as SqbTerminal | null;
    if (!terminal) {
      const d: DriftRecord = {
        paymentOrderId: order.id,
        orderNo: order.order_no,
        sqbSn: order.sqb_sn,
        ourStatus: order.status,
        sqbStatus: '',
        driftType: 'sqb_query_error',
        actionTaken: 'skipped: no terminal credentials',
      };
      await recordReconciliationDrift({ ...d, runId, runDate, rawResponse: {} });
      drifts.push(d);
      continue;
    }

    let sqbStatus = '';
    let sqbRefundAmount = 0;
    let raw: unknown = {};
    try {
      const res = await queryOrder({ terminal, sn: order.sqb_sn });
      raw = res;
      if (res.result_code !== '200' || !res.biz_response) {
        const d: DriftRecord = {
          paymentOrderId: order.id,
          orderNo: order.order_no,
          sqbSn: order.sqb_sn,
          ourStatus: order.status,
          sqbStatus: '',
          driftType: 'sqb_query_error',
          actionTaken: `SQB error: ${res.error_message ?? res.error_code ?? 'unknown'}`,
        };
        await recordReconciliationDrift({ ...d, runId, runDate, rawResponse: raw as Record<string, unknown> });
        drifts.push(d);
        continue;
      }
      const biz = res.biz_response as SqbQueryResponse;
      sqbStatus = biz.order_status;
      if (Array.isArray(biz.refunds)) {
        sqbRefundAmount = biz.refunds.reduce(
          (sum, r) => sum + Number(r.refund_amount ?? 0) / 100,
          0,
        );
      }
    } catch (err) {
      const d: DriftRecord = {
        paymentOrderId: order.id,
        orderNo: order.order_no,
        sqbSn: order.sqb_sn,
        ourStatus: order.status,
        sqbStatus: '',
        driftType: 'sqb_query_error',
        actionTaken: `exception: ${err instanceof Error ? err.message : 'unknown'}`,
      };
      await recordReconciliationDrift({ ...d, runId, runDate, rawResponse: {} });
      drifts.push(d);
      continue;
    }

    const ourStatus = order.status;
    const mappedSqb = mapSqbStatusToOurs(sqbStatus);

    // Drift classification:
    //   1. SQB says REFUNDED but we say 已支付/已分账   → missing_refund
    //   2. SQB says PAID    but we say 待支付            → missing_payment
    //   3. Amount mismatch  (refund_amount difference)   → amount_mismatch
    //   4. Otherwise OK

    if (
      (sqbStatus === 'REFUNDED' || sqbStatus === 'PARTIAL_REFUNDED') &&
      (ourStatus === '已支付' || ourStatus === '已分账')
    ) {
      const ourRefund = normaliseAmount(order.refund_amount);
      const drift = Math.abs(ourRefund - sqbRefundAmount);
      if (drift > 0.01) {
        const adjustment = sqbRefundAmount - ourRefund;
        if (adjustment > 0) {
          await markPaymentOrderRefunded(order.id, adjustment);
        }
        const d: DriftRecord = {
          paymentOrderId: order.id,
          orderNo: order.order_no,
          sqbSn: order.sqb_sn,
          ourStatus,
          sqbStatus,
          driftType: 'missing_refund',
          actionTaken: `auto-applied refund delta ¥${adjustment.toFixed(2)}`,
        };
        await recordReconciliationDrift({ ...d, runId, runDate, rawResponse: raw as Record<string, unknown> });
        drifts.push(d);
        continue;
      }
    }

    if (sqbStatus === 'PAID' && ourStatus === '待支付') {
      const paidAmount = normaliseAmount(order.amount);
      await markPaymentOrderPaid(
        order.id,
        paidAmount,
        '',
        '',
        order.sqb_sn,
      );
      const d: DriftRecord = {
        paymentOrderId: order.id,
        orderNo: order.order_no,
        sqbSn: order.sqb_sn,
        ourStatus,
        sqbStatus,
        driftType: 'missing_payment',
        actionTaken: 'auto-marked paid; reconciler does not auto-split — manual review',
      };
      await recordReconciliationDrift({ ...d, runId, runDate, rawResponse: raw as Record<string, unknown> });
      drifts.push(d);
      continue;
    }

    if (mappedSqb !== ourStatus && mappedSqb !== '已支付' /* allow 已分账 to remain */) {
      // Different but not one we know how to auto-correct.
      const d: DriftRecord = {
        paymentOrderId: order.id,
        orderNo: order.order_no,
        sqbSn: order.sqb_sn,
        ourStatus,
        sqbStatus,
        driftType: 'unknown_sqb',
        actionTaken: 'manual review',
      };
      await recordReconciliationDrift({ ...d, runId, runDate, rawResponse: raw as Record<string, unknown> });
      drifts.push(d);
    }
  }

  // Surface to admin notifications if there were drifts.
  if (drifts.length > 0) {
    await createAdminNotification({
      recipientScope: 'all',
      type: 'payment.reconciliation.drift',
      title: `对账漂移 ${runDate} — ${drifts.length} 笔`,
      body: `运行 ${runId} 发现 ${drifts.length} 笔与收钱吧状态不一致的订单，请到对账日志查看。`,
      actionType: 'redirect',
      actionLabel: '查看',
      actionUrl: `/dashboard/payments?runId=${runId}`,
      metadata: { runId, runDate, driftCount: drifts.length },
    });
  }

  return {
    runId,
    runDate,
    totalChecked: orders.length,
    drifts,
    mockMode: false,
  };
}
