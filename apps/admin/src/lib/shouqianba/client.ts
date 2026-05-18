import crypto from 'node:crypto';

/**
 * Shouqianba (收钱吧) V2 API client.
 *
 * Auth model:
 *   - `vendor`  credentials are used ONCE per terminal to activate it
 *               (POST /terminal/activate). Stored in env as
 *               SQB_VENDOR_SN / SQB_VENDOR_KEY.
 *   - `terminal` credentials (terminal_sn + terminal_key) are returned by
 *               activate and are required for all transaction APIs. They
 *               must be persisted per store and rotated periodically via
 *               /terminal/checkin.
 *
 * Signature: Authorization header is
 *   `<sn> <md5(json_body + key)>`
 * (Yes, MD5 — that's what 收钱吧 V2 uses. Don't substitute SHA256.)
 *
 * All transaction APIs answer with the envelope:
 *   { result_code, error_code?, error_message?, biz_response? }
 * `result_code === '200'` means the HTTP call succeeded; you must still
 * inspect `biz_response.order_status` for the actual order state.
 */

export interface SqbConfig {
  baseUrl: string;
  vendorSn: string;
  vendorKey: string;
}

export interface SqbTerminal {
  terminalSn: string;
  terminalKey: string;
}

export interface SqbEnvelope<T> {
  result_code: string;
  error_code?: string;
  error_message?: string;
  biz_response?: T;
}

export function getSqbConfig(): SqbConfig {
  return {
    baseUrl: process.env.SQB_BASE_URL ?? 'https://vsi-api.shouqianba.com',
    vendorSn: process.env.SQB_VENDOR_SN ?? '',
    vendorKey: process.env.SQB_VENDOR_KEY ?? '',
  };
}

export function isSqbConfigured(): boolean {
  const cfg = getSqbConfig();
  return Boolean(cfg.vendorSn && cfg.vendorKey);
}

function sign(body: string, key: string): string {
  return crypto.createHash('md5').update(body + key, 'utf8').digest('hex');
}

/**
 * Verify an incoming webhook's Authorization header.
 *   Authorization: <terminal_sn> <md5(raw_body + terminal_key)>
 * Returns the parsed terminal_sn if verification passes, null otherwise.
 */
export function verifyWebhookSignature(
  authHeader: string | null,
  rawBody: string,
  resolveTerminalKey: (terminalSn: string) => string | null | Promise<string | null>,
): Promise<{ ok: boolean; terminalSn?: string; signature?: string }> {
  return (async () => {
    if (!authHeader) return { ok: false };
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2) return { ok: false };
    const [terminalSn, signature] = parts;
    const key = await resolveTerminalKey(terminalSn);
    if (!key) return { ok: false, terminalSn, signature };
    const expected = sign(rawBody, key);
    return {
      ok: timingSafeEqual(expected, signature),
      terminalSn,
      signature,
    };
  })();
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Generic JSON-over-HTTP call to a Shouqianba endpoint.
 * @param path  e.g. '/upay/v2/precreate'
 * @param body  request body (object); terminal_sn must be set inside for
 *              non-activate calls
 * @param auth  'vendor' to sign with vendor credentials, or a SqbTerminal
 *              object to sign with terminal credentials
 */
export async function sqbRequest<T>(
  path: string,
  body: Record<string, unknown>,
  auth: 'vendor' | SqbTerminal,
): Promise<SqbEnvelope<T>> {
  const cfg = getSqbConfig();
  if (!cfg.baseUrl) throw new Error('SQB_BASE_URL not configured');

  let sn: string;
  let key: string;
  if (auth === 'vendor') {
    if (!cfg.vendorSn || !cfg.vendorKey) {
      throw new Error(
        '收钱吧未配置: 请设置 SQB_VENDOR_SN / SQB_VENDOR_KEY 环境变量',
      );
    }
    sn = cfg.vendorSn;
    key = cfg.vendorKey;
  } else {
    if (!auth.terminalSn || !auth.terminalKey) {
      throw new Error('终端未激活: terminal_sn / terminal_key 缺失');
    }
    sn = auth.terminalSn;
    key = auth.terminalKey;
  }

  const json = JSON.stringify(body);
  const sig = sign(json, key);

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `${sn} ${sig}`,
      Accept: 'application/json',
    },
    body: json,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQB HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  try {
    return JSON.parse(text) as SqbEnvelope<T>;
  } catch {
    throw new Error(`SQB invalid JSON: ${text}`);
  }
}
