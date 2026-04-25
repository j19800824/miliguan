import { notFound } from 'next/navigation';
import { RolePermissionEditor } from '@/features/admin/components/role-permission-editor';
import { requirePermission } from '@/lib/auth/server';
import { getRoleDetail, getRolePermissionMatrix } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 角色权限分配'
};

export default async function RolePermissionPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('roles:grant');
  const { id } = await params;
  const paramsState = await searchParams;
  const page = Number(Array.isArray(paramsState.page) ? paramsState.page[0] : paramsState.page ?? '1');
  const pageSize = Number(Array.isArray(paramsState.pageSize) ? paramsState.pageSize[0] : paramsState.pageSize ?? '10');
  const role = await getRoleDetail(id);

  if (!role) {
    notFound();
  }

  const permissions = await getRolePermissionMatrix(id, { page, pageSize });

  return <RolePermissionEditor role={role} permissions={permissions} />;
}
