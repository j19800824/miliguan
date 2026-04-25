export const ADMIN_SESSION_COOKIE = 'miliguan_admin_session';

export const DEMO_CREDENTIALS = {
  account: 'admin',
  password: 'admin123'
};

export const SECONDARY_CREDENTIALS = [
  { account: 'operator', password: 'operator123', label: '平台运营' },
  { account: 'auditor', password: 'auditor123', label: '总部审核员' },
  { account: 'product', password: 'product123', label: '商品管理员' },
  { account: 'branch', password: 'branch123', label: '分公司管理员' },
  { account: 'boss', password: 'boss123', label: '老板视图账号' }
];

export type AdminSessionUser = {
  id: string;
  name: string;
  fullName: string;
  email: string;
  account: string;
  department: string;
  roleId: string;
  roleName: string;
  roleScope: string;
  dataScope: AdminDataScope;
  companyId: string;
  storeId: string;
  permissions: string[];
};

export type AdminDataScope = 'all' | 'company' | 'store';

export function getAdminDataScope(user: Pick<AdminSessionUser, 'roleScope' | 'companyId' | 'storeId'> | null): AdminDataScope {
  if (!user) return 'all';
  const roleScope = user.roleScope || '';
  if (!user.companyId || ['总部', '总公司', '平台', '系统'].includes(roleScope)) {
    return 'all';
  }
  return user.storeId ? 'store' : 'company';
}

export function isHeadquartersUser(user: Pick<AdminSessionUser, 'roleScope' | 'companyId' | 'storeId'> | null) {
  return getAdminDataScope(user) === 'all';
}

export function isBranchUser(user: Pick<AdminSessionUser, 'roleScope' | 'companyId' | 'storeId'> | null) {
  return getAdminDataScope(user) === 'company';
}

export const ADMIN_IDLE_MAX_AGE = 60 * 60;
