# Mobile Stage-2: Real Backend Connection Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stop using mock data. Mobile app authenticates against the existing admin backend (Postgres + Redis + Next.js at `apps/admin`), receives a JWT, and every mobile screen pulls from real endpoints. Where mobile views need aggregated/role-scoped data the admin doesn't already expose, add a `/api/mobile/*` namespace tuned for mobile.

**Architecture:**
- **Backend** (`apps/admin`): keep cookie-based JWT for the web admin. Add a parallel **Bearer-token** auth path for mobile under `/api/mobile/*`. New routes accept `Authorization: Bearer <jwt>` and reuse `verifyAdminJwt` + `database.js` helpers (no new auth scheme — same JWT format, different transport).
- **Mobile** (`apps/mobile`): real `LoginScreen` (account + password), token in `expo-secure-store`, `apiClient` always sends `Authorization` when token present. Each `services/api/*.ts` service flips from mock to live by setting `EXPO_PUBLIC_USE_MOCKS=0`.
- **Existing 4-role pretend login** (boss/branch_gm/store_manager/sales_staff cards) is kept as a `__DEV__` fallback so the demo still works without a running backend.

**Tech stack additions:**
- `expo-secure-store` — token persistence
- `expo-camera` — barcode scanner (Stage-2.5; ScanScreen real camera)
- `@miliguan/api-client` — extend with mobile bearer-aware client + new endpoint helpers

---

## File map (added/modified)

**Backend (`apps/admin`):**
- New: `src/lib/auth/mobile.ts` — `getMobileSession(req)` reads `Authorization: Bearer`, returns `AdminSessionUser | null`
- New: `src/app/api/mobile/auth/sign-in/route.ts` — POST account/password → `{ token, user }`
- New: `src/app/api/mobile/auth/sign-out/route.ts` — DELETE session
- New: `src/app/api/mobile/me/route.ts` — GET current user
- New: `src/app/api/mobile/kpi/overview/route.ts` — aggregates for current scope
- New: `src/app/api/mobile/orders/route.ts` — member orders for current company
- New: `src/app/api/mobile/branches/route.ts` — companies + roll-up sales/points
- New: `src/app/api/mobile/inventory/route.ts` — company inventory rows
- New: `src/app/api/mobile/stores/route.ts` — stores for current company
- New: `src/app/api/mobile/verify/records/route.ts` — recent writeoffs for current scope
- New: `src/app/api/mobile/verify/scan/route.ts` — POST barcode → writeoff
- New: `src/app/api/mobile/ranking/route.ts` — staff ranking by points

**Mobile (`apps/mobile`):**
- New: `src/services/auth/storage.ts` — secure-store wrapper
- New: `src/services/auth/auth.ts` — login / logout / loadToken
- Modified: `src/services/api/client.ts` — attach Bearer token automatically
- Modified: each `src/services/api/*.ts` — point at `/mobile/*` endpoints
- Modified: `src/screens/LoginScreen.tsx` — credentials form, role picker becomes dev-only
- New: `src/state/AuthContext.tsx` — provider for current user + token
- Modified: `App.tsx` — wrap in AuthContext, gate by token

**Shared (`packages/api-client`):**
- New: `src/mobile.ts` — typed mobile endpoint helpers + bearer client factory
- Modified: `src/index.ts` — re-export mobile helpers

---

## Phase 1: Backend mobile auth (Tasks 1-3)

### Task 1: Add `getMobileSession` helper

**Files:** Create `apps/admin/src/lib/auth/mobile.ts`

- [ ] Step 1: Write the helper

