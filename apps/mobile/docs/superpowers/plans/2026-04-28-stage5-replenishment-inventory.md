# Stage-5: Two-tier Replenishment & Store Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add store-level inventory + a two-tier replenishment workflow so store managers request stock from their branch, and branch managers request stock from HQ — all from the mobile app, with SSE/push notifications and proper inventory accounting.

**Architecture:**
- Reuse `purchase_orders` (`store_id IS NULL` = branch→HQ; `store_id IS NOT NULL` = store→branch). One pipeline, one approval state machine.
- Add `store_inventory` table for per-store on-hand counts. Extend `inventory_logs.store_id` so the same audit trail covers both tiers.
- Mobile: insert a `Inventory` tab between `Home` and `Scan`/`Orders` for both `store_manager` and `branch_gm`. Single `InventoryScreen` component with role-aware blocks (own stock / request to upstream / pending requests from downstream).
- Approval routes: `branch_gm` approves store→branch in mobile; HQ continues to approve branch→HQ via the existing admin web (already wired in Stage 4).

**Tech Stack:** Postgres + Redis + Next.js (admin) + RN/Expo (mobile). No new deps.

---

## File Structure

**Backend (admin), all touch `apps/admin/`:**
- `src/lib/database.js` — append `ensureStoreInventoryTables`, `getStoreInventory`, `createReplenishment`, `approveReplenishment`, `listReplenishments`, `listPendingForBranch`, helpers + lazy DDL for `store_inventory` + `ALTER inventory_logs ADD COLUMN IF NOT EXISTS store_id`.
- `src/lib/events.ts` — extend with `notifyReplenishmentSubmitted`, `notifyReplenishmentApproved`, `notifyStockTransferred`.
- `src/app/api/mobile/replenishments/route.ts` — POST create + GET list (own).
- `src/app/api/mobile/replenishments/[id]/route.ts` — GET single, DELETE cancel.
- `src/app/api/mobile/replenishments/[id]/approve/route.ts` — PUT approve/reject (branch_gm scope).
- `src/app/api/mobile/replenishments/pending/route.ts` — GET pending requests for branch_gm.
- `src/app/api/mobile/inventory/store/route.ts` — GET store-level inventory (current store only).

**Frontend (mobile), `apps/mobile/src/`:**
- `services/api/replenishments.ts` — `fetchReplenishments`, `createReplenishment`, `approveReplenishment`, `fetchPendingReplenishments`, `cancelReplenishment`.
- `services/api/inventory.ts` (modify) — add `fetchStoreInventory`.
- `screens/shared/InventoryScreen.tsx` — role-aware screen, used by both `store_manager` and `branch_gm`.
- `components/ReplenishmentModal.tsx` — create-replenishment modal (SKU multi-select + qty).
- `components/PendingReplenishmentsList.tsx` — branch_gm view of pending store requests with approve/reject swipe.
- `navigation/StoreManagerNavigator.tsx` (modify) — insert `Inventory` between `Home` and `Scan`.
- `navigation/BranchGMNavigator.tsx` (modify) — insert `Inventory` between `Home` and `Orders`.
- `services/api/index.ts` (modify) — `export * from './replenishments'`.

---

## Task 1: DB schema — store_inventory + inventory_logs.store_id

**Files:**
- Modify: `apps/admin/src/lib/database.js` — append helpers near other Stage-3 mobile extras.

- [ ] **Step 1: Add `ensureStoreInventoryTables`**

Append below the existing `ensureMobileExtras` function:

