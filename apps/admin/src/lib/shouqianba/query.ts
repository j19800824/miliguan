import { sqbRequest, type SqbTerminal } from './client';
import type { SqbQueryResponse } from './types';

/**
 * Poll order status. Use sparingly — primary signal should be the webhook.
 * Both `sn` (SQB-side) and `client_sn` (our side) work; pass whichever
 * you have. Per SQB docs, exactly one is required.
 */
export async function queryOrder(input: {
  terminal: SqbTerminal;
  sn?: string;
  clientSn?: string;
}) {
  if (!input.sn && !input.clientSn) {
    throw new Error('queryOrder: 需要 sn 或 clientSn');
  }
  const body: Record<string, unknown> = {
    terminal_sn: input.terminal.terminalSn,
  };
  if (input.sn) body.sn = input.sn;
  if (input.clientSn) body.client_sn = input.clientSn;
  return sqbRequest<SqbQueryResponse>('/upay/v2/query', body, input.terminal);
}
