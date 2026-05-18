import { sqbRequest, type SqbTerminal } from './client';
import type {
  SqbTerminalActivateResponse,
  SqbTerminalCheckinResponse,
} from './types';

/**
 * Activate a brand-new terminal. Uses VENDOR credentials.
 * Should be called ONCE per store; result must be persisted (see
 * saveStoreTerminal in database.js).
 */
export async function activateTerminal(input: {
  code: string;
  deviceId?: string;
  name?: string;
}) {
  const body = {
    code: input.code,
    device_id: input.deviceId ?? `MILIGUAN-${Date.now()}`,
    name: input.name ?? '米粒冠门店终端',
  };
  return sqbRequest<SqbTerminalActivateResponse>(
    '/terminal/activate',
    body,
    'vendor',
  );
}

/**
 * Rotate terminal_key on existing terminal. Uses TERMINAL credentials.
 * SQB requires periodic re-checkin (typically once per startup or daily).
 */
export async function checkinTerminal(terminal: SqbTerminal, deviceId?: string) {
  const body = {
    terminal_sn: terminal.terminalSn,
    device_id: deviceId ?? '',
  };
  return sqbRequest<SqbTerminalCheckinResponse>(
    '/terminal/checkin',
    body,
    terminal,
  );
}
