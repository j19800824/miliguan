import { getApiClient, shouldUseMocks } from './client';

export interface ReplenishmentRow {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: number;
  totalQty: number;
  createdAt: string;
}

export interface PendingReplenishment {
  id: string;
  orderNo: string;
  storeId: string;
  storeName: string;
  totalQty: number;
  totalAmount: number;
  createdAt: string;
}

export interface CreateReplenishmentItem {
  sku_id: string | number;
  quantity: number;
}

export async function fetchReplenishments(): Promise<ReplenishmentRow[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<ReplenishmentRow[]>('/api/mobile/replenishments');
}

export async function fetchPendingReplenishments(): Promise<PendingReplenishment[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<PendingReplenishment[]>(
    '/api/mobile/replenishments/pending',
  );
}

export async function createReplenishment(
  items: CreateReplenishmentItem[],
  remark = '',
): Promise<{ ok: boolean; id: string; orderNo: string }> {
  if (shouldUseMocks()) {
    return { ok: true, id: 'mock', orderNo: `MOCK-${Date.now()}` };
  }
  return getApiClient()<{ ok: boolean; id: string; orderNo: string }>(
    '/api/mobile/replenishments',
    { method: 'POST', body: JSON.stringify({ items, remark }) },
  );
}

export async function approveReplenishment(
  id: string,
  decision: '通过' | '驳回',
): Promise<{ ok: boolean; status: string }> {
  if (shouldUseMocks()) return { ok: true, status: '已入库' };
  return getApiClient()<{ ok: boolean; status: string }>(
    `/api/mobile/replenishments/${id}/approve`,
    { method: 'PUT', body: JSON.stringify({ decision }) },
  );
}
