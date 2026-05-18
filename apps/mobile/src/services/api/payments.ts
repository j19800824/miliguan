import { getApiClient, shouldUseMocks } from './client';

export interface CreatePaymentResponse {
  id: string;
  orderNo: string;
  amount: number;
  status: string;
  qrCode: string;
  sqbSn: string;
  mockMode: boolean;
}

export interface PaymentSplit {
  id: string;
  recipientType: 'hq' | 'company' | 'store' | 'sales_staff' | string;
  amount: number;
  status: string;
}

export interface PaymentDetail {
  id: string;
  orderNo: string;
  status: string;
  amount: number;
  paidAmount: number;
  refundAmount: number;
  payWay: string;
  sqbSn: string;
  qrCode: string;
  paidAt: string | null;
  splits: PaymentSplit[];
}

export interface RefundResult {
  ok: boolean;
  refundedAmount: number;
  writeoffReverted: boolean;
}

export interface CreatePaymentInput {
  sourceType?: 'writeoff' | 'topup' | 'standalone';
  sourceId?: string | number;
  amount?: number;
  subject?: string;
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResponse> {
  if (shouldUseMocks()) {
    return {
      id: 'mock-payment',
      orderNo: `PAY-MOCK-${Date.now()}`,
      amount: input.amount ?? 60,
      status: '待支付',
      qrCode: 'miliguan://mock-pay?demo=1',
      sqbSn: `MOCK-${Date.now()}`,
      mockMode: true,
    };
  }
  return getApiClient()<CreatePaymentResponse>('/api/mobile/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchPayment(id: string): Promise<PaymentDetail> {
  if (shouldUseMocks()) {
    return {
      id,
      orderNo: 'PAY-MOCK-001',
      status: '待支付',
      amount: 60,
      paidAmount: 0,
      refundAmount: 0,
      payWay: '',
      sqbSn: 'MOCK-XYZ',
      qrCode: 'miliguan://mock-pay?demo=1',
      paidAt: null,
      splits: [],
    };
  }
  return getApiClient()<PaymentDetail>(`/api/mobile/payments/${id}`);
}

export async function mockPay(id: string): Promise<{ ok: boolean }> {
  if (shouldUseMocks()) return { ok: true };
  return getApiClient()<{ ok: boolean }>(
    `/api/mobile/payments/${id}/mock-pay`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function refundPayment(
  id: string,
  amount?: number,
  reason?: string,
): Promise<RefundResult> {
  if (shouldUseMocks()) {
    return { ok: true, refundedAmount: amount ?? 0, writeoffReverted: true };
  }
  return getApiClient()<RefundResult>(
    `/api/mobile/payments/${id}/refund`,
    { method: 'POST', body: JSON.stringify({ amount, reason }) },
  );
}
