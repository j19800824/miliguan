import { sqbRequest, type SqbTerminal } from './client';
import type { SqbPrecreateResponse, SqbSplitInfo } from './types';

/**
 * Create a customer-presented QR (C-scan-B) order.
 *
 * Amount is passed in 分 (cents), as a string. We accept yuan for
 * developer ergonomics and convert internally.
 */
export async function precreate(input: {
  terminal: SqbTerminal;
  clientSn: string;            // our unique order number
  amountYuan: number;          // e.g. 60.00 → "6000"
  subject: string;             // shown in payer's app
  operator?: string;
  notifyUrl?: string;
  extra?: Record<string, unknown>;
  splitInfo?: SqbSplitInfo[];  // when 分账 is configured pre-payment
}) {
  const body: Record<string, unknown> = {
    terminal_sn: input.terminal.terminalSn,
    client_sn: input.clientSn,
    total_amount: String(Math.round(input.amountYuan * 100)),
    subject: input.subject,
    operator: input.operator ?? 'mobile',
  };
  if (input.notifyUrl) body.notify_url = input.notifyUrl;
  if (input.extra) body.extra = JSON.stringify(input.extra);
  if (input.splitInfo && input.splitInfo.length > 0) {
    // SQB expects split_info as a JSON-string field on most plans.
    body.split_info = JSON.stringify(input.splitInfo);
  }
  return sqbRequest<SqbPrecreateResponse>(
    '/upay/v2/precreate',
    body,
    input.terminal,
  );
}
