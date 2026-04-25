import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { getCompanyDetail } from '@/lib/database.js';
import { CompanyDetailActions } from '@/features/admin/components/company-detail-actions';
import { StatusBadge } from '@/features/admin/components/status-badge';

export const metadata = {
  title: '米粒冠后台 - 分公司详情'
};

function buildAdjustmentSummary(
  row: {
    adjustment_type: string;
    change_type: string;
    order_quota_amount: number;
    expires_at: string;
    target_company_level: string;
    source_order_no: string;
    source_order_type?: string;
    status: string;
  }
) {
  if (row.adjustment_type === '临时额度调整') {
    return `临时${row.change_type} ${row.order_quota_amount}，回调日期：${row.expires_at || '未设置'}`;
  }
  if (row.adjustment_type === '等级调整') {
    return `审批通过后按 ${row.target_company_level || '未设置'} 自动重算订货额度`;
  }
  return `${row.source_order_type || '订单'} ${row.source_order_no || '未关联'} 完成退货，自动回补 ${row.order_quota_amount}`;
}

function buildPageHref(
  id: string,
  currentParams: Record<string, string | undefined>,
  section: 'stores' | 'adjustments' | 'inventory' | 'purchaseOrders' | 'memberOrders',
  page: number
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(currentParams)) {
    if (value) params.set(key, value);
  }
  params.set(`${section}Page`, String(page));
  return `/dashboard/companies/${id}?${params.toString()}`;
}

