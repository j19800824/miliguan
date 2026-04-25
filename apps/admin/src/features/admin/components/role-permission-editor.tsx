'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ClientPaginatedItems } from './client-paginated-items';
import { StatusBadge } from './status-badge';

type PermissionRow = {
  id: string;
  module: string;
  permission_name: string;
  code: string;
  level: string;
  status: string;
  assigned: boolean;
};

type RoleDetail = {
  id: string;
  role_name: string;
  scope: string;
  status: string;
  description: string;
};

export function RolePermissionEditor({
  role,
  permissions
}: {
  role: RoleDetail;
  permissions: {
    rows: PermissionRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    permissions.rows.filter((item) => item.assigned).map((item) => item.id)
  );
  const [isPending, startTransition] = useTransition();
  const groupedPermissions = useMemo(() => {
    return permissions.rows.reduce<Record<string, PermissionRow[]>>((accumulator, permission) => {
      accumulator[permission.module] ??= [];
      accumulator[permission.module].push(permission);
      return accumulator;
    }, {});
  }, [permissions.rows]);

  const togglePermission = (permissionId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, permissionId] : prev.filter((item) => item !== permissionId)
    );
  };

  const savePermissions = () => {
    startTransition(async () => {
      const response = await fetch(`/api/admin/roles/${role.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permissionIds: selectedIds })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({ message: '保存失败' }))) as {
          message?: string;
        };
        alert(body.message ?? '保存失败');
        return;
      }

      alert('角色权限已保存');
    });
  };

  return (
    <PageContainer
      pageTitle={`${role.role_name} 权限分配`}
      pageDescription='勾选后会直接更新角色与权限点的关联关系。'
      pageHeaderAction={
        <div className='flex items-center gap-2'>
          <Button variant='outline' asChild>
            <Link href='/dashboard/roles'>返回角色列表</Link>
          </Button>
          <Button onClick={savePermissions} disabled={isPending}>
            {isPending ? '保存中...' : '保存权限'}
          </Button>
        </div>
      }
    >
      <div className='grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>{role.role_name}</CardTitle>
            <CardDescription>{role.description}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>适用范围</span>
              <Badge variant='outline'>{role.scope}</Badge>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>状态</span>
              <StatusBadge status={role.status} />
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>已选权限</span>
              <Badge>{selectedIds.length}</Badge>
            </div>
          </CardContent>
        </Card>

        <div className='space-y-4'>
          {Object.entries(groupedPermissions).map(([moduleName, modulePermissions]) => (
            <Card key={moduleName}>
              <CardHeader>
                <CardTitle className='text-base'>{moduleName}</CardTitle>
                <CardDescription>按页面、按钮、数据范围勾选角色能力。</CardDescription>
              </CardHeader>
              <CardContent>
                <ClientPaginatedItems
                  className='grid gap-3'
                  emptyState={<div className='rounded-lg border p-3 text-sm text-muted-foreground'>暂无权限</div>}
                  total={permissions.total}
                  page={permissions.page}
                  pageSize={permissions.pageSize}
                  items={modulePermissions.map((permission) => {
                    const checked = selectedIds.includes(permission.id);
                    return (
                      <label
                        key={permission.id}
                        className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            togglePermission(permission.id, value === true)
                          }
                        />
                        <div className='grid gap-1'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='font-medium'>{permission.permission_name}</span>
                            <Badge variant='outline'>{permission.level}</Badge>
                            <StatusBadge status={permission.status} />
                          </div>
                          <code className='text-muted-foreground text-xs'>{permission.code}</code>
                        </div>
                      </label>
                    );
                  })}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
