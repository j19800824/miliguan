import { getApiClient, shouldUseMocks } from './client';

export interface SkuOption {
  id: string;
  label: string;
  price: number;
}

const MOCK_SKUS: SkuOption[] = [
  { id: '1', label: '低GI免煮米 / 2kg / MLG-2KG-001', price: 60 },
  { id: '2', label: '低GI免煮米 / 100g×25 / MLG-100G-25', price: 170 },
  { id: '3', label: '低GI免煮米 / 2.5kg / MLG-2.5KG-001', price: 75 },
  { id: '4', label: '低GI免煮米 / 100g / MLG-100G-001', price: 12 },
];

export async function fetchSkuOptions(): Promise<SkuOption[]> {
  if (shouldUseMocks()) return MOCK_SKUS;
  return getApiClient()<SkuOption[]>('/api/mobile/skus');
}

export interface CreateOrderItem {
  sku_id: string;
  quantity: number;
}

export interface CreateOrderResult {
  ok: boolean;
  id?: string | number;
  message?: string;
}

export async function createOrder(
  items: CreateOrderItem[],
): Promise<CreateOrderResult> {
  if (shouldUseMocks()) {
    return { ok: true, id: 'MOCK-ORD-001', message: '演示模式下单成功' };
  }
  return getApiClient()<CreateOrderResult>('/api/mobile/orders', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}