```ts
import { verifyAdminJwt } from './jwt';
import { getAdminById, getSessionUserId, touchSession } from '@/lib/database.js';
import { getAdminDataScope, type AdminSessionUser } from './shared';

function readBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ', 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export async function getMobileSession(req: Request): Promise<AdminSessionUser | null> {
  const token = readBearerToken(req);
  if (!token) return null;
  try {
    const payload = await verifyAdminJwt(token);
    const userId = await getSessionUserId(payload.sessionId);
    if (!userId || userId !== payload.userId) return null;
    await touchSession(payload.sessionId);
    const user = await getAdminById(userId);
    return user ? { ...user, dataScope: getAdminDataScope(user) } : null;
  } catch {
    return null;
  }
}

export async function requireMobileSession(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return { user: null, error: { message: '未登录', status: 401 as const } };
  }
  return { user, error: null };
}
```

### Task 2: Mobile sign-in route

**Files:** Create `apps/admin/src/app/api/mobile/auth/sign-in/route.ts`

- [ ] Step 1: Write route

```ts
import { NextResponse } from 'next/server';
import { createSession, getAdminByAccount } from '@/lib/database.js';
import { signAdminJwt } from '@/lib/auth/jwt';
import { auditRoute } from '@/lib/audit';

export async function POST(req: Request) {
  return auditRoute(req, {
    module: 'mobile-auth',
    action: '移动端登录',
    handler: async () => {
      const body = (await req.json()) as { account?: string; password?: string };
      const user = await getAdminByAccount(body.account ?? '', body.password ?? '');
      if (!user) {
        return NextResponse.json({ message: '账号或密码不正确' }, { status: 401 });
      }
      const sessionId = await createSession(user.id);
      const token = await signAdminJwt({
        sub: user.id,
        sid: sessionId,
        roleName: user.roleName,
      });
      return NextResponse.json({ token, user });
    },
  });
}
```

### Task 3: Sign-out + me

**Files:**
- Create `apps/admin/src/app/api/mobile/auth/sign-out/route.ts`
- Create `apps/admin/src/app/api/mobile/me/route.ts`

- [ ] Step 1: sign-out

```ts
import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/database.js';
import { verifyAdminJwt } from '@/lib/auth/jwt';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ ok: true });
  try {
    const payload = await verifyAdminJwt(token);
    await deleteSession(payload.sessionId);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] Step 2: me

```ts
import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  return NextResponse.json({ user });
}
```

---

## Phase 2: Mobile auth UX (Tasks 4-6)

### Task 4: Add expo-secure-store + storage wrapper

**Files:**
- Modify `apps/mobile/package.json` — add `expo-secure-store`
- Create `apps/mobile/src/services/auth/storage.ts`

- [ ] Install: `pnpm --filter mobile add expo-secure-store`
- [ ] Step 2: storage.ts

```ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'miliguan.mobile.token';

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function loadToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
```

### Task 5: Auth service + extend api client with bearer

**Files:**
- Create `apps/mobile/src/services/auth/auth.ts`
- Modify `apps/mobile/src/services/api/client.ts`

- [ ] Step 1: client.ts — token-aware fetch

```ts
import { apiBaseUrl as readBaseUrlConfig } from '../../config/env';
import { loadToken } from '../auth/storage';

let cachedToken: string | null = null;

export function setApiToken(t: string | null) {
  cachedToken = t;
}

export function shouldUseMocks(): boolean {
  return process.env.EXPO_PUBLIC_USE_MOCKS === '1' || !process.env.EXPO_PUBLIC_API_BASE_URL;
}

