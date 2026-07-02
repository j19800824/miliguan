'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { cn } from '@/lib/utils';
import { readApiError, type FieldErrors } from '@/lib/form-errors';
import type { ManagementConfig, MetricCard } from '../data/management-data';
import { PaginationFooter } from './pagination-footer';
import { PurchaseOrderApproveActions } from './purchase-order-approve-actions';
import { StatusBadge } from './status-badge';

type DataRow = Record<string, string | number | null | undefined> & { id: string };

type PurchaseOrderItemDraft = {
  sku_id: string;
  quantity: string;
};

function formatCellValue(type: string | undefined, value: string | number | null | undefined) {
  if (type === 'badge') {
    return <StatusBadge status={value} />;
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
  rows,
  total,
  page,
  pageSize,
  initialSearch = '',
  initialFilter = 'all',
  metrics,
  canWrite = true,
  canGrant = false,
  canApprovePurchaseOrders = false,
  currentUserId,
  extraPageHeaderAction,
  listDescription = '当前数据直接来自 PostgreSQL 数据库，可新增、编辑和删除。',
  dialogDescription = '保存后会直接写入本地数据库。'
}: {
  config: ManagementConfig;
  rows: DataRow[];
  total: number;
  page: number;
  pageSize: number;
  initialSearch?: string;
  initialFilter?: string;
  metrics: MetricCard[];
  canWrite?: boolean;
  canGrant?: boolean;
  canApprovePurchaseOrders?: boolean;
  currentUserId?: string;
  extraPageHeaderAction?: React.ReactNode;
  listDescription?: string;
  dialogDescription?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState(initialFilter);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DataRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DataRow | null>(null);
  const [formData, setFormData] = useState<Record<string, string | number>>(buildEmptyForm(config));
  const [purchaseItems, setPurchaseItems] = useState<PurchaseOrderItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  useEffect(() => {
    setFormData(buildEmptyForm(config));
  }, [config]);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const filterParamName =
    config.entity === 'staff'
      ? 'role'
      : config.entity === 'roles'
        ? 'scope'
        : config.entity === 'permissions'
          ? 'level'
          : 'status';

  const updateQuery = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '' || value === 'all') {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== initialSearch) {
        updateQuery({ search, page: 1 });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, initialSearch]);

  useEffect(() => {
    if (filter !== initialFilter) {
      updateQuery({ [filterParamName]: filter, page: 1 });
    }
  }, [filter, initialFilter, filterParamName]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openCreate = () => {
    setEditingRow(null);
    setFormData(buildEmptyForm(config));
    setFieldErrors({});
    setFormError('');
    setPurchaseItems(
      config.entity === 'purchase-orders'
        ? [{ sku_id: config.purchaseSkuOptions?.[0]?.value ?? '', quantity: '1' }]
        : []
    );
    setIsDialogOpen(true);
  };

  const openEdit = (row: DataRow) => {
    setEditingRow(row);
    setFieldErrors({});
    setFormError('');
    const nextForm = Object.fromEntries(
      config.fields.map((field) => [field.name, String(row[field.name] ?? '')])
    );
    setFormData(nextForm);
    setPurchaseItems([]);
    setIsDialogOpen(true);
  };

  const selectedCompany = useMemo(
    () => config.fields.find((field) => field.name === 'company_id')?.options?.find((option) => option.value === String(formData.company_id)),
    [config.fields, formData.company_id]
  );

  const purchaseOrderQuotaTotal = useMemo(() => {
    return purchaseItems.reduce((sum, item) => {
      const sku = config.purchaseSkuOptions?.find((option) => option.value === item.sku_id);
      return sum + Number(item.quantity || 0) * Number(sku?.orderQuotaPrice ?? 0);
    }, 0);
  }, [config.purchaseSkuOptions, purchaseItems]);

  const selectedCompanyQuota = Number(selectedCompany?.availableOrderQuota ?? 0);
  const purchaseQuotaInsufficient =
    config.entity === 'purchase-orders' &&
    Number.isFinite(selectedCompanyQuota) &&
    purchaseOrderQuotaTotal > selectedCompanyQuota;

  const formatQuota = (value: number) =>
    new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Number(value || 0));

  const submitForm = async () => {
    const nextErrors: FieldErrors = {};
    for (const field of config.fields) {
      if (field.required && String(formData[field.name] ?? '').trim() === '') {
        nextErrors[field.name] = `请填写${field.label}`;
      }
    }
    if (config.entity === 'purchase-orders' && !editingRow) {
      if (purchaseItems.length === 0) {
        nextErrors.items = '请至少添加一个 SKU';
      }
      purchaseItems.forEach((item, index) => {
        if (!item.sku_id) nextErrors[`items.${index}.sku_id`] = '请选择 SKU';
        if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
          nextErrors[`items.${index}.quantity`] = '订货数量必须是大于 0 的整数';
        }
      });
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      const message = Object.values(nextErrors)[0] ?? '请检查表单字段';
      setFormError(message);
      toast.error(message);
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setFormError('');
    const method = editingRow ? 'PUT' : 'POST';
    const url = editingRow
      ? `/api/admin/${config.entity}/${editingRow.id}`
      : `/api/admin/${config.entity}`;

    const payload =
      config.entity === 'purchase-orders' && !editingRow
        ? { ...formData, items: purchaseItems }
        : formData;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const error = await readApiError(response, '保存失败');
      setFieldErrors(error.fieldErrors ?? {});
      setFormError(error.message ?? '保存失败');
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
    if (!window.confirm(`确认为 ${row.name} 生成新的随机密码，并短信通知对方吗？`)) {
      return;
    }

    setIsSubmitting(true);
    const response = await fetch(`/api/admin/staff/${row.id}/reset-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '重置密码失败' }));
      toast.error(error.message ?? '重置密码失败');
      return;
    }

    const body = await response.json().catch(() => ({} as { message?: string }));
    toast.success(body.message ?? `已重置 ${row.name} 的密码`);
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
          {extraPageHeaderAction}
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
              <Badge variant='outline'>共 {total} 条</Badge>
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
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={config.columns.length + 1} className='text-muted-foreground py-10 text-center'>
                        暂无符合条件的数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
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
                            {config.entity === 'purchase-orders' && row.approval_status === '待审核' ? (
                              canApprovePurchaseOrders ? (
                                <PurchaseOrderApproveActions orderId={String(row.id)} compact />
                              ) : (
                                <DisabledActionButton
                                  label='审核'
                                  reason='当前账号缺少 purchase-orders:approve 权限，不能审核订货单。'
                                  variant='secondary'
                                />
                              )
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
                            {canWrite && config.entity !== 'staff' && config.entity !== 'products' ? (
                              <Button variant='outline' size='sm' onClick={() => openEdit(row)}>
                                编辑
                              </Button>
                            ) : config.entity === 'products' ? (
                              <DisabledActionButton
                                label='编辑'
                                reason='SPU 创建后基础信息不允许修改。'
                              />
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
                                提交删除申请
                              </Button>
                            ) : (
                              <DisabledActionButton
                                label='提交删除申请'
                                reason='当前账号没有编辑权限，无法提交删除申请。'
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
            <PaginationFooter
              total={total}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={(nextPage) => updateQuery({ page: nextPage })}
              onPageSizeChange={(nextPageSize) => updateQuery({ pageSize: nextPageSize, page: 1 })}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen && canWrite} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className={
            config.entity === 'purchase-orders'
              ? 'max-h-[88vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto overflow-x-hidden'
              : 'max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto overflow-x-hidden'
          }
        >
          <DialogHeader>
            <DialogTitle>{editingRow ? `编辑${config.title}` : `新增${config.title}`}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            {formError ? (
              <div className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                {formError}
              </div>
            ) : null}
            {config.entity === 'purchase-orders' && !editingRow ? (
              <div className='rounded-lg border p-4'>
                <div className='mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
                  <div>
                    <p className='font-medium'>订货 SKU 明细</p>
                    <p className='text-muted-foreground text-sm'>后台只支持分公司向总公司订货，订货单号保存时自动生成。</p>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setPurchaseItems((prev) => [
                        ...prev,
                        { sku_id: config.purchaseSkuOptions?.[0]?.value ?? '', quantity: '1' }
                      ])
                    }
                  >
                    添加 SKU
                  </Button>
                </div>
                <div className='space-y-3'>
                  {purchaseItems.map((item, index) => {
                    const sku = config.purchaseSkuOptions?.find((option) => option.value === item.sku_id);
                    const subtotal = Number(item.quantity || 0) * Number(sku?.orderQuotaPrice ?? 0);
                    return (
                      <div key={`${index}-${item.sku_id}`} className='rounded-lg border bg-background/60 p-3'>
                        <div className='grid gap-3'>
                          <div className='grid gap-2'>
                            <Label>SKU</Label>
                            <Select
                              value={item.sku_id}
                              onValueChange={(value) =>
                                setPurchaseItems((prev) =>
                                  prev.map((row, rowIndex) => rowIndex === index ? { ...row, sku_id: value } : row)
                                )
                              }
                            >
                              <SelectTrigger className={cn('w-full', fieldErrors[`items.${index}.sku_id`] && 'border-destructive ring-destructive/30')}>
                                <SelectValue placeholder='请选择 SKU' />
                              </SelectTrigger>
                              <SelectContent>
                                {config.purchaseSkuOptions?.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {fieldErrors[`items.${index}.sku_id`] ? (
                              <p className='text-xs text-destructive'>{fieldErrors[`items.${index}.sku_id`]}</p>
                            ) : null}
                          </div>
                          <div className='grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end'>
                            <div className='grid gap-2'>
                              <Label>订货数量</Label>
                              <Input
                                type='number'
                                min='1'
                                value={item.quantity}
                                className={cn(fieldErrors[`items.${index}.quantity`] && 'border-destructive ring-destructive/30')}
                                onChange={(event) =>
                                  setPurchaseItems((prev) =>
                                    prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row)
                                  )
                                }
                              />
                              {fieldErrors[`items.${index}.quantity`] ? (
                                <p className='text-xs text-destructive'>{fieldErrors[`items.${index}.quantity`]}</p>
                              ) : null}
                            </div>
                            <div className='grid gap-2'>
                              <Label>消耗订货额</Label>
                              <div className='rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium'>
                                {formatQuota(subtotal)}
                              </div>
                            </div>
                            <Button
                              type='button'
                              variant='outline'
                              className='w-full sm:w-auto'
                              disabled={purchaseItems.length <= 1}
                              onClick={() => setPurchaseItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className='mt-4 grid gap-2 rounded-md bg-muted/40 p-3 text-sm md:grid-cols-3'>
                  <div>
                    <span className='text-muted-foreground'>分公司剩余额度：</span>
                    <strong>{formatQuota(selectedCompanyQuota)}</strong>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>本单消耗额度：</span>
                    <strong>{formatQuota(purchaseOrderQuotaTotal)}</strong>
                  </div>
                  <div className={purchaseQuotaInsufficient ? 'text-destructive' : 'text-muted-foreground'}>
                    {purchaseQuotaInsufficient ? '额度不足，提交后会进入待审核。' : '额度充足，可自动通过。'}
                  </div>
                </div>
              </div>
            ) : null}
            {config.fields.map((field) => {
              const selectedCompanyId = String(formData.company_id ?? 'none');
              const options =
                field.name === 'store_id' && field.options?.some((option) => option.companyId)
                  ? field.options.filter((option) => option.value === 'none' || (selectedCompanyId !== 'none' && option.companyId === selectedCompanyId))
                  : field.options;

              return (
                <div key={field.name} className='grid gap-2'>
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={field.name}
                      value={String(formData[field.name] ?? '')}
                      className={cn(fieldErrors[field.name] && 'border-destructive ring-destructive/30')}
                      onChange={(event) =>
                        setFormData((prev) => {
                          setFieldErrors((errors) => {
                            const { [field.name]: _ignored, ...rest } = errors;
                            return rest;
                          });
                          return { ...prev, [field.name]: event.target.value };
                        })
                      }
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      value={String(formData[field.name] ?? '')}
                      onValueChange={(value) =>
                        setFormData((prev) => {
                          setFieldErrors((errors) => {
                            if (field.name === 'company_id') {
                              const { company_id: _companyIgnored, store_id: _storeIgnored, ...rest } = errors;
                              return rest;
                            }
                            const { [field.name]: _ignored, ...rest } = errors;
                            return rest;
                          });
                          const next = { ...prev, [field.name]: value };
                          if (field.name === 'company_id') {
                            const storeField = config.fields.find((item) => item.name === 'store_id');
                            const selectedStore = storeField?.options?.find((option) => option.value === String(prev.store_id ?? 'none'));
                            if (value === 'none' || (selectedStore?.companyId && selectedStore.companyId !== value)) {
                              next.store_id = 'none';
                            }
                          }
                          return next;
                        })
                      }
                      disabled={field.name === 'store_id' && selectedCompanyId === 'none'}
                    >
                      <SelectTrigger className={cn(fieldErrors[field.name] && 'border-destructive ring-destructive/30')}>
                        <SelectValue placeholder={`请选择${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {options?.map((option) => (
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
                      className={cn(fieldErrors[field.name] && 'border-destructive ring-destructive/30')}
                      onChange={(event) =>
                        setFormData((prev) => {
                          setFieldErrors((errors) => {
                            const { [field.name]: _ignored, ...rest } = errors;
                            return rest;
                          });
                          return { ...prev, [field.name]: event.target.value };
                        })
                      }
                    />
                  )}
                  {fieldErrors[field.name] ? (
                    <p className='text-xs text-destructive'>{fieldErrors[field.name]}</p>
                  ) : null}
                </div>
              );
            })}
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
            <AlertDialogTitle>确认提交删除申请</AlertDialogTitle>
            <AlertDialogDescription>
              提交后需要审核通过，这条记录才会被标记为已删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : '确认提交'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
