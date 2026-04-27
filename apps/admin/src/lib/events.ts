import { publishEvent } from './event-bus';
import { sendPushToUser } from './push';
import {
  listStaffIdsByStore,
  listStaffIdsByCompany,
} from './database.js';

/* ============================================================
 * High-level event helpers — these are the entry points the rest
 * of the app calls. Each one fans out to:
 *   1. Redis pub/sub  → SSE → mobile foreground refresh
 *   2. Expo Push API  → notification tray (foreground or background)
 * ============================================================ */

interface StaffRow {
  id: string;
  name?: string;
  account?: string;
}

export interface WriteoffNotification {
  storeId?: string | number;
  companyId?: string | number;
  productName: string;
  skuCode: string;
  points: number;
  staffName?: string;
}

export async function notifyWriteoffCreated(payload: WriteoffNotification) {
  await publishEvent({
    type: 'writeoff.created',
    scope: {
      companyId: payload.companyId,
      storeId: payload.storeId,
    },
    data: payload as unknown as Record<string, unknown>,
  });

  const recipients = (await listStaffIdsByStore(payload.storeId)) as StaffRow[];
  await Promise.all(
    recipients.map((r) =>
      sendPushToUser(r.id, {
        title: '核销成功',
        body: `${payload.productName} ×1，回积分 +${payload.points}`,
        data: { kind: 'writeoff', ...payload },
      }),
    ),
  );
}

export interface InventoryWarning {
  companyId: string | number;
  storeId?: string | number;
  productName: string;
  skuCode: string;
  remaining: number;
  threshold: number;
}

export async function notifyInventoryWarning(payload: InventoryWarning) {
  await publishEvent({
    type: 'inventory.warning',
    scope: {
      companyId: payload.companyId,
      storeId: payload.storeId,
    },
    data: payload as unknown as Record<string, unknown>,
  });

  const recipients = (await listStaffIdsByCompany(payload.companyId)) as StaffRow[];
  await Promise.all(
    recipients.map((r) =>
      sendPushToUser(r.id, {
        title: '库存预警',
        body: `${payload.productName} 剩余 ${payload.remaining}（阈值 ${payload.threshold}）`,
        data: { kind: 'inventory.warning', ...payload },
      }),
    ),
  );
}

export interface PurchaseOrderNotification {
  orderNo: string;
  companyId: string | number;
  result: '通过' | '驳回';
  finalStatus?: string;
  note?: string;
  actor?: string;
}

export async function notifyPurchaseApproved(payload: PurchaseOrderNotification) {
  await publishEvent({
    type: 'purchase.approved',
    scope: { companyId: payload.companyId },
    data: payload as unknown as Record<string, unknown>,
  });

  const recipients = (await listStaffIdsByCompany(payload.companyId)) as StaffRow[];
  const verb = payload.result === '通过' ? '已通过' : '已驳回';
  await Promise.all(
    recipients.map((r) =>
      sendPushToUser(r.id, {
        title: `订货单${verb}`,
        body: `${payload.orderNo}${payload.note ? ' · ' + payload.note : ''}`,
        data: { kind: 'purchase.approved', ...payload },
      }),
    ),
  );
}

export interface PurchaseOrderReceiveNotification {
  orderNo: string;
  companyId: string | number;
  actor?: string;
}

export async function notifyPurchaseReceived(payload: PurchaseOrderReceiveNotification) {
  await publishEvent({
    type: 'purchase.received',
    scope: { companyId: payload.companyId },
    data: payload as unknown as Record<string, unknown>,
  });

  const recipients = (await listStaffIdsByCompany(payload.companyId)) as StaffRow[];
  await Promise.all(
    recipients.map((r) =>
      sendPushToUser(r.id, {
        title: '订货单已入库',
        body: `${payload.orderNo} 库存已更新`,
        data: { kind: 'purchase.received', ...payload },
      }),
    ),
  );
}
