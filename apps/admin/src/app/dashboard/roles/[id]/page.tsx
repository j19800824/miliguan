import { notFound } from 'next/navigation';
import { RolePermissionEditor } from '@/features/admin/components/role-permission-editor';
import { requirePermission } from '@/lib/auth/server';
import { getRoleDetail, getRolePermissionMatrix } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 角色权限分配'
};

export default async function RolePermissionPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('roles:grant');
  const { id } = await params;
  const role = await getRoleDetail(id);

  if (!role) {
    notFound();
  }

  const permissions = await getRolePermissionMatrix(id);

  return <RolePermissionEditor role={role} permissions={permissions} />;
}
