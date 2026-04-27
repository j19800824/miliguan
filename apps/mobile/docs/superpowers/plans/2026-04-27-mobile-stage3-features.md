# Mobile Stage-3: Real Features Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Replace remaining stubs and add the 6 production features that move mobile from "wired" to "useful": real writeoff scan, real KPI aggregation, push, offline cache, image upload, real-backend E2E.

**Tech additions:**
- `expo-notifications` (push)
- `@react-native-async-storage/async-storage` (offline cache)
- `expo-image-picker` (photo upload)

---

## Phase 7: Real writeoff on scan

**Backend (`apps/admin`):**
- Extend `database.js` with `createMobileWriteoff(barcode, user)`:
  1. Resolve `barcode` → `product_skus.sku_code` → SKU id
  2. Find an open member_order in user's store with this SKU still un-writtenoff (`member_order_items.writeoff_status='待核销'`)
  3. Insert `writeoff_records` (member_order_id, sku_id, store_id, sales_staff_name, product_code, status='成功', time=now, remark)
  4. Update `member_order_items.writeoff_status='已核销'`
  5. Return `{ name, sku_code, points }`
- Replace `/api/mobile/verify/scan` stub with real call.

## Phase 8: Accurate KPI aggregation

**Backend:** add `getMobileKpiOverview(user)` to `database.js`:
- `totalSales` = SUM(member_orders.total_amount) WHERE company_id scope, last 30 days
- `totalVerify` = COUNT(writeoff_records.status='成功') in scope, last 30 days
- `totalPoints` = SUM(point_redeem_orders.points)
- `totalInventory` = SUM(company_inventory.quantity)
- `salesGrowth`/`verifyGrowth` = compare with previous 30 days, formatted `+12.4%`
- Replace `/api/mobile/kpi/overview` body to call this helper.

## Phase 9: Push notifications

**Backend:**
- New table `mobile_push_tokens (id, user_id, token, platform, created_at, updated_at)` in `initializeDatabase`
- `POST /api/mobile/push/register` — saves token for current user
- `POST /api/mobile/push/unregister` — removes token
- New helper `sendPushToUser(userId, title, body, data?)` — POSTs to `https://exp.host/--/api/v2/push/send`
- (Optional) hook into createWriteoffRecord to ping store manager on success

**Mobile:**
- `expo-notifications` install
- `services/push.ts` — `registerPushToken()` (request permissions, get Expo push token, POST to backend)
- Call in App.tsx after login, deregister on logout

## Phase 10: Offline cache + retry queue

**Mobile:**
- `@react-native-async-storage/async-storage` install
- `services/api/cache.ts` — `withCache(key, ttlMs, fetcher)` returns cached value on network failure
- Wrap each GET service to use cache (1-min TTL while online, stale-while-offline)
- `services/api/queue.ts` — write-queue stored in AsyncStorage. `enqueue(req)` for non-GETs when offline; replay on `NetInfo.isConnected=true`
- Network listener in App.tsx triggers replay

## Phase 11: Avatar / file upload via OSS

**Backend:**
- `POST /api/mobile/upload/sign` — returns OSS signed PUT URL + final asset URL
- `PUT /api/mobile/me/avatar` — saves avatar URL to admin_staff.avatar_url

**Mobile:**
- `expo-image-picker` install
- `services/upload.ts` — picks image, gets signed URL, uploads, returns final URL
- ProfileScreen — tap avatar to change; calls `updateAvatar(url)`

## Phase 12: Maestro real-backend E2E

- Add `.maestro/flows/real-login.yaml` — credentials sign-in flow
- Add `scripts/e2e-setup.sh` — boots admin in test mode, waits for /api/health, seeds known credentials, runs maestro flows, tears down
- Document `EXPO_PUBLIC_API_BASE_URL` + Expo Go dev build instructions

---

## Out of Scope (Stage 4)

- Realtime via WebSocket / SSE
- Background sync (BackgroundFetch task)
- Biometric login (Face ID / fingerprint)
- Crash reporting (Sentry)
