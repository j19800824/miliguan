# Mobile Stage-1 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `apps/mobile` from pure-mock to API-backed services with mock fallback, install fonts (system fonts + tabular-nums for numerics), set up Maestro E2E for the four critical user flows, and unify file naming to PascalCase.

**Architecture:**
- Introduce a `src/services/api/` boundary. Each domain (users, kpi, branches, ranking, orders, verify, inventory, stores, products) gets a typed `fetchX()` function. Each function checks `EXPO_PUBLIC_USE_MOCKS` / missing `EXPO_PUBLIC_API_BASE_URL` → returns existing mock; otherwise calls `@miliguan/api-client`. Screens stop importing `data/mock.ts` directly.
- Fonts: extend `theme.ts` with a `FontFamily` token. `App.tsx` calls `useFonts` from `expo-font`, gating render until fonts are ready. iOS uses system PingFang SC; Android uses system default with a documented `assets/fonts/HarmonyOSSansSC-*.ttf` drop-in slot. Add `tabular-nums` `fontVariant` to KPI/ranking/order numerics.
- E2E: introduce `apps/mobile/.maestro/` with five flows. Add stable `testID` props to login cards, login button, tab bars, and scan-result triggers. Run via Maestro CLI (`maestro test .maestro/flows/`).
- Naming: `git mv` `product-card.tsx` → `ProductCard.tsx` and `products-screen.tsx` → `ProductsScreen.tsx`; update import sites.

**Tech Stack:**
- jest-expo + @testing-library/react-native (TDD baseline; project currently has zero tests)
- expo-font (peer of expo, already transitively present)
- Maestro CLI v1.x (external; install via `curl -fsSL "https://get.maestro.mobile.dev" | bash`)
- Existing: React Native 0.83, Expo 55, @miliguan/api-client (workspace)

---

## File Structure (after this plan)

**New files:**
- `apps/mobile/jest.config.js` — jest-expo preset
- `apps/mobile/jest.setup.ts` — RTL setup
- `apps/mobile/src/services/api/client.ts` — singleton apiClient + `useMocks` flag
- `apps/mobile/src/services/api/users.ts`
- `apps/mobile/src/services/api/kpi.ts`
- `apps/mobile/src/services/api/branches.ts`
- `apps/mobile/src/services/api/ranking.ts`
- `apps/mobile/src/services/api/orders.ts`
- `apps/mobile/src/services/api/verify.ts`
- `apps/mobile/src/services/api/inventory.ts`
- `apps/mobile/src/services/api/stores.ts`
- `apps/mobile/src/services/api/products.ts` (moved from `services/products.ts`)
- `apps/mobile/src/services/api/index.ts` — barrel
- `apps/mobile/src/services/api/__tests__/client.test.ts`
- `apps/mobile/src/services/api/__tests__/users.test.ts`
- `apps/mobile/src/services/api/__tests__/kpi.test.ts`
- `apps/mobile/.maestro/config.yaml`
- `apps/mobile/.maestro/flows/login.yaml`
- `apps/mobile/.maestro/flows/role-routing.yaml`
- `apps/mobile/.maestro/flows/scan.yaml`
- `apps/mobile/.maestro/flows/order.yaml`
- `apps/mobile/.maestro/flows/ranking.yaml`

**Renamed:**
- `src/components/product-card.tsx` → `src/components/ProductCard.tsx`
- `src/screens/products-screen.tsx` → `src/screens/ProductsScreen.tsx`
- `src/services/products.ts` → `src/services/api/products.ts`

**Modified:**
- `apps/mobile/package.json` (add jest-expo, RTL, scripts)
- `apps/mobile/src/config/env.ts` (add `useMocks`)
- `apps/mobile/src/constants/theme.ts` (add `FontFamily`, `numericFont`)
- `apps/mobile/App.tsx` (font loading + splash gating)
- All screens that import `data/mock` directly (replaced with services)
- `KpiCard.tsx`, `RankingRow.tsx` (apply `tabular-nums`)
- LoginScreen + Tab navigators + ScanScreen (testID props)

---

## Task 1: Set up jest-expo test runner

**Files:**
- Create: `apps/mobile/jest.config.js`
- Create: `apps/mobile/jest.setup.ts`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Add dev deps**

```bash
cd apps/mobile
pnpm add -D jest jest-expo @testing-library/react-native @testing-library/jest-native @types/jest
```

Expected: deps added; pnpm-lock.yaml updated at workspace root.

- [ ] **Step 2: Create jest.config.js**

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEach: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@miliguan/.*))',
  ],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
