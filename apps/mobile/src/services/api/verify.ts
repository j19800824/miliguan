import { MOCK_VERIFY_RECORDS } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type VerifyRecord = (typeof MOCK_VERIFY_RECORDS)[number];

export interface VerifyScanRequest {
  barcode: string;
}

export interface VerifyScanResult {
  success: boolean;
  product?: { name: string; sku: string; points: number };
  message?: string;
}

export async function fetchVerifyRecords(): Promise<VerifyRecord[]> {
  if (shouldUseMocks()) return MOCK_VERIFY_RECORDS;
  return getApiClient()<VerifyRecord[]>('/api/mobile/verify/records');
}

export async function postVerifyScan(
  req: VerifyScanRequest,
): Promise<VerifyScanResult> {
  if (shouldUseMocks()) {
    if (req.barcode === '0000000000000') {
      return { success: false, message: '未识别商品或已核销' };
    }
    return {
      success: true,
      product: { name: '低GI免煮米 2kg', sku: 'MLG-2KG-001', points: 60 },
    };
  }
  return getApiClient()<VerifyScanResult>('/api/mobile/verify/scan', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
