import { MOCK_ORDERS } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Order = (typeof MOCK_ORDERS)[number];

export async function fetchOrders(): Promise<Order[]> {
  if (shouldUseMocks()) return MOCK_ORDERS;
  return getApiClient()<Order[]>('/api/mobile/orders');
}

export interface OrderItemDetail {
  id: string;
  productName: string;
  skuCode: string;
  spec: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  pointsRebate: number;
  writeoffStatus: string;
}

export interface OrderDetail {
  id: string;
  orderNo: string;
  status: string;
  customerType: string;
  memberName: string;
  memberPhone: string;
  salesStaffName: string;
  totalAmount: number;
  createdAt: string;
  companyName: string;
  storeName: string;
  items: OrderItemDetail[];
}

export async function fetchOrderDetail(id: string): Promise<OrderDetail | null> {
  if (shouldUseMocks()) return null;
  return getApiClient()<OrderDetail>(`/api/mobile/orders/${id}`);
}
