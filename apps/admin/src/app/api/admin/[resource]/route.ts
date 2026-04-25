import { NextResponse } from 'next/server';
import { createRecord, getResourceRows, initializeDatabase } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { inferFieldErrors } from '@/lib/form-errors';

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
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');

  switch (resource) {
    case 'stores':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'staff':
      return { search, role: searchParams.get('role') ?? 'all', page, pageSize };
    case 'members':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'roles':
      return { search, scope: searchParams.get('scope') ?? 'all', page, pageSize };
    case 'permissions':
      return { search, level: searchParams.get('level') ?? 'all', page, pageSize };
    case 'categories':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'products':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'companies':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'inventory':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'purchase-orders':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    case 'member-orders':
      return { search, status: searchParams.get('status') ?? 'all', page, pageSize };
    default:
      return { search, page, pageSize };
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ resource: string }> }
) {
  initializeDatabase();
  const authUser = await getAdminSession();
  return auditRoute(request, {
    module: 'admin-resource',
    action: '查询资源',
    operator: authUser,
    handler: async () => {
      const { resource } = await context.params;

      if (!validResources.has(resource)) {
        return NextResponse.json({ message: '不支持的资源类型' }, { status: 404 });
      }
      const resourceKey = resource as ResourceKey;

      const authResult = await authorize(resourcePermissions[resourceKey].view);
      if (authResult instanceof NextResponse) return authResult;

      const { searchParams } = new URL(request.url);
      const result = await getResourceRows(resource, { ...normalizeFilters(resource, searchParams), user: authResult });

      return NextResponse.json(result);
    }
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ resource: string }> }
) {
  initializeDatabase();
  const authUser = await getAdminSession();
  return auditRoute(request, {
    module: 'admin-resource',
    action: '创建资源',
    operator: authUser,
    handler: async () => {
      const { resource } = await context.params;

      if (!validResources.has(resource)) {
        return NextResponse.json({ message: '不支持的资源类型' }, { status: 404 });
      }
      const resourceKey = resource as ResourceKey;

      const authResult = await authorize(resourcePermissions[resourceKey].write);
      if (authResult instanceof NextResponse) return authResult;

      try {
        const payload = await request.json();
        const result = await createRecord(resource, payload, authResult.name ?? authResult.account ?? '后台用户', authResult);
        return NextResponse.json({ id: String(result.id), message: result.message }, { status: 201 });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '创建失败，请检查字段是否完整或是否存在重复值';
        return NextResponse.json({ message, fieldErrors: inferFieldErrors(message) }, { status: 400 });
      }
    }
  });
}