```js
let storeInventoryReady = false;

export async function ensureStoreInventoryTables() {
  if (storeInventoryReady) return;
  await initializeDatabase();
  await query(`
    CREATE TABLE IF NOT EXISTS store_inventory (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES company_stores(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      safety_stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (store_id, sku_id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON store_inventory(store_id);`);
  await query(`ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL;`);
  storeInventoryReady = true;
}
```

- [ ] **Step 2: Smoke test the DDL by hitting any endpoint that lazily calls it (we'll do this in Task 3); for now just verify file compiles**

Run: `cd apps/admin && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/database.js
git commit -m "feat(stage5): add store_inventory table + extend inventory_logs.store_id

Lazy DDL via ensureStoreInventoryTables(). UNIQUE(store_id, sku_id)
prevents duplicate rows; inventory_logs.store_id is nullable so existing
company-level rows stay valid."
```

---

## Task 2: DB helpers — list + create + approve replenishments

**Files:**
- Modify: `apps/admin/src/lib/database.js`

- [ ] **Step 1: Add `getStoreInventory(storeId)` returning current stock with SKU info**

Append:

```js
export async function getStoreInventory(storeId) {
  if (!storeId) return [];
  await ensureStoreInventoryTables();
  const rows = (
    await query(
      `
        SELECT si.id, si.sku_id, si.quantity, si.safety_stock,
               ps.sku_code, ps.barcode, ps.image_url,
               p.name AS product_name, ps.spec, ps.unit
        FROM store_inventory si
        INNER JOIN product_skus ps ON ps.id = si.sku_id
        INNER JOIN products p ON p.id = ps.product_id
        WHERE si.store_id = $1
        ORDER BY (si.quantity <= si.safety_stock) DESC, p.name
      `,
      [Number(storeId)]
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    skuId: String(r.sku_id),
    skuCode: r.sku_code,
    barcode: r.barcode,
    imageUrl: r.image_url,
    productName: r.product_name,
    spec: r.spec,
    unit: r.unit,
    quantity: Number(r.quantity ?? 0),
    safetyStock: Number(r.safety_stock ?? 0),
    warn: Number(r.quantity ?? 0) <= Number(r.safety_stock ?? 0),
  }));
}
```

- [ ] **Step 2: Add `createReplenishment(user, items, remark)` returning the new PO id + order_no**

Append:

```js
export async function createReplenishment(user, items, remark = '') {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('请至少选择一个商品');
  }
  if (!user?.companyId) {
    throw new Error('当前账号未绑定分公司');
  }
  await ensureStoreInventoryTables();
  const isStoreLevel = Boolean(user.storeId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve SKU prices to populate purchase_order_items.
    const skuRows = (
      await client.query(
        `SELECT id, order_quota_price FROM product_skus WHERE id = ANY($1::int[])`,
        [items.map((it) => Number(it.sku_id))]
      )
    ).rows;
    const priceBySku = new Map(
      skuRows.map((r) => [String(r.id), Number(r.order_quota_price ?? 0)])
    );

    const total = items.reduce((sum, it) => {
      const price = priceBySku.get(String(it.sku_id)) ?? 0;
      return sum + price * Number(it.quantity || 0);
    }, 0);

    const orderNo = await generatePurchaseOrderNo(
      client,
      String(user.companyId)
    );
    const ts = now();
    const orderResult = await client.query(
      `
        INSERT INTO purchase_orders
          (order_no, company_id, status, order_quota_total, store_id,
           remark, abnormal_flag, approval_status,
           order_quota_deducted, stock_received, updated_by, created_at, updated_at)
        VALUES ($1, $2, '待审核', $3, $4, $5, FALSE, '待审核', FALSE, FALSE, $6, $7, $7)
        RETURNING id
      `,
      [
        orderNo,
        Number(user.companyId),
        total,
        isStoreLevel ? Number(user.storeId) : null,
        String(remark ?? ''),
        user.fullName ?? user.account ?? '移动端用户',
        ts,
      ]
    );
    const orderId = orderResult.rows[0].id;

    for (const it of items) {
      const skuId = Number(it.sku_id);
      const qty = Number(it.quantity);
      const price = priceBySku.get(String(skuId)) ?? 0;
      await client.query(
        `
          INSERT INTO purchase_order_items
            (purchase_order_id, sku_id, quantity, order_quota_unit_price, subtotal_order_quota)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [orderId, skuId, qty, price, price * qty]
      );
    }

    await client.query('COMMIT');
    return { id: String(orderId), orderNo, isStoreLevel };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 3: Add `approveReplenishment(orderId, decision, actor)` — only handles store→branch (PO with non-null store_id)**

Append:

```js
export async function approveReplenishment(orderId, decision, actor) {
  await ensureStoreInventoryTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = (
      await client.query(
        `SELECT id, order_no, company_id, store_id, status
         FROM purchase_orders WHERE id = $1 FOR UPDATE`,
        [Number(orderId)]
      )
    ).rows[0];

    if (!order) throw new Error('补货请求不存在');
    if (!order.store_id) throw new Error('该订单不是门店补货请求');
    if (order.status !== '待审核') {
      throw new Error(`订单状态为 ${order.status}，不能审核`);
    }

    if (decision === '驳回') {
      await client.query(
        `UPDATE purchase_orders SET status = '已驳回', approval_status = '已驳回', updated_by = $2, updated_at = NOW() WHERE id = $1`,
        [order.id, actor ?? '后台用户']
      );
      await client.query('COMMIT');
      return { id: String(order.id), orderNo: order.order_no, status: '已驳回' };
    }

    // Approve: transfer stock from company_inventory to store_inventory.
    const items = (
      await client.query(
        `SELECT sku_id, quantity FROM purchase_order_items WHERE purchase_order_id = $1`,
        [order.id]
      )
    ).rows;

    for (const it of items) {
      const skuId = Number(it.sku_id);
      const qty = Number(it.quantity);

      // Lock company stock row.
      const ci = (
        await client.query(
          `SELECT id, quantity FROM company_inventory
           WHERE company_id = $1 AND sku_id = $2 AND delete_status = '正常'
           FOR UPDATE`,
          [order.company_id, skuId]
        )
      ).rows[0];
      if (!ci || Number(ci.quantity) < qty) {
        throw new Error(`SKU ${skuId} 分公司库存不足`);
      }
      const newCompanyQty = Number(ci.quantity) - qty;
      await client.query(
        `UPDATE company_inventory SET quantity = $1, updated_by = $3, updated_at = NOW() WHERE id = $2`,
        [newCompanyQty, ci.id, actor ?? '后台用户']
      );
      await client.query(
        `INSERT INTO inventory_logs (company_id, sku_id, source_type, source_id, change_type, quantity, balance_after, remark, created_at, store_id)
         VALUES ($1, $2, 'replenishment', $3, '调出', $4, $5, '调拨给门店', NOW(), NULL)`,
        [order.company_id, skuId, String(order.id), -qty, newCompanyQty]
      );

      // Upsert store stock.
      const ts = now();
      const existing = (
        await client.query(
          `SELECT id, quantity FROM store_inventory WHERE store_id = $1 AND sku_id = $2 FOR UPDATE`,
          [order.store_id, skuId]
        )
      ).rows[0];
      let newStoreQty;
      if (existing) {
        newStoreQty = Number(existing.quantity) + qty;
        await client.query(
          `UPDATE store_inventory SET quantity = $1, updated_at = $3 WHERE id = $2`,
          [newStoreQty, existing.id, ts]
        );
      } else {
        newStoreQty = qty;
        await client.query(
          `INSERT INTO store_inventory (company_id, store_id, sku_id, quantity, safety_stock, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 0, $5, $5)`,
          [order.company_id, order.store_id, skuId, qty, ts]
        );
      }
      await client.query(
        `INSERT INTO inventory_logs (company_id, sku_id, source_type, source_id, change_type, quantity, balance_after, remark, created_at, store_id)
         VALUES ($1, $2, 'replenishment', $3, '调入', $4, $5, '门店补货入库', NOW(), $6)`,
        [order.company_id, skuId, String(order.id), qty, newStoreQty, order.store_id]
      );
    }

    await client.query(
      `UPDATE purchase_orders
         SET status = '已入库', approval_status = '已通过',
             order_quota_deducted = TRUE, stock_received = TRUE,
             updated_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [order.id, actor ?? '后台用户']
    );
    await client.query('COMMIT');
    return { id: String(order.id), orderNo: order.order_no, status: '已入库' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Add list helpers**

Append:

```js
export async function listReplenishmentsForUser(user) {
  await ensureStoreInventoryTables();
  if (!user?.companyId) return [];
  const params = [Number(user.companyId)];
  let scope = 'po.company_id = $1';
  if (user.storeId) {
    params.push(Number(user.storeId));
    scope += ' AND po.store_id = $2';
  } else {
    scope += ' AND po.store_id IS NULL';
  }
  const rows = (
    await query(
      `
        SELECT po.id, po.order_no, po.status, po.created_at, po.order_quota_total,
               COALESCE(SUM(poi.quantity), 0)::int AS total_qty
        FROM purchase_orders po
        LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.delete_status = '正常' AND ${scope}
        GROUP BY po.id
        ORDER BY po.created_at DESC
        LIMIT 100
      `,
      params
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    orderNo: r.order_no,
    status: r.status,
    totalAmount: Number(r.order_quota_total ?? 0),
    totalQty: Number(r.total_qty ?? 0),
    createdAt: r.created_at,
  }));
}

export async function listPendingReplenishmentsForBranch(user) {
  await ensureStoreInventoryTables();
  if (!user?.companyId) return [];
  const rows = (
    await query(
      `
        SELECT po.id, po.order_no, po.status, po.created_at, po.store_id,
               cs.name AS store_name,
               COALESCE(SUM(poi.quantity), 0)::int AS total_qty,
               po.order_quota_total
        FROM purchase_orders po
        LEFT JOIN company_stores cs ON cs.id = po.store_id
        LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.company_id = $1
          AND po.store_id IS NOT NULL
          AND po.status = '待审核'
          AND po.delete_status = '正常'
        GROUP BY po.id, cs.name
        ORDER BY po.created_at ASC
      `,
      [Number(user.companyId)]
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    orderNo: r.order_no,
    storeId: String(r.store_id),
    storeName: r.store_name,
    totalQty: Number(r.total_qty ?? 0),
    totalAmount: Number(r.order_quota_total ?? 0),
    createdAt: r.created_at,
  }));
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/database.js
git commit -m "feat(stage5): replenishment DB helpers (create/approve/list)"
```

---

## Task 3: Mobile API routes — create/list/approve replenishments + store inventory

**Files:**
- Create: `apps/admin/src/app/api/mobile/replenishments/route.ts`
- Create: `apps/admin/src/app/api/mobile/replenishments/[id]/approve/route.ts`
- Create: `apps/admin/src/app/api/mobile/replenishments/pending/route.ts`
- Create: `apps/admin/src/app/api/mobile/inventory/store/route.ts`

- [ ] **Step 1: POST + GET `/api/mobile/replenishments`**

Create `apps/admin/src/app/api/mobile/replenishments/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import {
  createReplenishment,
  listReplenishmentsForUser,
} from '@/lib/database.js';
import { notifyReplenishmentSubmitted } from '@/lib/events';

interface CreateBody {
  items?: Array<{ sku_id: string | number; quantity: number }>;
  remark?: string;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const list = await listReplenishmentsForUser(user);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const body = (await req.json()) as CreateBody;
    const items = (body.items ?? [])
      .map((it) => ({ sku_id: it.sku_id, quantity: Number(it.quantity) }))
      .filter((it) => it.sku_id && it.quantity > 0);
    if (items.length === 0) {
      return NextResponse.json(
        { message: '请至少选择一个商品' },
        { status: 400 },
      );
    }
    const result = await createReplenishment(user, items, body.remark ?? '');
    void notifyReplenishmentSubmitted({
      orderNo: result.orderNo,
      companyId: user.companyId,
      storeId: user.storeId,
      isStoreLevel: result.isStoreLevel,
      submitter: user.fullName ?? user.account,
    });
    return NextResponse.json({ ok: true, id: result.id, orderNo: result.orderNo });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '提交失败' },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 2: PUT `/api/mobile/replenishments/[id]/approve`**

Create the file:

```ts
import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { approveReplenishment } from '@/lib/database.js';
import { notifyReplenishmentApproved } from '@/lib/events';

interface ApproveBody {
  decision?: '通过' | '驳回';
  remark?: string;
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.companyId) {
    return NextResponse.json(
      { message: '当前账号未绑定分公司，无法审核' },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as ApproveBody;
    const decision = body.decision === '驳回' ? '驳回' : '通过';
    const result = await approveReplenishment(
      id,
      decision,
      user.fullName ?? user.account ?? '审核人',
    );
    void notifyReplenishmentApproved({
      orderNo: result.orderNo,
      companyId: user.companyId,
      decision,
      reviewer: user.fullName ?? user.account,
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '审核失败' },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 3: GET `/api/mobile/replenishments/pending`**

Create the file:

```ts
import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listPendingReplenishmentsForBranch } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.companyId || user.storeId) {
    // Only branch-level users see pending store requests.
    return NextResponse.json([]);
  }
  try {
    const list = await listPendingReplenishmentsForBranch(user);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: GET `/api/mobile/inventory/store`**

Create the file:

```ts
import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getStoreInventory } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.storeId) return NextResponse.json([]);
  try {
    const list = await getStoreInventory(user.storeId);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Add notify helpers in events.ts**

Modify `apps/admin/src/lib/events.ts` — append:

```ts
export async function notifyReplenishmentSubmitted(p: {
  orderNo: string;
  companyId?: string;
  storeId?: string;
  isStoreLevel: boolean;
  submitter?: string;
}) {
  // Store-level requests need branch attention; branch-level go to HQ web.
  await publishEvent({
    type: 'replenishment.submitted',
    scope: { companyId: p.companyId },
    data: {
      orderNo: p.orderNo,
      storeId: p.storeId,
      isStoreLevel: p.isStoreLevel,
      submitter: p.submitter,
    },
  });
  if (p.isStoreLevel && p.companyId) {
    const staff = await listStaffIdsByCompany(p.companyId);
    await Promise.all(
      staff
        .filter((s) => !s.account?.startsWith(p.storeId ?? ''))
        .map((s) =>
          sendPushToUser(s.id, {
            title: '门店补货申请',
            body: `订单 ${p.orderNo} 待审核`,
            data: { type: 'replenishment.submitted', orderNo: p.orderNo },
          }),
        ),
    );
  }
}

export async function notifyReplenishmentApproved(p: {
  orderNo: string;
  companyId?: string;
  decision: '通过' | '驳回';
  reviewer?: string;
}) {
  await publishEvent({
    type: 'replenishment.approved',
    scope: { companyId: p.companyId },
    data: { orderNo: p.orderNo, decision: p.decision, reviewer: p.reviewer },
  });
  // Push to all staff in company; mobile clients filter by storeId via scope.
  if (p.companyId) {
    const staff = await listStaffIdsByCompany(p.companyId);
    await Promise.all(
      staff.map((s) =>
        sendPushToUser(s.id, {
          title: `补货${p.decision}`,
          body: `订单 ${p.orderNo} ${p.decision}`,
          data: { type: 'replenishment.approved', orderNo: p.orderNo },
        }),
      ),
    );
  }
}
```

(`listStaffIdsByCompany` and `sendPushToUser` already exist; just import them at the top if not already.)

- [ ] **Step 6: Verify**

Run: `cd apps/admin && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/api/mobile/replenishments apps/admin/src/app/api/mobile/inventory/store apps/admin/src/lib/events.ts
git commit -m "feat(stage5): mobile replenishment + store-inventory routes"
```

---

## Task 4: Mobile services — replenishments + store inventory

**Files:**
- Create: `apps/mobile/src/services/api/replenishments.ts`
- Modify: `apps/mobile/src/services/api/inventory.ts`
- Modify: `apps/mobile/src/services/api/index.ts`

- [ ] **Step 1: Create `replenishments.ts`**

```ts
import { getApiClient, shouldUseMocks } from './client';

export interface ReplenishmentRow {
  id: string;
  orderNo: string;
  status: string;
  totalAmount: number;
  totalQty: number;
  createdAt: string;
}

export interface PendingReplenishment {
  id: string;
  orderNo: string;
  storeId: string;
  storeName: string;
  totalQty: number;
  totalAmount: number;
  createdAt: string;
}

export interface CreateReplenishmentItem {
  sku_id: string | number;
  quantity: number;
}

export async function fetchReplenishments(): Promise<ReplenishmentRow[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<ReplenishmentRow[]>('/api/mobile/replenishments');
}

export async function fetchPendingReplenishments(): Promise<PendingReplenishment[]> {
  if (shouldUseMocks()) return [];
  return getApiClient()<PendingReplenishment[]>(
    '/api/mobile/replenishments/pending',
  );
}

export async function createReplenishment(
  items: CreateReplenishmentItem[],
  remark = '',
): Promise<{ ok: boolean; id: string; orderNo: string }> {
  if (shouldUseMocks()) {
    return { ok: true, id: 'mock', orderNo: `MOCK-${Date.now()}` };
  }
  return getApiClient()<{ ok: boolean; id: string; orderNo: string }>(
    '/api/mobile/replenishments',
    { method: 'POST', body: JSON.stringify({ items, remark }) },
  );
}

export async function approveReplenishment(
  id: string,
  decision: '通过' | '驳回',
): Promise<{ ok: boolean; status: string }> {
  if (shouldUseMocks()) return { ok: true, status: '已入库' };
  return getApiClient()<{ ok: boolean; status: string }>(
    `/api/mobile/replenishments/${id}/approve`,
    { method: 'PUT', body: JSON.stringify({ decision }) },
  );
}
```

- [ ] **Step 2: Add `fetchStoreInventory` to inventory.ts**

Append to `apps/mobile/src/services/api/inventory.ts`:

```ts
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
```

- [ ] **Step 3: Re-export from barrel**

Modify `apps/mobile/src/services/api/index.ts` — append:

```ts
export * from './replenishments';
```

- [ ] **Step 4: Verify**

Run: `cd apps/mobile && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/api
git commit -m "feat(stage5): mobile services for replenishment + store inventory"
```

---

## Task 5: InventoryScreen (role-aware)

**Files:**
- Create: `apps/mobile/src/screens/shared/InventoryScreen.tsx`

- [ ] **Step 1: Write the screen**

Create the file:

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Radius, Shadow, Spacing, numericFont } from '../../constants/theme';
import { Package, AlertDot, Plus } from '../../components/Icons';
import {
  fetchStoreInventory,
  fetchInventory,
  fetchReplenishments,
  fetchPendingReplenishments,
  approveReplenishment,
  type StoreInventoryItem,
  type InventoryItem,
  type ReplenishmentRow,
  type PendingReplenishment,
} from '../../services/api';
import { onRealtime } from '../../services/realtime';
import { ReplenishmentModal } from '../../components/ReplenishmentModal';
import type { MockUser } from '../../data/mock';

interface Props {
  user: MockUser & { storeId?: string; companyId?: string };
}

export function InventoryScreen({ user }: Props) {
  const insets = useSafeAreaInsets();
  const isStore = Boolean(user.storeId);

  const [storeInv, setStoreInv] = useState<StoreInventoryItem[]>([]);
  const [companyInv, setCompanyInv] = useState<InventoryItem[]>([]);
  const [myReplenishments, setMyReplenishments] = useState<ReplenishmentRow[]>([]);
  const [pendingFromStores, setPendingFromStores] = useState<PendingReplenishment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    if (isStore) {
      const [inv, my] = await Promise.all([
        fetchStoreInventory(),
        fetchReplenishments(),
      ]);
      setStoreInv(inv);
      setMyReplenishments(my);
    } else {
      const [inv, my, pending] = await Promise.all([
        fetchInventory(),
        fetchReplenishments(),
        fetchPendingReplenishments(),
      ]);
      setCompanyInv(inv);
      setMyReplenishments(my);
      setPendingFromStores(pending);
    }
  }, [isStore]);

  useEffect(() => {
    reload();
    const unsubs = [
      onRealtime('replenishment.submitted', reload),
      onRealtime('replenishment.approved', reload),
      onRealtime('inventory.warning', reload),
    ];
    return () => unsubs.forEach((u) => u());
  }, [reload]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  };

  const handleApprove = async (item: PendingReplenishment, decision: '通过' | '驳回') => {
    try {
      await approveReplenishment(item.id, decision);
      await reload();
    } catch (e) {
      Alert.alert('审核失败', e instanceof Error ? e.message : '未知错误');
    }
  };

  const lowCount = isStore
    ? storeInv.filter((i) => i.warn).length
    : companyInv.filter((i) => i.warn).length;
  const totalSku = isStore ? storeInv.length : companyInv.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isStore ? '门店库存' : '分公司库存'}</Text>
        <TouchableOpacity
          testID="replenishment-create"
          style={styles.createBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.createBtnText}>
            {isStore ? '向分公司进货' : '向总部进货'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalSku}</Text>
          <Text style={styles.statLabel}>SKU 总数</Text>
        </View>
        <View style={[styles.statCard, lowCount > 0 && styles.statCardWarn]}>
          <Text style={[styles.statValue, lowCount > 0 && { color: Colors.danger }]}>
            {lowCount}
          </Text>
          <Text style={styles.statLabel}>低库存</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{myReplenishments.filter((r) => r.status === '待审核').length}</Text>
          <Text style={styles.statLabel}>待审请求</Text>
        </View>
      </View>

      {!isStore && pendingFromStores.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.sectionTitle}>待审核：门店补货请求</Text>
          {pendingFromStores.map((p) => (
            <View key={p.id} style={styles.pendingCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingStore}>{p.storeName}</Text>
                <Text style={styles.pendingMeta}>
                  {p.orderNo} · {p.totalQty} 件
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionApprove]}
                onPress={() => handleApprove(p, '通过')}
                testID={`approve-${p.id}`}
              >
                <Text style={styles.actionApproveText}>通过</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionReject]}
                onPress={() => handleApprove(p, '驳回')}
                testID={`reject-${p.id}`}
              >
                <Text style={styles.actionRejectText}>驳回</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={
          isStore
            ? storeInv
            : (companyInv as unknown as StoreInventoryItem[])
        }
        keyExtractor={(item) => String(item.id ?? Math.random())}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          // Adapt company-level shape into the same row.
          const row = isStore
            ? item
            : ({
                id: (item as unknown as InventoryItem).sku ?? '',
                productName: (item as unknown as InventoryItem).sku ?? '',
                quantity: (item as unknown as InventoryItem).stock ?? 0,
                warn: (item as unknown as InventoryItem).warn ?? false,
                spec: '',
                unit: '件',
              } as Partial<StoreInventoryItem>);
          const r = row as StoreInventoryItem;
          return (
            <View style={[styles.invRow, r.warn && styles.invRowWarn]}>
              <View style={[styles.invIcon, { backgroundColor: r.warn ? Colors.dangerBg : Colors.surfaceSunken }]}>
                <Package size={18} color={r.warn ? Colors.danger : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.invName}>{r.productName}</Text>
                {r.spec ? <Text style={styles.invSpec}>{r.spec}</Text> : null}
                {r.warn && (
                  <View style={styles.warnTag}>
                    <AlertDot size={10} color={Colors.danger} />
                    <Text style={styles.warnTagText}>低于安全库存</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.invQty, r.warn && styles.invQtyWarn]}>
                {r.quantity} <Text style={styles.invUnit}>{r.unit ?? '件'}</Text>
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>暂无库存数据</Text>}
      />

      <ReplenishmentModal
        visible={showModal}
        targetLabel={isStore ? '分公司' : '总部'}
        onClose={() => setShowModal(false)}
        onSubmitted={async () => { setShowModal(false); await reload(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    ...Shadow.card,
  },
  createBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', ...Shadow.card },
  statCardWarn: { borderColor: Colors.danger, backgroundColor: Colors.dangerBg },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, ...numericFont },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  pendingSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  pendingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.card },
  pendingStore: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  pendingMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  actionBtn: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.md },
  actionApprove: { backgroundColor: Colors.primary },
  actionReject: { backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.danger },
  actionApproveText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  actionRejectText: { color: Colors.danger, fontSize: FontSize.sm, fontWeight: '700' },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  invRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.card },
  invRowWarn: { borderLeftWidth: 3, borderLeftColor: Colors.danger },
  invIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  invName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  invSpec: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  warnTag: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', backgroundColor: Colors.dangerBg, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  warnTagText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '600' },
  invQty: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, ...numericFont },
  invQtyWarn: { color: Colors.danger },
  invUnit: { fontSize: FontSize.xs, fontWeight: '500', color: Colors.textMuted },
  empty: { textAlign: 'center', padding: Spacing.xl, color: Colors.textMuted },
});
```

- [ ] **Step 2: Verify (will fail until Task 6 ships ReplenishmentModal)**

This will not compile yet because of the missing ReplenishmentModal. Move on; we'll typecheck after Task 6.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/shared/InventoryScreen.tsx
git commit -m "feat(stage5): InventoryScreen role-aware (store vs branch)"
```

