import { NextResponse } from 'next/server';
import { deleteRecord, initializeDatabase, updateRecord } from '@/lib/database.js';
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
  stores: { write: 'company-stores:edit' },
  staff: { write: 'staff:edit' },
  members: { write: 'members:edit' },
  roles: { write: 'roles:edit' },
  permissions: { write: 'permissions:edit' },
  categories: { write: 'categories:edit' },
  products: { write: 'products:edit' },
  companies: { write: 'companies:edit' },
  inventory: { write: 'inventory:edit' },
  'purchase-orders': { write: 'purchase-orders:edit' },
  'member-orders': { write: 'member-orders:edit' }
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

export async function PUT(
  request: Request,
  context: { params: Promise<{ resource: string; id: string }> }
) {
  initializeDatabase();
  const authUser = await getAdminSession();
  return auditRoute(request, {
    module: 'admin-resource',
    action: '更新资源',
    operator: authUser,
    handler: async () => {
      const { resource, id } = await context.params;

      if (!validResources.has(resource)) {
        return NextResponse.json({ message: '不支持的资源类型' }, { status: 404 });
      }
      const resourceKey = resource as ResourceKey;

      const authResult = await authorize(resourcePermissions[resourceKey].write);
      if (authResult instanceof NextResponse) return authResult;

      if (resource === 'products') {
        return NextResponse.json({ message: 'SPU 创建后不允许修改基础信息' }, { status: 400 });
      }

      try {
        const payload = await request.json();
        const result = await updateRecord(resource, id, payload, authResult.name ?? authResult.account ?? '后台用户', authResult);
        return NextResponse.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '更新失败，请检查提交内容';
        return NextResponse.json({ message, fieldErrors: inferFieldErrors(message) }, { status: 400 });
      }
    }
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ resource: string; id: string }> }
) {
  initializeDatabase();
  const authUser = await getAdminSession();
  return auditRoute(_request, {
    module: 'admin-resource',
    action: '删除资源',
    operator: authUser,
    handler: async () => {
      const { resource, id } = await context.params;

      if (!validResources.has(resource)) {
        return NextResponse.json({ message: '不支持的资源类型' }, { status: 404 });
      }
      const resourceKey = resource as ResourceKey;

      const authResult = await authorize(resourcePermissions[resourceKey].write);
      if (authResult instanceof NextResponse) return authResult;

      try {
        const result = await deleteRecord(resource, id, authResult.name ?? authResult.account ?? '后台用户', authResult);
        return NextResponse.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '删除失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
