/**
 * Daily payment reconciliation cron job.
 *
 * Runs every night at 00:10 Asia/Shanghai. Reconciles the previous
 * day's payment_orders against 收钱吧 via reconcilePayments(). Drift
 * detection auto-corrects what it can; surfaces the rest as admin
 * notifications.
 */

import { acquireCronLock, releaseCronLock } from '../locks';
import { reconcilePayments } from '@/lib/payment/reconciliation';

function yesterdayIsoDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function runDailyReconciliation(): Promise<void> {
  const date = yesterdayIsoDate();
  const lockKey = `reconcile:${date}`;
  // 30-minute safety TTL — reconciliation should finish in seconds even
  // with thousands of orders, but if a worker hangs the next tick can
  // pick up tomorrow.
  const gotLock = await acquireCronLock(lockKey, 30 * 60 * 1000);
  if (!gotLock) {
    // eslint-disable-next-line no-console
    console.info(`[cron][reconcile] ${date} — already running in another worker, skip`);
    return;
  }
  try {
    // eslint-disable-next-line no-console
    console.info(`[cron][reconcile] ${date} — start`);
    const summary = await reconcilePayments(date);
    // eslint-disable-next-line no-console
    console.info(
      `[cron][reconcile] ${date} — done runId=${summary.runId} checked=${summary.totalChecked} drifts=${summary.drifts.length} mock=${summary.mockMode}`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[cron][reconcile] ${date} — failed`, err);
  } finally {
    await releaseCronLock(lockKey);
  }
}
