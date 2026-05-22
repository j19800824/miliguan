# Stage-8: 收钱吧 Payment + 空中分账 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** After successful writeoff (核销), prompt customer to pay via 收钱吧 (aggregator: WeChat/Alipay/UnionPay/Digital RMB), and on payment success automatically split funds among HQ/branch/store/sales-staff via 空中分账 (real-time split settlement).

**Architecture:**
- SQB V2 API integration via thin SDK (`lib/shouqianba/*`) — MD5 sig on JSON body
- Per-store terminal credentials (activate once, checkin daily)
- 5 new DB tables: `payment_orders` / `payment_splits` / `payment_split_rules` / `settlement_accounts` / `payment_webhooks`
- Pre-payment split (recommended): pass `split_info` at `/upay/v2/precreate` so settlement is atomic
- Webhook-first event flow; query-poll as fallback only
- Mobile `PaymentScreen` shown after writeoff success: QR + countdown + auto-poll

---

## Phase Status

- [x] **8.1** DB schema (5 tables + ALTER company_stores for terminal credentials)
- [x] **8.2** SDK skeleton (client/activate/precreate/query/refund/split + verify)
- [ ] **8.3** `settlement_accounts` admin CRUD + KYC ops (skipped — defaults work for v1)
- [x] **8.4** `payment_split_rules` admin CRUD (`/dashboard/payment-split-rules`)
- [x] **8.5** Mobile PaymentScreen + create endpoint + writeoff→payment flow
- [x] **8.6** Webhook receiver + split execution + SSE/Push
- [x] **8.7** Refund + reverse split
- [x] **8.8** Daily reconciliation cron + drift alert (manual trigger via `POST /api/admin/payments/reconcile`)
- [ ] **8.9** Sandbox E2E + cutover to production keys (blocked on user SQB credentials)
- [x] **Bonus** Terminal activation admin UI (`/dashboard/payment-terminals`)

## Operational Notes

### Cron for daily reconciliation

Add a system cron entry (or k8s CronJob, or Vercel Cron) hitting:

```cron
10 0 * * *  curl -X POST \
  -H "Cookie: $ADMIN_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  https://your-admin-host/api/admin/payments/reconcile \
  -d '{}'
```

Empty body = reconcile yesterday. Pass `{"date":"YYYY-MM-DD"}` to backfill a specific day.

Drifts surface as admin notifications (`type: 'payment.reconciliation.drift'`) +
detail row in `payment_reconciliation_log` keyed by `run_id`.

### Terminal activation flow

1. In 收钱吧 商户后台 → 终端管理 → 添加终端 → copy activation code
2. Visit `/dashboard/payment-terminals`, find the store row, click **激活收钱吧终端**
3. Paste the activation code + (optional) terminal display name
4. Submit → backend calls `/terminal/activate` with vendor credentials,
   receives `terminal_sn` + `terminal_key`, persists to `company_stores.sqb_*`

Re-activation overwrites existing terminal credentials (use this if SQB
rotates terminal_key out-of-band).

---

## Env Variables Required

```bash
# admin/.env.local — sandbox first, then swap to production
SQB_BASE_URL=https://vsi-api-sandbox.shouqianba.com
SQB_VENDOR_SN=
SQB_VENDOR_KEY=
SQB_NOTIFY_URL=https://your-public-host/api/payments/notify
```

Terminal credentials are persisted per-store in `company_stores.sqb_terminal_sn` / `sqb_terminal_key`.

## DB Schema (Phase 8.1, landed)

| Table | Role |
|---|---|
| `settlement_accounts` | Receivers (hq/company/store/sales_staff). Holds SQB sub-member id, encrypted KYC info, status |
| `payment_split_rules` | Configurable rules per scope (global/company/store/sku). Percent or fixed. Priority for residual handling |
| `payment_orders` | Per-payment record. SQB `client_sn` = our `order_no` for idempotency |
| `payment_splits` | Realized splits per order — audit trail |
| `payment_webhooks` | Raw callback log + signature validity + processed flag (replay safety) |

ALTER `company_stores`: add `sqb_terminal_sn` / `sqb_terminal_key` / `sqb_device_id`.

All schema is created lazily via `ensurePaymentTables()` — idempotent, no migration script needed.

## SDK Surface (Phase 8.2, landed)

```ts
import {
  // client + signing
  sqbRequest, getSqbConfig, isSqbConfigured, verifyWebhookSignature,
  // operations
  activateTerminal, checkinTerminal,
  precreate, queryOrder,
  refundOrder, cancelOrder,
  splitOrder,
} from '@/lib/shouqianba';
```

All methods accept a `SqbTerminal` (terminal_sn + key) except `activateTerminal` which uses vendor credentials.

## Phase 8.5 Flow (next)

