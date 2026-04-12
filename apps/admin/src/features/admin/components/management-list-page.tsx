'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ManagementConfig, MetricCard } from '../data/management-data';

type DataRow = Record<string, string | number | null | undefined> & { id: string };

function formatCellValue(type: string | undefined, value: string | number | null | undefined) {
  if (type === 'badge') {
    return <Badge variant='outline'>{String(value ?? '')}</Badge>;
  }

  if (type === 'currency') {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      maximumFractionDigits: 0
    }).format(Number(value ?? 0));
  }

  if (type === 'code') {
    return <code className='text-xs'>{String(value ?? '')}</code>;
  }

  return String(value ?? '');
}

function buildEmptyForm(config: ManagementConfig) {
  const entries = config.fields.map((field) => [
    field.name,
    field.defaultValue ?? (field.type === 'select' ? field.options?.[0]?.value ?? '' : '')
  ]);

  return Object.fromEntries(entries);
}

function DisabledActionButton({
  label,
  reason,
  variant = 'outline'
}: {
  label: string;
  reason: string;
  variant?: 'outline' | 'secondary' | 'destructive';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button size='sm' variant={variant} disabled>
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function ManagementListPage({
  config,
  rows: initialRows,
  metrics,
  canWrite = true,
  canGrant = false,
  currentUserId,
  listDescription = '当前数据直接来自 PostgreSQL 数据库，可新增、编辑和删除。',
  dialogDescription = '保存后会直接写入本地数据库。'
}: {
  config: ManagementConfig;
  rows: DataRow[];
  metrics: MetricCard[];
  canWrite?: boolean;
  canGrant?: boolean;
  currentUserId?: string;
  listDescription?: string;
  dialogDescription?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DataRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DataRow | null>(null);
  const [formData, setFormData] = useState<Record<string, string | number>>(buildEmptyForm(config));
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setFormData(buildEmptyForm(config));
  }, [config]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchKeyword =
        keyword.length === 0 ||
        Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(keyword));

      const filterValue = String(row[config.filterKey] ?? '');
      const matchFilter = filter === 'all' || filterValue === filter;

      return matchKeyword && matchFilter;
    });
  }, [config.filterKey, filter, rows, search]);

  const openCreate = () => {
    setEditingRow(null);
    setFormData(buildEmptyForm(config));
    setIsDialogOpen(true);
  };

  const openEdit = (row: DataRow) => {
    setEditingRow(row);
    const nextForm = Object.fromEntries(
      config.fields.map((field) => [field.name, String(row[field.name] ?? '')])
    );
    setFormData(nextForm);
    setIsDialogOpen(true);
  };

  const submitForm = async () => {
    setIsSubmitting(true);
    const method = editingRow ? 'PUT' : 'POST';
    const url = editingRow
      ? `/api/admin/${config.entity}/${editingRow.id}`
      : `/api/admin/${config.entity}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '保存失败' }));
      toast.error(error.message ?? '保存失败');
      return;
    }

    const body = await response.json().catch(() => ({} as { message?: string }));
    setIsDialogOpen(false);
    toast.success(body.message ?? (editingRow ? '保存成功' : '新增成功'));
    router.refresh();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    setIsSubmitting(true);
    const response = await fetch(`/api/admin/${config.entity}/${pendingDelete.id}`, {
      method: 'DELETE'
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '删除失败' }));
      toast.error(error.message ?? '删除失败');
      return;
    }

    const body = await response.json().catch(() => ({} as { message?: string }));
    setIsDeleteOpen(false);
    setPendingDelete(null);
    toast.success(body.message ?? '删除成功');
    router.refresh();
  };

  const resetStaffPassword = async (row: DataRow) => {
    const nextPassword = window.prompt(`为 ${row.name} 设置新密码`, '');

    if (!nextPassword) {
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(`/api/admin/staff/${row.id}/reset-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: nextPassword })
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '重置密码失败' }));
      toast.error(error.message ?? '重置密码失败');
      return;
    }

    toast.success(`已重置 ${row.name} 的密码`);
    router.refresh();
  };

  const toggleStaffStatus = async (row: DataRow) => {
    const nextStatus = row.status === '停用' ? '在职' : '停用';
    const actionLabel = nextStatus === '停用' ? '停用' : '启用';

    if (!window.confirm(`确认${actionLabel}账号 ${row.name} 吗？`)) {
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(`/api/admin/staff/${row.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: nextStatus })
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `${actionLabel}失败` }));
      toast.error(error.message ?? `${actionLabel}失败`);
      return;
    }

    if (row.id === currentUserId && nextStatus === '停用') {
      await fetch('/api/auth/sign-out', { method: 'POST' });
      toast.success('当前账号已停用，即将退出登录');
      router.replace('/auth/sign-in');
      router.refresh();
      return;
    }

    toast.success(`${row.name} 已${actionLabel}`);
    router.refresh();
  };

  return (
    <PageContainer
      pageTitle={config.title}
      pageDescription={config.description}
      pageHeaderAction={
        <div className='flex items-center gap-2'>
          <Button variant='outline' onClick={() => router.refresh()}>
            刷新
          </Button>
          {canWrite ? (
            <Button onClick={openCreate}>新增</Button>
          ) : (
            <DisabledActionButton label='新增' reason='当前账号没有编辑权限，无法新增记录。' />
          )}
        </div>
      }
    >
      <div className='space-y-4'>
        {metrics.length > 0 ? (
          <div className='grid gap-4 md:grid-cols-3'>
            {metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader className='pb-2'>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className='text-3xl'>{metric.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-muted-foreground text-sm'>{metric.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Card>
          <CardHeader className='gap-3'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <div>
                <CardTitle>管理列表</CardTitle>
                {listDescription ? <CardDescription>{listDescription}</CardDescription> : null}
              </div>
              <Badge variant='outline'>共 {filteredRows.length} 条</Badge>
            </div>
            <div className='flex flex-col gap-3 md:flex-row'>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={config.searchPlaceholder}
                className='md:max-w-sm'
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className='w-full md:w-[220px]'>
                  <SelectValue placeholder={config.filterLabel} />
                </SelectTrigger>
                <SelectContent>
                  {config.filterOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    {config.columns.map((column) => (
                      <TableHead key={column.key} className={column.className}>
                        {column.title}
                      </TableHead>
                    ))}
                    <TableHead className='text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={config.columns.length + 1} className='text-muted-foreground py-10 text-center'>
                        暂无符合条件的数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        {config.columns.map((column) => (
                          <TableCell key={column.key} className={column.className}>
                            {formatCellValue(column.type, row[column.key])}
                          </TableCell>
                        ))}
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            {config.detailBasePath ? (
                              <Button
                                variant='secondary'
                                size='sm'
                                onClick={() => router.push(`${config.detailBasePath}/${row.id}`)}
                              >
                                详情
                              </Button>
                            ) : null}
                            {config.entity === 'roles' && canGrant ? (
                              <Button
                                variant='secondary'
                                size='sm'
                                onClick={() => router.push(`/dashboard/roles/${row.id}`)}
                              >
                                分配权限
                              </Button>
                            ) : config.entity === 'roles' ? (
                              <DisabledActionButton
                                label='分配权限'
                                reason='当前账号缺少 roles:grant 权限，不能调整角色权限。'
                                variant='secondary'
                              />
                            ) : null}
                            {config.entity === 'staff' && canWrite ? (
                              <Button variant='secondary' size='sm' onClick={() => openEdit(row)}>
                                分配角色
                              </Button>
                            ) : config.entity === 'staff' ? (
                              <DisabledActionButton
                                label='分配角色'
                                reason='当前账号没有员工编辑权限，无法调整员工角色。'
                                variant='secondary'
                              />
                            ) : null}
                            {config.entity === 'staff' && canWrite ? (
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() => resetStaffPassword(row)}
                              >
                                重置密码
                              </Button>
                            ) : config.entity === 'staff' ? (
                              <DisabledActionButton
                                label='重置密码'
                                reason='当前账号没有员工编辑权限，无法重置密码。'
                              />
                            ) : null}
                            {config.entity === 'staff' && canWrite ? (
                              <Button
                                size='sm'
                                variant={row.status === '停用' ? 'outline' : 'destructive'}
                                onClick={() => toggleStaffStatus(row)}
                              >
                                {row.status === '停用' ? '启用账号' : '停用账号'}
                              </Button>
                            ) : config.entity === 'staff' ? (
                              <DisabledActionButton
                                label={row.status === '停用' ? '启用账号' : '停用账号'}
                                reason='当前账号没有员工编辑权限，无法调整账号状态。'
                                variant={row.status === '停用' ? 'outline' : 'destructive'}
                              />
                            ) : null}
                            {canWrite && config.entity !== 'staff' ? (
                              <Button variant='outline' size='sm' onClick={() => openEdit(row)}>
                                编辑
                              </Button>
                            ) : config.entity !== 'staff' ? (
                              <DisabledActionButton
                                label='编辑'
                                reason='当前账号没有编辑权限，无法修改这条记录。'
                              />
                            ) : null}
                            {canWrite ? (
                              <Button
                                size='sm'
                                variant='destructive'
                                onClick={() => {
                                  setPendingDelete(row);
                                  setIsDeleteOpen(true);
                                }}
                              >
                                删除
                              </Button>
                            ) : (
                              <DisabledActionButton
                                label='删除'
                                reason='当前账号没有编辑权限，无法删除这条记录。'
                                variant='destructive'
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen && canWrite} onOpenChange={setIsDialogOpen}>
        <DialogContent className='max-h-[85vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{editingRow ? `编辑${config.title}` : `新增${config.title}`}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            {config.fields.map((field) => (
              <div key={field.name} className='grid gap-2'>
                <Label htmlFor={field.name}>{field.label}</Label>
                {field.type === 'textarea' ? (
                  <Textarea
                    id={field.name}
                    value={String(formData[field.name] ?? '')}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, [field.name]: event.target.value }))
                    }
                  />
                ) : field.type === 'select' ? (
                  <Select
                    value={String(formData[field.name] ?? '')}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, [field.name]: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`请选择${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    value={String(formData[field.name] ?? '')}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, [field.name]: event.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitForm} disabled={isSubmitting}>
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen && canWrite} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，这条记录会从本地数据库中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isSubmitting}>
              {isSubmitting ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
