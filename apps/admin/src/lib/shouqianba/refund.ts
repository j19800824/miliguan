import { sqbRequest, type SqbTerminal } from './client';
import type { SqbRefundResponse } from './types';

/**
 * Refund (full or partial). `refundRequestNo` must be a unique idempotent
 * key — we typically reuse `${client_sn}-R${seq}` so repeated calls return
 * the same result instead of double-refunding.
 */
export async function refundOrder(input: {
  terminal: SqbTerminal;
  sn?: string;
  clientSn?: string;
  refundRequestNo: string;
  refundAmountYuan: number;
  operator?: string;
}) {
  if (!input.sn && !input.clientSn) {
    throw new Error('refundOrder: 需要 sn 或 clientSn');
  }
  const body: Record<string, unknown> = {
    terminal_sn: input.terminal.terminalSn,
    refund_request_no: input.refundRequestNo,
    refund_amount: String(Math.round(input.refundAmountYuan * 100)),
    operator: input.operator ?? 'mobile',
  };
  if (input.sn) body.sn = input.sn;
  if (input.clientSn) body.client_sn = input.clientSn;
  return sqbRequest<SqbRefundResponse>('/upay/v2/refund', body, input.terminal);
}

/**
 * Cancel an unpaid order (closes the QR so the customer can no longer pay).
 * For paid orders use refundOrder instead.
 */
export async function cancelOrder(input: {
  terminal: SqbTerminal;
  sn?: string;
  clientSn?: string;
  operator?: string;
}) {
  const body: Record<string, unknown> = {
    terminal_sn: input.terminal.terminalSn,
    operator: input.operator ?? 'mobile',
  };
  if (input.sn) body.sn = input.sn;
  if (input.clientSn) body.client_sn = input.clientSn;
  return sqbRequest<{ sn: string; client_sn: string; order_status: string }>(
    '/upay/v2/cancel',
    body,
    input.terminal,
  );
}
