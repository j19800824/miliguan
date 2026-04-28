import { MOCK_INVENTORY } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type InventoryItem = (typeof MOCK_INVENTORY)[number];

export async function fetchInventory(): Promise<InventoryItem[]> {
  if (shouldUseMocks()) return MOCK_INVENTORY;
  return getApiClient()<InventoryItem[]>('/api/mobile/inventory');
}

export interface StoreInventoryItem {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  spec: string;
  unit: string;
  imageUrl: string;
  quantity: number;
  safetyStock: number;
  warn: boolean;
}

export async function fetchStoreInventory(): Promise<StoreInventoryItem[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<StoreInventoryItem[]>('/api/mobile/inventory/store');
}

export interface InventoryWarning {
  id: string;
  companyId: string;
  companyName: string;
  productName: string;
  skuCode: string;
  spec: string;
  quantity: number;
  safetyStock: number;
}

export async function fetchInventoryWarnings(): Promise<InventoryWarning[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<InventoryWarning[]>('/api/mobile/inventory/warnings');
}
