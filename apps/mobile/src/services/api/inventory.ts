import { MOCK_INVENTORY } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type InventoryItem = (typeof MOCK_INVENTORY)[number];

export async function fetchInventory(): Promise<InventoryItem[]> {
  if (shouldUseMocks()) return MOCK_INVENTORY;
  return getApiClient()<InventoryItem[]>('/inventory');
}