---

## Task 6: ReplenishmentModal

**Files:**
- Create: `apps/mobile/src/components/ReplenishmentModal.tsx`

- [ ] **Step 1: Write the modal**

Create the file:

```tsx
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, FontSize, Radius, Shadow, Spacing } from '../constants/theme';
import { fetchSkus, type Sku } from '../services/api/skus';
import { createReplenishment } from '../services/api/replenishments';

interface Props {
  visible: boolean;
  targetLabel: string;
  onClose: () => void;
  onSubmitted: () => void;
}

interface CartLine {
  sku: Sku;
  qty: number;
}

export function ReplenishmentModal({ visible, targetLabel, onClose, onSubmitted }: Props) {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchSkus().then(setSkus).catch(() => setSkus([]));
    setCart({});
  }, [visible]);

  const setQty = (sku: Sku, raw: string) => {
    const qty = parseInt(raw, 10);
    setCart((prev) => {
      const next = { ...prev };
      if (!qty || qty <= 0) delete next[sku.id];
      else next[sku.id] = { sku, qty };
      return next;
    });
  };

  const submit = async () => {
    const items = Object.values(cart).map((c) => ({
      sku_id: c.sku.id,
      quantity: c.qty,
    }));
    if (items.length === 0) {
      Alert.alert('请填写数量');
      return;
    }
    setSubmitting(true);
    try {
      await createReplenishment(items);
      Alert.alert('已提交', '等待审核');
      onSubmitted();
    } catch (e) {
      Alert.alert('提交失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  };

  const totalLines = Object.keys(cart).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>向{targetLabel}进货</Text>
          <TouchableOpacity onPress={onClose} hitSlop={20}>
            <Text style={styles.close}>关闭</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={skus}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const line = cart[item.id];
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.skuName}>{item.productName}</Text>
                  <Text style={styles.skuSpec}>{item.spec ?? ''} {item.unit ?? ''}</Text>
                </View>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  placeholder="0"
                  value={line ? String(line.qty) : ''}
                  onChangeText={(t) => setQty(item, t)}
                  maxLength={6}
                  testID={`qty-${item.id}`}
                />
                <Text style={styles.unit}>{item.unit ?? '件'}</Text>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>暂无可订商品</Text>}
        />

        <View style={styles.footer}>
          <Text style={styles.summary}>已选 {totalLines} 个 SKU</Text>
          <TouchableOpacity
            testID="replenishment-submit"
            style={[styles.submitBtn, (submitting || totalLines === 0) && styles.submitBtnDisabled]}
            disabled={submitting || totalLines === 0}
            onPress={submit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{submitting ? '提交中...' : '提交申请'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  close: { fontSize: FontSize.md, color: Colors.textSecondary },
  list: { padding: Spacing.lg, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, gap: Spacing.sm, ...Shadow.card },
  skuName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  skuSpec: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  qtyInput: { width: 70, height: 40, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 8, textAlign: 'center', fontSize: FontSize.md, color: Colors.textPrimary },
  unit: { fontSize: FontSize.xs, color: Colors.textMuted, width: 24 },
  empty: { textAlign: 'center', padding: Spacing.xl, color: Colors.textMuted },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  summary: { fontSize: FontSize.sm, color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: 12, ...Shadow.card },
  submitBtnDisabled: { backgroundColor: Colors.textMuted, shadowOpacity: 0 },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/mobile && pnpm typecheck`
