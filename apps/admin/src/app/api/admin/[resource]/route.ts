import { NextResponse } from 'next/server';
import { createRecord, getResourceRows, initializeDatabase } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

const validResources = new Set([
  'stores',
  'staff',
  'members',
  'roles',
  'permissions',
  'categories',
  'products',
  'companies',
  'inventory',
  'purchase-orders',
  'member-orders'
]);
const resourcePermissions = {
  stores: { view: 'company-stores:view', write: 'company-stores:edit' },
  staff: { view: 'staff:view', write: 'staff:edit' },
  members: { view: 'members:view', write: 'members:edit' },
  roles: { view: 'roles:view', write: 'roles:edit' },
  permissions: { view: 'permissions:view', write: 'permissions:edit' },
  categories: { view: 'categories:view', write: 'categories:edit' },
  products: { view: 'products:view', write: 'products:edit' },
  companies: { view: 'companies:view', write: 'companies:edit' },
  inventory: { view: 'inventory:view', write: 'inventory:edit' },
  'purchase-orders': { view: 'purchase-orders:view', write: 'purchase-orders:edit' },
  'member-orders': { view: 'member-orders:view', write: 'member-orders:edit' }
} as const;
type ResourceKey = keyof typeof resourcePermissions;

async function authorize(permission: string) {
  const user = await getAdminSession();

  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (!hasPermission(user, permission)) {
    return NextResponse.json({ message: '当前账号无权限执行此操作' }, { status: 403 });
  }

  return user;
}

function normalizeFilters(resource: string, searchParams: URLSearchParams) {
  const search = searchParams.get('search') ?? '';

  switch (resource) {
    case 'stores':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'staff':
      return { search, role: searchParams.get('role') ?? 'all' };
    case 'members':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'roles':
      return { search, scope: searchParams.get('scope') ?? 'all' };
    case 'permissions':
      return { search, level: searchParams.get('level') ?? 'all' };
    case 'categories':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'products':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'companies':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'inventory':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'purchase-orders':
      return { search, status: searchParams.get('status') ?? 'all' };
    case 'member-orders':
      return { search, status: searchParams.get('status') ?? 'all' };
    default:
      return { search };
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ resource: string }> }
) {
  initializeDatabase();
  const { resource } = await context.params;

  if (!validResources.has(resource)) {
    return NextResponse.json({ message: '不支持的资源类型' }, { status: 404 });
  }
  const resourceKey = resource as ResourceKey;

  const authResult = await authorize(resourcePermissions[resourceKey].view);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const rows = await getResourceRows(resource, normalizeFilters(resource, searchParams));

  return NextResponse.json({ rows });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ resource: string }> }
) {
  initializeDatabase();
  const { resource } = await context.params;

  if (!validResources.has(resource)) {
    return NextResponse.json({ message: '不支持的资源类型' }, { status: 404 });
  }
  const resourceKey = resource as ResourceKey;

  const authResult = await authorize(resourcePermissions[resourceKey].write);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const payload = await request.json();
    const result = await createRecord(resource, payload, authResult.name ?? authResult.account ?? '后台用户');
    return NextResponse.json({ id: String(result.id), message: result.message }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '创建失败，请检查字段是否完整或是否存在重复值';
    return NextResponse.json({ message }, { status: 400 });
  }
}
