import { getApiClient, setApiToken, shouldUseMocks } from '../api/client';
import { saveToken, clearToken, loadToken } from './storage';
import type { MockUser, Role } from '../../data/mock';

/**
 * Mobile-side user shape. Extends the existing MockUser (which the screens
 * already consume) with the real fields the backend returns.
 */
export type AuthUser = MockUser & {
  account?: string;
  roleName?: string;
  companyId?: string;
  storeId?: string;
  permissions?: string[];
};

interface SignInResponse {
  token: string;
  user: AuthUser & {
    roleName?: string;
    roleScope?: string;
    department?: string;
    fullName?: string;
  };
}

interface MeResponse {
  user: SignInResponse['user'];
}

/**
 * Best-effort mapper from the admin's AdminSessionUser shape onto the
 * 4-role MockUser shape the mobile screens expect.
 */
function adaptUser(raw: SignInResponse['user']): AuthUser {
  const role: Role = inferRole(raw.roleName ?? '', raw.roleScope ?? '');
  return {
    id: raw.id,
    name: raw.fullName ?? raw.name ?? raw.account ?? '账号',
    role,
    roleLabel: raw.roleName ?? roleLabel(role),
    org: raw.department ?? '',
    avatar: roleAvatar(role),
    points: undefined,
    account: raw.account,
    roleName: raw.roleName,
    companyId: raw.companyId,
    storeId: raw.storeId,
    permissions: raw.permissions,
  };
}

function inferRole(roleName: string, scope: string): Role {
  const haystack = `${roleName}${scope}`.toLowerCase();
  if (haystack.includes('boss') || roleName.includes('老板')) return 'boss';
  if (haystack.includes('branch') || scope.includes('分公司')) return 'branch_gm';
  if (haystack.includes('store') || roleName.includes('店长')) return 'store_manager';
  return 'sales_staff';
}

function roleLabel(role: Role): string {
  switch (role) {
    case 'boss': return '老板';
    case 'branch_gm': return '分公司总经理';
    case 'store_manager': return '门店店长';
    case 'sales_staff': return '销售店员';
  }
}

function roleAvatar(role: Role): string {
  switch (role) {
    case 'boss': return '👑';
    case 'branch_gm': return '🏢';
    case 'store_manager': return '🏪';
    case 'sales_staff': return '🛒';
  }
}

export async function login(account: string, password: string): Promise<AuthUser> {
  if (shouldUseMocks()) {
    throw new Error('Mock mode: 使用角色卡片登录');
  }
  const apiClient = getApiClient();
  const data = await apiClient<SignInResponse>('/api/mobile/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });
  await saveToken(data.token);
  setApiToken(data.token);
  return adaptUser(data.user);
}

export async function logout(): Promise<void> {
  if (!shouldUseMocks()) {
    try {
      const apiClient = getApiClient();
      await apiClient<{ ok: boolean }>('/api/mobile/auth/sign-out', { method: 'POST' });
    } catch {
      /* ignore network failure on logout */
    }
  }
  await clearToken();
  setApiToken(null);
}

/**
 * Called at app boot. If a token is in secure storage and still valid,
 * returns the user; otherwise returns null and clears local state.
 */
export async function bootstrapAuth(): Promise<AuthUser | null> {
  if (shouldUseMocks()) return null;

  const token = await loadToken();
  if (!token) return null;
  setApiToken(token);
  try {
    const apiClient = getApiClient();
    const data = await apiClient<MeResponse>('/api/mobile/me');
    return adaptUser(data.user);
  } catch {
    await clearToken();
    setApiToken(null);
    return null;
  }
}