Expected: 0 errors. (May surface property-name mismatches with the Sku type — fix by reading `apps/mobile/src/services/api/skus.ts` and aligning.)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/ReplenishmentModal.tsx
git commit -m "feat(stage5): ReplenishmentModal — pick SKU + qty + submit"
```

---

## Task 7: Insert Inventory tab into navigators

**Files:**
- Modify: `apps/mobile/src/navigation/StoreManagerNavigator.tsx`
- Modify: `apps/mobile/src/navigation/BranchGMNavigator.tsx`

- [ ] **Step 1: StoreManagerNavigator — insert between Home and Scan**

Modify `apps/mobile/src/navigation/StoreManagerNavigator.tsx`:

After the existing `import { ScanScreen }` line, add:
```ts
import { InventoryScreen } from '../screens/shared/InventoryScreen';
import { Package } from '../components/Icons';
```

Inside the `<Tab.Navigator>` block, between the `StoreHome` `<Tab.Screen>` and the `Scan` `<Tab.Screen>`, insert:

```tsx
<Tab.Screen
  name="Inventory"
  options={{
    title: '库存',
    tabBarIcon: ({ color }) => <Package size={24} color={color} />,
    tabBarButtonTestID: 'tab-inventory',
  }}
>
  {() => <InventoryScreen user={user} />}