```

- [ ] **Step 3: Create jest.setup.ts**

```ts
import '@testing-library/jest-native/extend-expect';
```

- [ ] **Step 4: Add scripts in package.json**

In `apps/mobile/package.json`, change `"scripts"` to:

```json
"scripts": {
  "dev": "expo start",
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "test:watch": "jest --watch",
  "clean": "rm -rf .expo"
}
```

- [ ] **Step 5: Add smoke test**

Create `apps/mobile/src/services/api/__tests__/smoke.test.ts`:

```ts
test('jest is wired', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: Run**

Run: `pnpm --filter mobile test`
Expected: 1 passing test, 0 failing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/jest.config.js apps/mobile/jest.setup.ts apps/mobile/package.json apps/mobile/src/services/api/__tests__/smoke.test.ts pnpm-lock.yaml
git commit -m "chore(mobile): set up jest-expo test runner"
```

---

## Task 2: env + apiClient singleton + useMocks flag

**Files:**
- Modify: `apps/mobile/src/config/env.ts`
- Create: `apps/mobile/src/services/api/client.ts`
- Create: `apps/mobile/src/services/api/__tests__/client.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/mobile/src/services/api/__tests__/client.test.ts`:

```ts
import { getApiClient, shouldUseMocks } from '../client';

describe('api client', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('falls back to mocks when EXPO_PUBLIC_API_BASE_URL is missing', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(shouldUseMocks()).toBe(true);
  });

  it('falls back to mocks when EXPO_PUBLIC_USE_MOCKS=1', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://x';
    process.env.EXPO_PUBLIC_USE_MOCKS = '1';
    expect(shouldUseMocks()).toBe(true);
  });

  it('returns a real apiClient when base url is set and useMocks is off', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.example.com';
    process.env.EXPO_PUBLIC_USE_MOCKS = '0';
    expect(shouldUseMocks()).toBe(false);
    expect(typeof getApiClient()).toBe('function');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `pnpm --filter mobile test client`
Expected: FAIL — module `../client` not found.

- [ ] **Step 3: Update env.ts**

Replace `apps/mobile/src/config/env.ts` with:

```ts
declare const process: {
  env: Record<string, string | undefined>;
};

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
export const useMocks =
  process.env.EXPO_PUBLIC_USE_MOCKS === '1' || !apiBaseUrl;
```

- [ ] **Step 4: Implement client.ts**

Create `apps/mobile/src/services/api/client.ts`:

```ts
import { createApiClient } from '@miliguan/api-client';
import { apiBaseUrl, useMocks as envUseMocks } from '../../config/env';

export type ApiClient = ReturnType<typeof createApiClient>;

let cached: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (cached) return cached;
  if (!apiBaseUrl) {
    throw new Error(
      'apiClient requested without EXPO_PUBLIC_API_BASE_URL. Use shouldUseMocks() first.',
    );
  }
  cached = createApiClient({ baseUrl: apiBaseUrl });
  return cached;
}

export function shouldUseMocks(): boolean {
  return envUseMocks;
}

export function __resetApiClient() {
  cached = null;
}
```

- [ ] **Step 5: Run test, expect pass**

Run: `pnpm --filter mobile test client`
Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/config/env.ts apps/mobile/src/services/api/client.ts apps/mobile/src/services/api/__tests__/client.test.ts
git commit -m "feat(mobile): add api client singleton with mock fallback flag"
```

---

## Task 3: Move existing products service into services/api/

**Files:**
- Move: `src/services/products.ts` → `src/services/api/products.ts`
- Modify: `src/screens/products-screen.tsx` (import path)

- [ ] **Step 1: git mv**

```bash
cd apps/mobile
git mv src/services/products.ts src/services/api/products.ts
```

- [ ] **Step 2: Refactor products.ts to use shared client**

Replace `apps/mobile/src/services/api/products.ts` with:

```ts
import {
  getProducts,
  type Product,
  type ProductsResponse,
} from '@miliguan/api-client';
import { getApiClient, shouldUseMocks } from './client';

export type { Product, ProductsResponse };

export async function fetchProducts(): Promise<ProductsResponse> {
  if (shouldUseMocks()) {
    return {
      success: true,
      time: new Date().toISOString(),
      message: 'mock',
      total_products: 0,
      offset: 0,
      limit: 8,
      products: [],
    };
  }
  return getProducts(getApiClient(), { page: 1, limit: 8 });
}
```

- [ ] **Step 3: Update import in products-screen.tsx**

In `apps/mobile/src/screens/products-screen.tsx`, change line 5:

From:
```ts
import { fetchProducts } from '../services/products';
```

To:
```ts
import { fetchProducts } from '../services/api/products';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services apps/mobile/src/screens/products-screen.tsx
git commit -m "refactor(mobile): move products service into services/api/"
```

---

## Task 4: services/api/users.ts (TDD)

**Files:**
- Create: `apps/mobile/src/services/api/users.ts`
- Create: `apps/mobile/src/services/api/__tests__/users.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/mobile/src/services/api/__tests__/users.test.ts`:

```ts
import { fetchUsers } from '../users';
import * as client from '../client';

describe('fetchUsers', () => {
  it('returns mock users when shouldUseMocks() is true', async () => {
    jest.spyOn(client, 'shouldUseMocks').mockReturnValue(true);
    const users = await fetchUsers();
    expect(users.length).toBeGreaterThanOrEqual(4);
    expect(users.map((u) => u.role)).toEqual(
      expect.arrayContaining(['boss', 'branch_gm', 'store_manager', 'sales_staff']),
    );
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter mobile test users`
Expected: FAIL — module `../users` not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/services/api/users.ts`:

```ts
import { MOCK_USERS, type MockUser } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type User = MockUser;

export async function fetchUsers(): Promise<User[]> {
  if (shouldUseMocks()) return MOCK_USERS;
  return getApiClient()<User[]>('/users');
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter mobile test users`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/api/users.ts apps/mobile/src/services/api/__tests__/users.test.ts
git commit -m "feat(mobile): add users service with mock fallback"
```

---

## Task 5: services/api/kpi.ts (TDD)

**Files:**
- Create: `apps/mobile/src/services/api/kpi.ts`
- Create: `apps/mobile/src/services/api/__tests__/kpi.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/mobile/src/services/api/__tests__/kpi.test.ts`:

```ts
import { fetchKpi } from '../kpi';
import * as client from '../client';

describe('fetchKpi', () => {
  it('returns mock KPI when in mocks mode', async () => {
    jest.spyOn(client, 'shouldUseMocks').mockReturnValue(true);
    const kpi = await fetchKpi();
    expect(kpi.totalSales).toBeTruthy();
    expect(kpi.totalVerify).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `pnpm --filter mobile test kpi`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/services/api/kpi.ts`:

```ts
import { MOCK_KPI } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Kpi = typeof MOCK_KPI;

export async function fetchKpi(): Promise<Kpi> {
  if (shouldUseMocks()) return MOCK_KPI;
  return getApiClient()<Kpi>('/kpi/overview');
}
```

- [ ] **Step 4: Run, pass**

Run: `pnpm --filter mobile test kpi`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/api/kpi.ts apps/mobile/src/services/api/__tests__/kpi.test.ts
git commit -m "feat(mobile): add kpi service with mock fallback"
```

---

## Task 6: branches + ranking services

**Files:**
- Create: `apps/mobile/src/services/api/branches.ts`
- Create: `apps/mobile/src/services/api/ranking.ts`

- [ ] **Step 1: branches.ts**

Create `apps/mobile/src/services/api/branches.ts`:

```ts
import { MOCK_BRANCHES } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Branch = (typeof MOCK_BRANCHES)[number];

export async function fetchBranches(): Promise<Branch[]> {
  if (shouldUseMocks()) return MOCK_BRANCHES;
  return getApiClient()<Branch[]>('/branches');
}
```

- [ ] **Step 2: ranking.ts**

Create `apps/mobile/src/services/api/ranking.ts`:

```ts
import { MOCK_RANKING_DAILY } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type RankingPeriod = 'daily' | 'weekly' | 'monthly';
export type RankingEntry = (typeof MOCK_RANKING_DAILY)[number];

export async function fetchRanking(
  period: RankingPeriod = 'daily',
): Promise<RankingEntry[]> {
  if (shouldUseMocks()) return MOCK_RANKING_DAILY;
  return getApiClient()<RankingEntry[]>(`/ranking?period=${period}`);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/api/branches.ts apps/mobile/src/services/api/ranking.ts
git commit -m "feat(mobile): add branches and ranking services"
```

---

## Task 7: orders + verify services

**Files:**
- Create: `apps/mobile/src/services/api/orders.ts`
- Create: `apps/mobile/src/services/api/verify.ts`

- [ ] **Step 1: orders.ts**

Create `apps/mobile/src/services/api/orders.ts`:

```ts
import { MOCK_ORDERS } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type Order = (typeof MOCK_ORDERS)[number];

export async function fetchOrders(): Promise<Order[]> {
  if (shouldUseMocks()) return MOCK_ORDERS;
  return getApiClient()<Order[]>('/orders');
}
```

- [ ] **Step 2: verify.ts**

Create `apps/mobile/src/services/api/verify.ts`:

```ts
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
  return getApiClient()<VerifyRecord[]>('/verify/records');
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
  return getApiClient()<VerifyScanResult>('/verify/scan', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/services/api/orders.ts apps/mobile/src/services/api/verify.ts
git commit -m "feat(mobile): add orders and verify services"
```

---

## Task 8: inventory + stores services + barrel

**Files:**
- Create: `apps/mobile/src/services/api/inventory.ts`
- Create: `apps/mobile/src/services/api/stores.ts`
- Create: `apps/mobile/src/services/api/index.ts`

- [ ] **Step 1: inventory.ts**

Create `apps/mobile/src/services/api/inventory.ts`:

```ts
import { MOCK_INVENTORY } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type InventoryItem = (typeof MOCK_INVENTORY)[number];

export async function fetchInventory(): Promise<InventoryItem[]> {
  if (shouldUseMocks()) return MOCK_INVENTORY;
  return getApiClient()<InventoryItem[]>('/inventory');
}
```

- [ ] **Step 2: stores.ts**

Create `apps/mobile/src/services/api/stores.ts`:

```ts
import { MOCK_STORES } from '../../data/mock';
import { getApiClient, shouldUseMocks } from './client';

export type StoreItem = (typeof MOCK_STORES)[number];

export async function fetchStores(): Promise<StoreItem[]> {
  if (shouldUseMocks()) return MOCK_STORES;
  return getApiClient()<StoreItem[]>('/stores');
}
```

- [ ] **Step 3: barrel**

Create `apps/mobile/src/services/api/index.ts`:

```ts
export * from './client';
export * from './users';
export * from './kpi';
export * from './branches';
export * from './ranking';
export * from './orders';
export * from './verify';
export * from './inventory';
export * from './stores';
export * from './products';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/api/inventory.ts apps/mobile/src/services/api/stores.ts apps/mobile/src/services/api/index.ts
git commit -m "feat(mobile): add inventory + stores services and api barrel"
```

---

## Task 9: Wire LoginScreen via fetchUsers

**Files:**
- Modify: `apps/mobile/src/screens/LoginScreen.tsx`

- [ ] **Step 1: Replace mock import with service hook**

In `apps/mobile/src/screens/LoginScreen.tsx`:

Replace line 12:
```ts
import { MOCK_USERS, type MockUser, type Role } from '../data/mock';
```
With:
```ts
import { useEffect, useState } from 'react';
import { fetchUsers, type User } from '../services/api';
import type { MockUser, Role } from '../data/mock';
```

(Keep `useState` import already present; merge `useEffect` if not present.)

Replace the body of `LoginScreen` between `const insets = useSafeAreaInsets();` and `const handleLogin = ...`:

```tsx
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let active = true;
    fetchUsers().then((data) => {
      if (active) setUsers(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = () => {
    const user = users.find((u) => u.id === selected);
    if (user) onLogin(user);
  };
```

Replace the `MOCK_USERS.map(...)` line with `users.map(...)`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke**

Run: `pnpm --filter mobile dev`
Expected: Login screen renders 4 role cards (mocks since no API).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/LoginScreen.tsx
git commit -m "feat(mobile): load users via fetchUsers in LoginScreen"
```

---

## Task 10: Wire Boss + BranchGM screens

**Files:**
- Modify: `apps/mobile/src/screens/boss/BossHomeScreen.tsx`
- Modify: `apps/mobile/src/screens/branch-gm/BranchGMHomeScreen.tsx`
- Modify: `apps/mobile/src/screens/branch-gm/BranchGMOrdersScreen.tsx`

- [ ] **Step 1: BossHomeScreen — replace mock imports**

Find the import of `MOCK_KPI` and `MOCK_BRANCHES` from `../../data/mock`. Remove those imports.

Add:
```ts
import { useEffect, useState } from 'react';
import { fetchKpi, fetchBranches, type Kpi, type Branch } from '../../services/api';
```

In the component body (top), add:
```ts
const [kpi, setKpi] = useState<Kpi | null>(null);
const [branches, setBranches] = useState<Branch[]>([]);

useEffect(() => {
  let active = true;
  Promise.all([fetchKpi(), fetchBranches()]).then(([k, b]) => {
    if (!active) return;
    setKpi(k);
    setBranches(b);
  });
  return () => {
    active = false;
  };
}, []);

if (!kpi) return null;
```

Replace remaining references to `MOCK_KPI` with `kpi`, and `MOCK_BRANCHES` with `branches`.

- [ ] **Step 2: BranchGMHomeScreen**

Same pattern: replace `MOCK_KPI`/`MOCK_ORDERS` imports with `fetchKpi`/`fetchOrders` from `../../services/api`. Use the same `useEffect` + `Promise.all` pattern. Guard render with `if (!kpi) return null;`.

- [ ] **Step 3: BranchGMOrdersScreen**

Replace `MOCK_ORDERS` import with:
```ts
import { useEffect, useState } from 'react';
import { fetchOrders, type Order } from '../../services/api';
```

Add `const [orders, setOrders] = useState<Order[]>([])` + `useEffect` calling `fetchOrders().then(setOrders)`.

Replace `MOCK_ORDERS` references with `orders`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/boss apps/mobile/src/screens/branch-gm
git commit -m "feat(mobile): wire boss + branch-gm screens to api services"
```

---

## Task 11: Wire StoreManager + ScanScreen

**Files:**
- Modify: `apps/mobile/src/screens/store-manager/StoreManagerHomeScreen.tsx`
- Modify: `apps/mobile/src/screens/store-manager/ScanScreen.tsx`

- [ ] **Step 1: StoreManagerHomeScreen**

Replace mock imports (`MOCK_KPI`, `MOCK_VERIFY_RECORDS`, `MOCK_INVENTORY`) with:
```ts
import { useEffect, useState } from 'react';
import {
  fetchKpi,
  fetchVerifyRecords,
  fetchInventory,
  type Kpi,
  type VerifyRecord,
  type InventoryItem,
} from '../../services/api';
```

Add state + `useEffect` with `Promise.all([fetchKpi(), fetchVerifyRecords(), fetchInventory()])` setting three pieces of state. Guard render with `if (!kpi) return null;`.

Replace mock references with state.

- [ ] **Step 2: ScanScreen — call postVerifyScan**

In `apps/mobile/src/screens/store-manager/ScanScreen.tsx`:

Remove the hardcoded `MOCK_PRODUCT` const.

Add import:
```ts
import { postVerifyScan, type VerifyScanResult } from '../../services/api';
```

Replace the `handleMockScan` function with:

```ts
const [result, setResult] = useState<VerifyScanResult | null>(null);

const handleMockScan = async (success: boolean) => {
  const res = await postVerifyScan({
    barcode: success ? '6901234567890' : '0000000000000',
  });
  setResult(res);
  setState(res.success ? 'success' : 'fail');
};

const handleReset = () => {
  setResult(null);
  setState('scanning');
};
```

In the success card JSX, replace `{MOCK_PRODUCT.name}`, `{MOCK_PRODUCT.sku}`, `{MOCK_PRODUCT.points}` with `{result?.product?.name}`, `{result?.product?.sku}`, `{result?.product?.points}` (and add `?? '—'` fallbacks for type safety).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/store-manager
git commit -m "feat(mobile): wire store-manager screens to api services"
```

---

## Task 12: Wire SalesStaff + Profile screens

**Files:**
- Modify: `apps/mobile/src/screens/sales-staff/SalesStaffHomeScreen.tsx`
- Modify: `apps/mobile/src/screens/sales-staff/SalesStaffRankingScreen.tsx`
- Modify: `apps/mobile/src/screens/shared/ProfileScreen.tsx` (if it imports mock directly)

- [ ] **Step 1: SalesStaffHomeScreen**

Replace `MOCK_RANKING_DAILY`/`MOCK_KPI` imports with `fetchRanking`/`fetchKpi` from `../../services/api`. Apply the standard state + `useEffect` + `Promise.all` pattern. Guard render with `if (!kpi) return null;`.

- [ ] **Step 2: SalesStaffRankingScreen**

Replace `MOCK_RANKING_DAILY` import with `fetchRanking` from `../../services/api`. State: `const [ranking, setRanking] = useState<RankingEntry[]>([])`. `useEffect` calls `fetchRanking('daily').then(setRanking)`.

If the screen has period tabs, refetch on tab change with the new period.

- [ ] **Step 3: ProfileScreen (only if it imports mock)**

If `ProfileScreen.tsx` imports `MOCK_USERS` or any other mock data directly, replace with the relevant service call. If it only consumes the `user` prop, leave unchanged.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/sales-staff apps/mobile/src/screens/shared
git commit -m "feat(mobile): wire sales-staff + profile screens to api services"
```

---

## Task 13: Add FontFamily token + Typography helper to theme.ts

**Files:**
- Modify: `apps/mobile/src/constants/theme.ts`

- [ ] **Step 1: Add FontFamily and numericFont**

Append to `apps/mobile/src/constants/theme.ts`:

```ts
import { Platform } from 'react-native';

export const FontFamily = {
  // iOS uses system PingFang SC by default. Android falls back to Roboto/HarmonyOS unless user drops in HarmonyOSSansSC-*.ttf and registers in App.tsx.
  regular: Platform.select({
    ios: 'PingFang SC',
    android: 'sans-serif',
    default: 'System',
  }),
  medium: Platform.select({
    ios: 'PingFang SC',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  bold: Platform.select({
    ios: 'PingFang SC',
    android: 'sans-serif-medium',
    default: 'System',
  }),
};

// Apply to numeric values (KPI, ranking points, order amounts) for proportional digits.
export const numericFont = {
  fontVariant: ['tabular-nums'] as const,
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/constants/theme.ts
git commit -m "feat(mobile): add FontFamily token and tabular-nums helper"
```

---

## Task 14: Wire expo-font in App.tsx with splash gating

**Files:**
- Modify: `apps/mobile/App.tsx`
- Create: `apps/mobile/assets/fonts/.gitkeep`

- [ ] **Step 1: Ensure expo-font present**

Run: `pnpm --filter mobile add expo-font expo-splash-screen`
Expected: deps added.

- [ ] **Step 2: Reserve assets/fonts dir**

```bash
mkdir -p apps/mobile/assets/fonts
touch apps/mobile/assets/fonts/.gitkeep
```

- [ ] **Step 3: Update App.tsx**

Replace `apps/mobile/App.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { LoginScreen } from './src/screens/LoginScreen';
import { BossNavigator } from './src/navigation/BossNavigator';
import { BranchGMNavigator } from './src/navigation/BranchGMNavigator';
import { StoreManagerNavigator } from './src/navigation/StoreManagerNavigator';
import { SalesStaffNavigator } from './src/navigation/SalesStaffNavigator';
import type { MockUser } from './src/data/mock';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [user, setUser] = useState<MockUser | null>(null);

  // When HarmonyOS Sans SC TTFs are dropped into assets/fonts/, register them here.
  // Empty map means useFonts resolves immediately and we use system fonts (PingFang on iOS, sans-serif on Android).
  const [fontsLoaded] = useFonts({});

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const handleLogout = () => setUser(null);

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LoginScreen onLogin={setUser} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        {user.role === 'boss' && <BossNavigator user={user} onLogout={handleLogout} />}
        {user.role === 'branch_gm' && <BranchGMNavigator user={user} onLogout={handleLogout} />}
        {user.role === 'store_manager' && <StoreManagerNavigator user={user} onLogout={handleLogout} />}
        {user.role === 'sales_staff' && <SalesStaffNavigator user={user} onLogout={handleLogout} />}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: Typecheck + manual smoke**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile dev`
Expected: app boots, splash hides, login renders without font flicker.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/assets/fonts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): gate render on font loading via expo-font + splash"
```

---

## Task 15: Apply tabular-nums to numeric components

**Files:**
- Modify: `apps/mobile/src/components/KpiCard.tsx`
- Modify: `apps/mobile/src/components/RankingRow.tsx`

- [ ] **Step 1: KpiCard.tsx**

In `apps/mobile/src/components/KpiCard.tsx`:

Add to the import line at the top:
```ts
import { Colors, FontSize, Radius, Shadow, Spacing, numericFont } from '../constants/theme';
```

Find the `value:` style at line 86 and append `...numericFont` so it becomes:

```ts
value: {
  fontSize: 22,
  fontWeight: '800',
  color: Colors.textPrimary,
  letterSpacing: -0.3,
  ...numericFont,
},
```

- [ ] **Step 2: RankingRow.tsx**

Read `apps/mobile/src/components/RankingRow.tsx` first. Then for any text style that displays a numeric value (rank, points, amount), append `...numericFont` the same way.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/KpiCard.tsx apps/mobile/src/components/RankingRow.tsx
git commit -m "style(mobile): apply tabular-nums to KPI and ranking numerics"
```

---

## Task 16: Rename product-card.tsx → ProductCard.tsx

**Files:**
- Rename: `src/components/product-card.tsx` → `src/components/ProductCard.tsx`
- Modify: `src/screens/products-screen.tsx` (import path)

- [ ] **Step 1: git mv**

```bash
cd apps/mobile
git mv src/components/product-card.tsx src/components/ProductCard.tsx
```

- [ ] **Step 2: Update import**

In `apps/mobile/src/screens/products-screen.tsx`, change line 4:

From:
```ts
import { ProductCard } from '../components/product-card';
```
To:
```ts
import { ProductCard } from '../components/ProductCard';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components apps/mobile/src/screens/products-screen.tsx
git commit -m "refactor(mobile): rename product-card.tsx to ProductCard.tsx"
```

---

## Task 17: Rename products-screen.tsx → ProductsScreen.tsx

**Files:**
- Rename: `src/screens/products-screen.tsx` → `src/screens/ProductsScreen.tsx`
- Modify: any file importing `products-screen`

- [ ] **Step 1: Search for importers**

```bash
cd apps/mobile
grep -rn "products-screen" src/ App.tsx index.ts 2>/dev/null || true
```

Note all files that match.

- [ ] **Step 2: git mv**

```bash
git mv src/screens/products-screen.tsx src/screens/ProductsScreen.tsx
```

- [ ] **Step 3: Update each import site**

For each file matched in Step 1, change `'.../products-screen'` to `'.../ProductsScreen'`. (If no matches, the screen is unused — leave the rename and proceed.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "refactor(mobile): rename products-screen.tsx to ProductsScreen.tsx"
```

---

## Task 18: Add testID props for E2E targeting

**Files:**
- Modify: `apps/mobile/src/screens/LoginScreen.tsx`
- Modify: `apps/mobile/src/navigation/BossNavigator.tsx`
- Modify: `apps/mobile/src/navigation/BranchGMNavigator.tsx`
- Modify: `apps/mobile/src/navigation/StoreManagerNavigator.tsx`
- Modify: `apps/mobile/src/navigation/SalesStaffNavigator.tsx`
- Modify: `apps/mobile/src/screens/store-manager/ScanScreen.tsx`
- Modify: `apps/mobile/src/screens/sales-staff/SalesStaffRankingScreen.tsx`

- [ ] **Step 1: LoginScreen testIDs**

In the role card `TouchableOpacity`, add `testID={`login-role-${user.role}`}`.

In the login button `TouchableOpacity`, add `testID="login-submit"`.

- [ ] **Step 2: Tab navigators**

In each `*Navigator.tsx` file, on every `Tab.Screen`, add an option:
```ts
options={{ tabBarTestID: `tab-${routeKey}` }}
```
where `routeKey` is the screen's slug (`home`, `orders`, `scan`, `ranking`, `profile`).

- [ ] **Step 3: ScanScreen demo buttons**

On the success demo `TouchableOpacity` add `testID="scan-mock-success"`. On the fail one add `testID="scan-mock-fail"`. On the continue button add `testID="scan-continue"`.

- [ ] **Step 4: SalesStaffRankingScreen**

If it has period tabs (daily/weekly/monthly), add `testID="ranking-period-{period}"` to each.

- [ ] **Step 5: Typecheck + smoke**

Run: `pnpm --filter mobile typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "test(mobile): add testID props for E2E targeting"
```

---

## Task 19: Set up Maestro

**Files:**
- Create: `apps/mobile/.maestro/config.yaml`
- Modify: `apps/mobile/package.json` (e2e script)
- Modify: `apps/mobile/.gitignore` (ignore maestro logs)

- [ ] **Step 1: Verify Maestro CLI**

```bash
maestro --version
```

Expected: prints a version. If `command not found`, install with:
```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

- [ ] **Step 2: Create config.yaml**

Create `apps/mobile/.maestro/config.yaml`:

```yaml
flows:
  - flows/login.yaml
  - flows/role-routing.yaml
  - flows/scan.yaml
  - flows/order.yaml
  - flows/ranking.yaml
```

- [ ] **Step 3: Add npm scripts**

In `apps/mobile/package.json`, add to `"scripts"`:
```json
"e2e": "maestro test .maestro/flows/",
"e2e:login": "maestro test .maestro/flows/login.yaml"
```

- [ ] **Step 4: Update .gitignore**

Append to `apps/mobile/.gitignore`:
```
.maestro/.maestro
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/.maestro/config.yaml apps/mobile/package.json apps/mobile/.gitignore
git commit -m "test(mobile): set up Maestro E2E config"
```

---

## Task 20: Maestro flow — login + role routing

**Files:**
- Create: `apps/mobile/.maestro/flows/login.yaml`
- Create: `apps/mobile/.maestro/flows/role-routing.yaml`

- [ ] **Step 1: login.yaml**

Create `apps/mobile/.maestro/flows/login.yaml`:

```yaml
appId: com.miliguan.mobile
name: Login flow
---
- launchApp:
    clearState: true
- assertVisible: "欢迎登录"
- tapOn:
    id: "login-role-boss"
- tapOn:
    id: "login-submit"
- assertVisible: "总部"
```

- [ ] **Step 2: role-routing.yaml**

Create `apps/mobile/.maestro/flows/role-routing.yaml`:

```yaml
appId: com.miliguan.mobile
name: Each role lands on its home screen
---
- launchApp:
    clearState: true
- tapOn:
    id: "login-role-branch_gm"
- tapOn:
    id: "login-submit"
- assertVisible: "华东分公司"
- tapOn:
    id: "tab-profile"
- tapOn:
    text: "退出登录"
- tapOn:
    id: "login-role-store_manager"
- tapOn:
    id: "login-submit"
- assertVisible: "静安社区店"
- tapOn:
    id: "tab-profile"
- tapOn:
    text: "退出登录"
- tapOn:
    id: "login-role-sales_staff"
- tapOn:
    id: "login-submit"
- assertVisible: "陈小丽"
```

- [ ] **Step 3: Run flows**

Boot a simulator first (`pnpm --filter mobile ios`), then:
```bash
cd apps/mobile
maestro test .maestro/flows/login.yaml
maestro test .maestro/flows/role-routing.yaml
```

Expected: both green.

If "退出登录" text is wrong, read `ProfileScreen.tsx` and replace with the actual logout label.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/.maestro/flows
git commit -m "test(mobile): add Maestro login and role-routing flows"
```

---

## Task 21: Maestro flow — scan + order + ranking

**Files:**
- Create: `apps/mobile/.maestro/flows/scan.yaml`
- Create: `apps/mobile/.maestro/flows/order.yaml`
- Create: `apps/mobile/.maestro/flows/ranking.yaml`

- [ ] **Step 1: scan.yaml**

Create `apps/mobile/.maestro/flows/scan.yaml`:

```yaml
appId: com.miliguan.mobile
name: Store manager scans a barcode
---
- launchApp:
    clearState: true
- tapOn:
    id: "login-role-store_manager"
- tapOn:
    id: "login-submit"
- tapOn:
    id: "tab-scan"
- tapOn:
    id: "scan-mock-success"
- assertVisible: "核销成功"
- tapOn:
    id: "scan-continue"
- tapOn:
    id: "scan-mock-fail"
- assertVisible: "核销失败"
```

- [ ] **Step 2: order.yaml**

Create `apps/mobile/.maestro/flows/order.yaml`:

```yaml
appId: com.miliguan.mobile
name: Branch GM views orders list
---
- launchApp:
    clearState: true
- tapOn:
    id: "login-role-branch_gm"
- tapOn:
    id: "login-submit"
- tapOn:
    id: "tab-orders"
- assertVisible: "ORD20240401001"
```

- [ ] **Step 3: ranking.yaml**

Create `apps/mobile/.maestro/flows/ranking.yaml`:

```yaml
appId: com.miliguan.mobile
name: Sales staff sees ranking
---
- launchApp:
    clearState: true
- tapOn:
    id: "login-role-sales_staff"
- tapOn:
    id: "login-submit"
- tapOn:
    id: "tab-ranking"
- assertVisible: "陈小丽"
- assertVisible: "王店长"
```

- [ ] **Step 4: Run all flows**

```bash
cd apps/mobile
maestro test .maestro/flows/
```

Expected: all 5 flows green. If a flow fails, read the screen file and adjust the asserted text or testID.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/.maestro/flows
git commit -m "test(mobile): add Maestro scan, order, ranking flows"
```

---

## Task 22: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full Jest suite**

```bash
pnpm --filter mobile test
```
Expected: all green.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter mobile typecheck
```
Expected: 0 errors.

- [ ] **Step 3: Boot Expo**

```bash
pnpm --filter mobile dev
```
Expected: QR code; Metro bundles without error.

- [ ] **Step 4: Manual smoke (each role)**

Open simulator. For each role:
1. Tap card → tap "进入系统"
2. Land on home — KPIs visible
3. Visit each tab — no white screens, no crashes
4. Profile → 退出登录 → back to login

- [ ] **Step 5: Run Maestro suite**

```bash
cd apps/mobile && maestro test .maestro/flows/
```
Expected: 5/5 flows pass.

- [ ] **Step 6: Final commit (only if any fixes were needed in steps 1-5)**

```bash
git add -A
git commit -m "chore(mobile): stage-1 hardening verification fixes"
```

---

## Out of Scope (tracked for next stage)

- Real backend implementation of `/users`, `/kpi/overview`, `/branches`, `/ranking`, `/orders`, `/verify/*`, `/inventory`, `/stores` — services are stubbed with mocks; backend work is a separate plan.
- HarmonyOS Sans SC / Alibaba PuHuiTi font files — slot reserved at `assets/fonts/`; user must drop in `.ttf` and add the entry to the `useFonts` map in App.tsx.
- Detox fallback for E2E (Maestro is primary).
- Token-based auth on apiClient — `defaultHeaders` is wired, just needs a `setAuthToken()` helper later.