```
mobile.ScanScreen → postVerifyScan ✓
                        │
                        ▼
mobile.PaymentScreen (NEW)
   POST /api/mobile/payments {writeoffId, amount}
                        │
backend ──► createPaymentOrder ──► getStoreTerminal ──► sqbPrecreate
                                                       │
                                                       ▼
                                    response { sqb_sn, qr_code }
                                                       │
mobile shows QR + polls /api/mobile/payments/[id]      │
                                                       ▼
Customer pays via WeChat/Alipay → SQB備付金到账
                                                       │
                                                       ▼
SQB POSTs /api/payments/notify (Phase 8.6)
   - verifyWebhookSignature
   - markPaymentOrderPaid
   - listSplitRulesForContext → recordPaymentSplit × N
   - publishEvent('payment.success')  → SSE/Push to store + branch
                                                       │
                                                       ▼
mobile PaymentScreen receives realtime event → shows "支付完成 · 分账明细"
```

## Phase 8.6 — Split Execution

Two delivery modes (configurable per rule):
1. **Pre-payment split** (recommended): pass `split_info` to precreate; SQB
   does the split atomically when payment lands.
2. **Post-payment split**: call `splitOrder()` from the webhook handler.
   Needed when split amount depends on info not known at precreate time
   (e.g., dynamic discounts).

Failure handling:
- `payment_splits.status='失败'` → background retry every 5 min, up to 5×
- After 5 failures, page on-call + raise admin notification

## Phase 8.7 — Refund

```
mobile.OrderDetail → 退款按钮
   POST /api/mobile/payments/[id]/refund {amount, reason}
   ↓
backend:
   - refundOrder(sn, refundRequestNo=`${client_sn}-R${seq}`, amount)
   - markPaymentOrderRefunded(id, amount)
   - For each related payment_splits row → SQB does the reverse split
     automatically when refund covers the entire order; for partial
     refunds we need explicit `split_info` on the refund request
   - writeoff_records.status = '已撤销' (transactional)
   - company_inventory restore
   - publishEvent('payment.refunded')
```

## Phase 8.8 — Daily Reconciliation

Cron at 23:30 daily:
1. SQB CSV/JSON 对账单 fetch (or manual upload form)
2. Compare against payment_orders where `paid_at::date = yesterday`
3. Diff report → admin notification
4. Status drift (e.g., `已支付` in our DB but `已退款` in SQB) → auto-correct + alert

## Security Notes

- 验签 — MD5(rawBody + terminalKey). Use `timingSafeEqual` (already in client.ts)
- 防重放 — index on `payment_webhooks.sqb_sn`; reject duplicates inside the same minute
- 加密 — `id_card_no_encrypted` / `account_no_encrypted` must use a server-side AES key (not the SQB key). Decision: use Node's built-in `crypto.createCipheriv('aes-256-gcm', ...)` with `AES_DATA_KEY` env
- 日志脱敏 — never log `payer_uid` raw; mask middle 6 digits when surfaced in UI/logs
- 最小权限 — Bearer JWT only; webhooks have no JWT but have signature

## Locked-in Decisions (2026-05-01)

All 6 open questions resolved to **recommended** option:

1. ✅ **Payment timing** = A — after writeoff, immediate QR payment
2. ✅ **Account structure** = A — HQ master merchant + sub-merchant per store, splits land in sub-merchant accounts
3. ✅ **Split dimensions** = 4-way:
   - HQ tech fee: 5% (configurable global rule)
   - Branch margin: per-SKU / per-company configurable
   - Store revenue: residual (priority lowest)
   - Sales-staff commission: 10% of store revenue, but → **option B** (goes to store account, internal accounting only)
4. ✅ **Sales-staff commission** = B — money stays in store sub-merchant, "points" UI is just an internal counter
5. ✅ **Refund scope** = A — full refund + auto-cancel writeoff + restore company_inventory in single transaction
6. ✅ **v1 surface** = A — in-store QR only (mobile shows the QR, customer scans with WeChat/Alipay)

Default rules seeded in `seedDefaultSplitRules()` on first `ensurePaymentTables()` call:

| Priority | Scope | Recipient | Rate type | Value | Meaning |
|---|---|---|---|---|---|
| 10 | global | hq | percent | 0.05 | 5% to HQ |
| 50 | company | company | percent | 0.15 | 15% branch margin |
| 100 | store | store | residual (%) | rest | rest to store |
| 200 | store | sales_staff | percent of store | 0.10 | "internal" — accounting only |

Per-SKU overrides can be inserted later via `payment_split_rules.scope='sku'`.

## Out of Scope (next stage)

- Multi-pay-method routing (route preference: WeChat first, fall back Alipay)
- Coupon / 立减金 integration via SQB marketing
- Refund approval workflow (currently auto-approved by store_manager)
- Cross-store reciprocal split (transfer funds between stores)
- Tax invoice issuance (发票)