export async function apiFetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_API_BASE_URL not set');
  if (cachedToken === null) cachedToken = await loadToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (cachedToken) headers.set('Authorization', `Bearer ${cachedToken}`);
  const res = await fetch(`${baseUrl}${endpoint}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// Legacy compatibility shims for existing services:
export function getApiClient() {
  return apiFetch;
}
export function __resetApiClient() {
  cachedToken = null;
}
```

- [ ] Step 2: auth.ts

```ts
import { apiFetch, setApiToken } from '../api/client';
import { saveToken, clearToken, loadToken } from './storage';
import type { MockUser } from '../../data/mock';

export type AuthUser = MockUser & {
  account?: string;
  roleName?: string;
  companyId?: string;
  storeId?: string;
};

export async function login(account: string, password: string): Promise<AuthUser> {
  const { token, user } = await apiFetch<{ token: string; user: AuthUser }>(
    '/api/mobile/auth/sign-in',
    { method: 'POST', body: JSON.stringify({ account, password }) },
  );
  await saveToken(token);
  setApiToken(token);
  return user;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/mobile/auth/sign-out', { method: 'POST' }).catch(() => undefined);
  await clearToken();
  setApiToken(null);
}

export async function bootstrapAuth(): Promise<{ token: string | null; user: AuthUser | null }> {
  const token = await loadToken();
  if (!token) return { token: null, user: null };
  setApiToken(token);
  try {
    const { user } = await apiFetch<{ user: AuthUser }>('/api/mobile/me');
    return { token, user };
  } catch {
    await clearToken();
    setApiToken(null);
    return { token: null, user: null };
  }
}
```

### Task 6: LoginScreen — credentials form (with dev-mode role picker fallback)

**Files:** Modify `apps/mobile/src/screens/LoginScreen.tsx`

- [ ] Replace top-level layout: render two modes — credentials in production, role-picker only when `EXPO_PUBLIC_USE_MOCKS=1`
- [ ] Hook into `auth.login(account, password)`
- [ ] On error, surface inline message
- [ ] On success, call `onLogin(user)` as before

(Detailed code will be inserted at execute-time based on current LoginScreen.tsx contents.)

---

## Phase 3: First wired service + smoke (Tasks 7-8)

### Task 7: Wire `fetchOrders` to `/api/mobile/orders`

**Files:**
- Modify `apps/mobile/src/services/api/orders.ts`
- Create `apps/admin/src/app/api/mobile/orders/route.ts`

- [ ] Backend route: GET → `listMemberOrdersByCompany(user.companyId)` shape, returns `Order[]`
- [ ] Mobile service: when `!shouldUseMocks()` call `/api/mobile/orders`

### Task 8: Test bootstrap + login flow

**Files:** Create `apps/mobile/src/services/auth/__tests__/auth.test.ts`

- [ ] Mock `apiFetch`, exercise `login`/`logout`/`bootstrapAuth`
- [ ] Run `pnpm --filter mobile test`

---

## Phase 4: Remaining mobile endpoints (Tasks 9-13)

For each endpoint follow the same pattern: backend route reads `getMobileSession`, scopes by user, returns shape matching mobile's existing types.

- [ ] Task 9: `GET /api/mobile/kpi/overview` — sum sales / writeoffs / points / inventory in user scope; mobile `fetchKpi` calls it
- [ ] Task 10: `GET /api/mobile/branches` — companies with rolled-up stats; mobile `fetchBranches` calls it
- [ ] Task 11: `GET /api/mobile/inventory` + `GET /api/mobile/stores`; wire mobile services
- [ ] Task 12: `GET /api/mobile/verify/records` + `POST /api/mobile/verify/scan`; wire `verify.ts`
- [ ] Task 13: `GET /api/mobile/ranking?period=daily|monthly`; wire `ranking.ts`

---

## Phase 5: Real camera scan (Tasks 14-15)

- [ ] Task 14: `pnpm --filter mobile add expo-camera`; declare iOS NSCameraUsageDescription + Android CAMERA permission in `app.json`
- [ ] Task 15: ScanScreen — replace mock buttons with `<CameraView onBarcodeScanned>`; on scan, call `postVerifyScan(barcode)`

---

## Phase 6: Order creation flow (Task 16)

- [ ] Task 16: BranchGM "新建积分订单" → modal with SKU picker (from `getProductSkuOptions`) + qty + submit `POST /api/mobile/orders` (creates `purchase_orders` row in `pending` state)

---

## Out of Scope (next stage)

- Push notifications
- Image upload from mobile (member avatar / store doc)
- Offline queue / retry
- Per-screen pull-to-refresh polish
- E2E with real backend (Maestro currently runs against mocks)
