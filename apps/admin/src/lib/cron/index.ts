/**
 * Cron registration — central place to register every scheduled job.
 *
 * Loaded from `instrumentation.ts` only when NEXT_RUNTIME === 'nodejs',
 * i.e. inside the long-running Node server. Skipped at build time, in
 * edge runtime, and in Vercel serverless (which doesn't keep functions
 * warm long enough for in-process schedulers — use Vercel Cron instead).
 *
 * To add a new job:
 *   1. Implement a job function in ./jobs/<name>.ts (must be idempotent
 *      + acquire a Redis lock via lib/cron/locks).
 *   2. Add a cron.schedule(...) call below.
 *
 * Override timing via env vars during dev / testing:
 *   CRON_DISABLED=1                — skip all cron registration
 *   CRON_RECONCILE=<cron expr>     — override reconciliation schedule
 */

import cron from 'node-cron';
import { runDailyReconciliation } from './jobs/reconciliation';

let registered = false;

export function registerCronJobs(): void {
  if (registered) return;
  if (process.env.CRON_DISABLED === '1') {
    // eslint-disable-next-line no-console
    console.info('[cron] disabled via CRON_DISABLED=1');
    return;
  }
  registered = true;

  // Daily reconciliation — 00:10 Beijing time. Validates that the
  // expression parses before scheduling, otherwise node-cron silently
  // accepts garbage.
  const reconcileExpr = process.env.CRON_RECONCILE ?? '10 0 * * *';
  if (!cron.validate(reconcileExpr)) {
    // eslint-disable-next-line no-console
    console.error(`[cron] invalid CRON_RECONCILE expression: ${reconcileExpr}`);
  } else {
    cron.schedule(reconcileExpr, () => void runDailyReconciliation(), {
      timezone: 'Asia/Shanghai',
      noOverlap: true,
      name: 'payment-reconcile-daily',
    });
    // eslint-disable-next-line no-console
    console.info(
      `[cron] scheduled daily reconciliation: ${reconcileExpr} Asia/Shanghai`,
    );
  }
}
