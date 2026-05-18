import { sqbRequest, type SqbTerminal } from './client';
import type { SqbSplitInfo, SqbSplitResponse } from './types';

/**
 * Trigger a post-payment split. Only needed when split_info was NOT
 * passed at precreate-time. Most flows should prefer pre-payment split
 * (precreate.splitInfo) for atomic settlement.
 *
 * SQB returns a record per sub-member with its individual status. The
 * caller should update each payment_splits row accordingly.
 */
export async function splitOrder(input: {
  terminal: SqbTerminal;
  sn?: string;
  clientSn?: string;
  splits: SqbSplitInfo[];
}) {
  if (!input.sn && !input.clientSn) {
    throw new Error('splitOrder: 需要 sn 或 clientSn');
  }
  if (input.splits.length === 0) {
    throw new Error('splitOrder: 至少需要一个分账项');
  }
  const body: Record<string, unknown> = {
    terminal_sn: input.terminal.terminalSn,
    split_info: JSON.stringify(input.splits),
  };
  if (input.sn) body.sn = input.sn;
  if (input.clientSn) body.client_sn = input.clientSn;
  return sqbRequest<SqbSplitResponse>('/upay/v2/split', body, input.terminal);
}
