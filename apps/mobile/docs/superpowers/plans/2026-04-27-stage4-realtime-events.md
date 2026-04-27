# Stage-4: Realtime + Business Event Hooks

> Sub-skill: superpowers:executing-plans

**Goal:** Real-time refresh on mobile via SSE backed by Redis Pub/Sub; hook `sendPushToUser` into key business events so the app updates instantly *and* survives backgrounding.

**Architecture:**
- **Why SSE not WebSocket** — Next.js streaming responses ship SSE natively (no separate WS server). React Native gets SSE via the small `react-native-sse` polyfill. One-way (server→client) is enough for "refresh on event"; user actions go through normal POSTs.
- **Why Redis Pub/Sub** — admin already runs Redis, so we get fan-out to multi-instance Next.js for free with no new infra.
- **Why both SSE *and* push** — SSE only works while the app is foregrounded; push (Expo) covers backgrounded/killed states. Same event triggers both.

**Topology:**
```
business-event ─┬─► Redis PUBLISH miliguan:events
                │
                └─► sendPushToUser (Expo Push API)
                          │
                          ▼
                       Mobile (notification tray, even when killed)

Mobile foreground:  GET /api/mobile/events  ──SSE──►  Mobile realtime client
                            │                              │
                            │ Redis SUBSCRIBE              │
                            ▼                              ▼
                     filtered to user's scope    on(event, cb) listeners
                                                  → reload KPI / show toast
```

---

## Phase 13: Event bus + SSE endpoint

**Files:**
- Create: `apps/admin/src/lib/event-bus.ts`
- Create: `apps/admin/src/app/api/mobile/events/route.ts`

Bus interface:
```ts
type ScopedEvent = {
  type: string;            // 'writeoff.created' | 'purchase.approved' | 'inventory.warning' | …
  scope?: { userId?, companyId?, storeId?, role? };
  data: Record<string, unknown>;
  ts: number;
};
publishEvent(event): Promise<void>
subscribeEvents(filter, handler): Promise<() => Promise<void>>
```

Filter logic: emit if event.scope is empty OR matches the subscriber's filter.

SSE endpoint emits `event: <type>\ndata: <json>\n\n`, sends `:keepalive\n\n` every 25s, unsubscribes on connection close.

## Phase 14: Mobile realtime client

**Files:**
- Modify: `apps/mobile/package.json` — add `react-native-sse`
- Create: `apps/mobile/src/services/realtime.ts`
- Modify: `apps/mobile/App.tsx` — start/stop realtime in step with auth

API:
```ts
startRealtime(): void;        // opens SSE, auto-reconnects with backoff
stopRealtime(): void;
on(type, cb): () => void;     // subscribe; returns unsub
```

## Phase 15: Hook business events

### 15a · writeoff.created
Inside `createMobileWriteoff` (already in `database.js`):
- on success → `publishEvent({type:'writeoff.created', scope:{companyId,storeId}, data:{...}})`
- check inventory threshold of the SKU; if low → `publishEvent({type:'inventory.warning'})` + push to store/branch staff

### 15b · purchase.approved
- New helper `lib/events.ts` exporting `notifyPurchaseApproved(orderId, actor)` — wraps publish + push lookup of the order's owning company manager
- Hook into `apps/admin/src/app/api/admin/purchase-orders/[id]/approve/route.ts` after the success branch (additive call, no contract change)

### 15c · purchase.received / refund (same pattern)
- Hook receive + refund routes additively

## Phase 16: Mobile screens subscribe

- `BossHomeScreen` + `BranchGMHomeScreen` — `on('writeoff.created' | 'purchase.approved')` → call `fetchKpi()`/`fetchBranches()` again
- `BranchGMOrdersScreen` — `on('purchase.*')` → reload orders
- `StoreManagerHomeScreen` + `ScanScreen` — `on('inventory.warning')` → toast banner

---

## Out of Scope

- WebSocket bidirectional (chat/typing indicators)
- Offline-aware event replay (keep last-N events server-side)
- E2E test for SSE flow (covered manually)