function SectionPagination({
  companyId,
  currentParams,
  section,
  page,
  totalPages,
  total
}: {
  companyId: string;
  currentParams: Record<string, string | undefined>;
  section: 'stores' | 'adjustments' | 'inventory' | 'purchaseOrders' | 'memberOrders';
  page: number;
  totalPages: number;
  total: number;
}) {
  return (
    <div className='mt-4 flex items-center justify-between text-sm text-muted-foreground'>
      <span>共 {total} 条，第 {page} / {totalPages} 页</span>
      <div className='flex items-center gap-2'>
        <Link
          className={`rounded border px-3 py-1 ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`}
          href={buildPageHref(companyId, currentParams, section, Math.max(1, page - 1))}
        >
          上一页
        </Link>
        <Link
          className={`rounded border px-3 py-1 ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`}
          href={buildPageHref(companyId, currentParams, section, Math.min(totalPages, page + 1))}
        >
          下一页
        </Link>
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default async function CompanyDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('companies:view');
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const currentParams = Object.fromEntries(
    Object.entries(resolvedSearchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
  const company = await getCompanyDetail(id, {
    storesPage: Number(currentParams.storesPage ?? '1'),
    adjustmentsPage: Number(currentParams.adjustmentsPage ?? '1'),
    inventoryPage: Number(currentParams.inventoryPage ?? '1'),
    purchaseOrdersPage: Number(currentParams.purchaseOrdersPage ?? '1'),
    memberOrdersPage: Number(currentParams.memberOrdersPage ?? '1'),
    pageSize: 10
  }, user);

  if (!company) {
    return (
      <PageContainer pageTitle='分公司详情' pageDescription='未找到该分公司'>
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            该分公司不存在或已被删除，返回 <Link href='/dashboard/companies'>分公司列表</Link> 查看其他记录。
          </CardContent>
        </Card>
      </PageContainer>
    );
  }
  return (
    <PageContainer
      pageTitle={`${company.name} / 分公司详情`}
      pageDescription='分公司经营首页，查看订货额度、库存、门店和订单流转。'
      pageHeaderAction={
        <CompanyDetailActions
          companyId={company.id}
          canEditCompanyStores={hasPermission(user, 'company-stores:edit') && company.delete_status !== '已删除'}
        />
      }
    >
      <div className='space-y-4'>
        {company.delete_status === '已删除' ? (
          <div className='flex justify-start'>
            <Badge variant='destructive'>已删除</Badge>
          </div>
        ) : null}
        <div className='grid gap-4 lg:grid-cols-4'>
          <Card className='lg:col-span-2'>
            <CardHeader>
              <CardDescription>分公司档案</CardDescription>
              <CardTitle className='text-3xl'>{company.name}</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 text-sm text-muted-foreground sm:grid-cols-2'>
              <div>编码：<span className='text-foreground'>{company.code}</span></div>
              <div>等级：<span className='text-foreground'>{company.company_level}</span></div>
              <div>负责人：<span className='text-foreground'>{company.manager_name}</span></div>
              <div>联系电话：<span className='text-foreground'>{company.contact_phone}</span></div>
              <div>状态：<StatusBadge status={company.status} /></div>
            </CardContent>
          </Card>
          <Card><CardHeader><CardDescription>可用订货额</CardDescription><CardTitle>{formatNumber(company.available_order_quota)}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>可继续向总部订货的额度</CardContent></Card>
          <Card><CardHeader><CardDescription>总订货额</CardDescription><CardTitle>{formatNumber(company.total_order_quota)}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>等级额度 + 临时额度 + 回补额度</CardContent></Card>
          <Card><CardHeader><CardDescription>已用订货额</CardDescription><CardTitle>{formatNumber(company.used_order_quota)}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>已创建并扣减的分公司订货单</CardContent></Card>
          <Card><CardHeader><CardDescription>库存总量</CardDescription><CardTitle>{formatNumber(company.inventory_quantity_total)}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>当前分公司库存 SKU 数量合计</CardContent></Card>
          <Card><CardHeader><CardDescription>库存金额</CardDescription><CardTitle>{formatNumber(company.inventory_amount_total)}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>按 SKU 订货额度价估算</CardContent></Card>
          <Card><CardHeader><CardDescription>门店数量</CardDescription><CardTitle>{company.stores.total}</CardTitle></CardHeader><CardContent className='text-sm text-muted-foreground'>当前分公司下属门店</CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>分公司说明</CardTitle>
            <CardDescription>{company.notes}</CardDescription>
          </CardHeader>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>门店列表</CardTitle>
              <CardDescription>当前分公司下属社区门店与负责人信息。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>门店名称</TableHead>
                      <TableHead>编码</TableHead>
                      <TableHead>负责人</TableHead>
                      <TableHead>负责人电话</TableHead>
                      <TableHead>可用订货额</TableHead>
                      <TableHead>累计订货额度</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.stores.rows.map((row: (typeof company.stores.rows)[number], index: number) => (
                      <TableRow key={`${row.id}-${row.code}-${index}`}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.code}</TableCell>
                        <TableCell>{row.manager_name}</TableCell>
                        <TableCell>{row.manager_phone}</TableCell>
                        <TableCell>{row.available_order_quota}</TableCell>
                        <TableCell>{row.total_order_quota}</TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <SectionPagination
                companyId={company.id}
                currentParams={currentParams}
                section='stores'
                page={company.stores.page}
                totalPages={company.stores.totalPages}
                total={company.stores.total}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>订货额调整申请</CardTitle>
              <CardDescription>总部给分公司增加或扣减订货额的历史记录。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>变更类型</TableHead>
                      <TableHead>调整途径</TableHead>
                      <TableHead>订货额</TableHead>
                      <TableHead>补充信息</TableHead>
                      <TableHead>执行说明</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>原因</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.orderQuotaAdjustments.rows.map((row: (typeof company.orderQuotaAdjustments.rows)[number], index: number) => (
                      <TableRow key={`${row.id}-${row.created_at}-${index}`}>
                        <TableCell>{row.change_type}</TableCell>
                        <TableCell>{row.adjustment_type}</TableCell>
                        <TableCell>{row.order_quota_amount}</TableCell>
                        <TableCell className='max-w-[220px] whitespace-normal text-sm text-muted-foreground'>
                          {row.adjustment_type === '临时额度调整'
                            ? `回调日期：${row.expires_at || '未设置'}`
                            : row.adjustment_type === '等级调整'
                              ? `目标等级：${row.target_company_level || '未设置'}`
                              : `${row.source_order_type || '退货订单'}：${row.source_order_no || '未关联'}`}
                        </TableCell>
                        <TableCell className='max-w-[260px] whitespace-normal text-sm text-muted-foreground'>
                          {buildAdjustmentSummary(row)}
                        </TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                        <TableCell>{row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <SectionPagination
                companyId={company.id}
                currentParams={currentParams}
                section='adjustments'
                page={company.orderQuotaAdjustments.page}
                totalPages={company.orderQuotaAdjustments.totalPages}
                total={company.orderQuotaAdjustments.total}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>库存概况</CardTitle>
            <CardDescription>分公司维度库存，一期不记录门店精细库存。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>规格</TableHead>
                    <TableHead>库存数</TableHead>
                    <TableHead>安全库存</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {company.inventory.rows.map((row: (typeof company.inventory.rows)[number], index: number) => (
                      <TableRow key={`${row.id}-${row.sku_code}-${index}`}>
                      <TableCell>{row.product_name}</TableCell>
                      <TableCell>{row.sku_code}</TableCell>
                      <TableCell>{row.spec}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell>{row.safety_stock}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SectionPagination
              companyId={company.id}
              currentParams={currentParams}
              section='inventory'
              page={company.inventory.page}
              totalPages={company.inventory.totalPages}
              total={company.inventory.total}
            />
          </CardContent>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>最近订货单</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订货单号</TableHead>
                      <TableHead>货品摘要</TableHead>
                      <TableHead>规格摘要</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>订货额消耗</TableHead>
                      <TableHead>审核状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.purchaseOrders.rows.map((row: (typeof company.purchaseOrders.rows)[number]) => (
                      <TableRow key={row.order_no}>
                        <TableCell>
                          <Link href={`/dashboard/purchase-orders/${row.id}`} className='text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80'>
                            {row.order_no}
                          </Link>
                        </TableCell>
                        <TableCell className='max-w-[360px] whitespace-normal'>
                          <div className='space-y-1'>
                            <div>{row.product_name || '-'}</div>
                            {row.item_count > 1 ? (
                              <Badge variant='secondary'>共 {row.item_count} 个货品明细</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className='max-w-[260px] whitespace-normal'>{row.spec || '-'}</TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                        <TableCell>{row.order_quota_total}</TableCell>
                        <TableCell>{row.approval_status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <SectionPagination
                companyId={company.id}
                currentParams={currentParams}
                section='purchaseOrders'
                page={company.purchaseOrders.page}
                totalPages={company.purchaseOrders.totalPages}
                total={company.purchaseOrders.total}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近散客订单</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>订单号</TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead>规格</TableHead>
                      <TableHead>顾客</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.memberOrders.rows.map((row: (typeof company.memberOrders.rows)[number]) => (
                      <TableRow key={row.order_no}>
                        <TableCell>
                          <Link href={`/dashboard/member-orders/${row.id}`} className='text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80'>
                            {row.order_no}
                          </Link>
                        </TableCell>
                        <TableCell>{row.product_name || '-'}</TableCell>
                        <TableCell>{row.spec || '-'}</TableCell>
                        <TableCell>{row.customer_type} / {row.member_name}</TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                        <TableCell>{row.total_amount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <SectionPagination
                companyId={company.id}
                currentParams={currentParams}
                section='memberOrders'
                page={company.memberOrders.page}
                totalPages={company.memberOrders.totalPages}
                total={company.memberOrders.total}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
