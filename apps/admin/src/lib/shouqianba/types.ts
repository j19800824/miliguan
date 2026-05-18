/**
 * Subset of 收钱吧 V2 API response payloads we actually consume.
 * Reference: https://doc.shouqianba.com/
 */

export type SqbOrderStatus =
  | 'CREATED'
  | 'PAID'
  | 'PAY_CANCELED'
  | 'PAY_ERROR'
  | 'PARTIAL_REFUNDED'
  | 'REFUNDED'
  | 'CANCELED'
  | 'CLOSED';

export interface SqbTerminalActivateResponse {
  terminal_sn: string;
  terminal_key: string;
}

export interface SqbTerminalCheckinResponse {
  terminal_sn: string;
  terminal_key: string;
}

export interface SqbPrecreateResponse {
  terminal_sn: string;
  sn: string;
  client_sn: string;
  trade_no: string;
  status: SqbOrderStatus;
  order_status: SqbOrderStatus;
  qr_code: string;
  qr_code_image_url?: string;
  payway?: string;
  total_amount: string;
  net_amount?: string;
  subject?: string;
  operator?: string;
  finish_time?: string;
}

export interface SqbQueryResponse extends SqbPrecreateResponse {
  description?: string;
  channel_finish_time?: string;
  refunds?: Array<{
    refund_request_no: string;
    refund_status: string;
    refund_amount: string;
    refund_time: string;
  }>;
}

export interface SqbRefundResponse {
  sn: string;
  client_sn: string;
  order_status: SqbOrderStatus;
  refund_request_no: string;
  refund_amount: string;
  finish_time?: string;
}

export interface SqbSplitInfo {
  sub_member_id: string;
  amount: string; // 分
  description?: string;
}

export interface SqbSplitResponse {
  sn: string;
  client_sn: string;
  split_records: Array<{
    sub_member_id: string;
    amount: string;
    status: string;
    split_sn?: string;
    error_message?: string;
  }>;
}