</Tab.Screen>
```

- [ ] **Step 2: BranchGMNavigator — insert between Home and Orders**

Modify `apps/mobile/src/navigation/BranchGMNavigator.tsx` similarly. Add the imports:

```ts
import { InventoryScreen } from '../screens/shared/InventoryScreen';
import { Package } from '../components/Icons';
```

Insert between `BranchHome` and `Orders`:

```tsx
<Tab.Screen
  name="Inventory"
  options={{
    title: '库存',
    tabBarIcon: ({ color }) => <Package size={24} color={color} />,
    tabBarButtonTestID: 'tab-inventory',
  }}
>
  {() => <InventoryScreen user={user} />}
</Tab.Screen>
```

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/mobile && pnpm typecheck && pnpm test`
Expected: 0 typecheck errors, 6/6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/navigation
git commit -m "feat(stage5): inventory tab in store + branch navigators"
```

---

## Task 8: Hook events: subscribe BossHome / BranchHome / StoreHome to replenishment.*

**Files:**
- Modify: `apps/mobile/src/screens/boss/BossHomeScreen.tsx`
- Modify: `apps/mobile/src/screens/branch-gm/BranchGMHomeScreen.tsx`
- Modify: `apps/mobile/src/screens/store-manager/StoreManagerHomeScreen.tsx`

- [ ] **Step 1: Boss + Branch subscribe `replenishment.approved`**

Find the `useEffect` block in each `*HomeScreen.tsx` that already subscribes to events. Add `onRealtime('replenishment.approved', reload)` and `onRealtime('replenishment.submitted', reload)` to the `unsubs` array.

For BossHomeScreen the existing block is:
```ts
const unsubs = [
  onRealtime('writeoff.created', reload),
  onRealtime('purchase.approved', reload),
  onRealtime('purchase.received', reload),
];
```

Add two lines:
```ts
const unsubs = [
  onRealtime('writeoff.created', reload),
  onRealtime('purchase.approved', reload),
  onRealtime('purchase.received', reload),
  onRealtime('replenishment.submitted', reload),
  onRealtime('replenishment.approved', reload),
];
```

For BranchGMHomeScreen the existing block:
```ts
const unsubs = [
  onRealtime('writeoff.created', reload),
  onRealtime('purchase.received', reload),
  onRealtime('inventory.warning', reload),
];
```

Add:
```ts
const unsubs = [
  onRealtime('writeoff.created', reload),
  onRealtime('purchase.received', reload),
  onRealtime('inventory.warning', reload),
  onRealtime('replenishment.submitted', reload),
  onRealtime('replenishment.approved', reload),
];
```

For StoreManagerHomeScreen — the current effect only calls `fetchVerifyRecords`. Add a refresh on replenishment approval too (since stock arriving affects "today" stats indirectly):

Find:
```ts
const unsub = onRealtime('writeoff.created', reload);
```

Replace with:
```ts
const unsubs = [
  onRealtime('writeoff.created', reload),
  onRealtime('replenishment.approved', reload),
];
```

And update the cleanup:
```ts
return () => {
  active = false;
  unsubs.forEach((u) => u());
};
```

- [ ] **Step 2: Typecheck + tests**

Run: `cd apps/mobile && pnpm typecheck && pnpm test`
Expected: 0 typecheck errors, 6/6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens
git commit -m "feat(stage5): wire home screens to replenishment.* realtime events"
```

---

## Task 9: End-to-end smoke

**Files:** none.

- [ ] **Step 1: Restart Metro with --clear**

```bash
cd apps/mobile && pnpm dev --clear
```

- [ ] **Step 2: Manual store-manager flow (qrm / 13601667307 / 123456)**

1. Login on Expo Go
2. Tap `库存` tab — should show empty list initially
3. Tap `向分公司进货` — modal opens with SKU list
4. Pick 1-2 SKUs, type qty (e.g., 10), submit
5. Modal closes; `我的待审 = 1`
6. Logout

- [ ] **Step 3: Branch_gm approves**

1. Login as a branch_gm account (or use `admin` if no branch user is set up)
2. Tap `库存` tab — should see the pending request from Step 2
3. Tap `通过` — request becomes `已入库`
4. Logout

- [ ] **Step 4: Verify back as store-manager**

1. Login as qrm again
2. Tap `库存` tab — `SKU 总数` should now reflect the items just approved; `quantity` matches what was requested
3. SSE should also have refreshed branch_gm's company inventory (decremented by the same qty)

- [ ] **Step 5: If everything works, no commit needed (already done in earlier tasks)**

---

## Out of Scope (Stage 6 candidates)

- Cancel-after-submit (DELETE replenishment) — schema supports it via `delete_status`, just needs route + UI
- Partial approval (some SKUs approved, others not)
- Multiple stores under one branch_gm picking which store to view inventory for
- Replenishment history filter / search
- HQ-side admin web UI for the new screen (admin web continues to use existing PO list, which already displays both store-level and branch-level rows)
