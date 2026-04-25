import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/components/status-badge';
import { requirePermission } from '@/lib/auth/server';
import { getDashboardOverview } from '@/lib/database.js';

export const metadata = {
  title: '米粒冠后台 - 工作台'
};

function formatNumber(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function formatCurrency(value: number | string | null | undefined) {
  return `¥${formatNumber(value)}`;
}

function metricCard(label: string, value: string, hint: string) {
  return (
    <Card key={label}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
      </CardHeader>
      <CardContent className='text-sm text-muted-foreground'>{hint}</CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className='rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  );
}

function QuickActions({ headquarters }: { headquarters: boolean }) {
  const actions = headquarters
    ? [
        ['订货额审核', '/dashboard/order-quota-approvals'],
        ['库存审核', '/dashboard/inventory-approvals'],
        ['商品审核', '/dashboard/product-approvals'],
        ['数据报表', '/dashboard/reports'],
        ['通知中心', '/dashboard/notifications']
      ]
    : [
        ['发起订货', '/dashboard/purchase-orders'],
        ['库存管理', '/dashboard/inventory'],
        ['门店管理', '/dashboard/stores'],
        ['散客订单', '/dashboard/member-orders'],
        ['通知中心', '/dashboard/notifications']
      ];

  return (
    <div className='flex flex-wrap gap-2'>
      {actions.map(([label, href]) => (
        <Button key={href} asChild variant='outline' size='sm'>
          <Link href={href}>{label}</Link>
        </Button>
      ))}
    </div>
  );
}

function PendingTasks({ tasks }: { tasks: Array<{ label: string; count: number; href: string }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>待办中心</CardTitle>
        <CardDescription>优先处理会影响订货、库存或审核流转的事项。</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 sm:grid-cols-2'>
        {tasks.map((task) => (
          <Link
            key={task.label}
            href={task.href}
            className='group flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:border-primary/50 hover:bg-muted/40'
          >
            <span className='text-sm font-medium group-hover:text-primary'>{task.label}</span>
            <span className='rounded-full border px-2.5 py-1 text-sm tabular-nums'>{formatNumber(task.count)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function LowInventoryCard({ rows }: { rows: Array<Record<string, any>> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>库存预警</CardTitle>
        <CardDescription>低库存和缺货 SKU 会同步通知总部与对应分公司。</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState>暂无低库存或缺货 SKU。</EmptyState>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分公司</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>库存</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.id}-${row.sku_code}-${index}`}>
                    <TableCell>{row.company_name}</TableCell>
                    <TableCell>
                      <div className='font-medium'>{row.product_name}</div>
                      <div className='text-xs text-muted-foreground'>{row.spec}</div>
                    </TableCell>
                    <TableCell>{row.sku_code}</TableCell>
                    <TableCell>{formatNumber(row.quantity)} / 安全 {formatNumber(row.safety_stock)}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PurchaseOrdersCard({
  title,
  description,
  rows,
  emptyMessage,
  showStore = false
}: {
  title: string;
  description: string;
  rows: Array<Record<string, any>>;
  emptyMessage: string;
  showStore?: boolean;
}) {
  return (
    <Card>
      <CardHeader className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild variant='outline' size='sm'>
          <Link href='/dashboard/purchase-orders'>查看全部</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  {showStore ? <TableHead>门店</TableHead> : <TableHead>分公司</TableHead>}
                  <TableHead>商品摘要</TableHead>
                  <TableHead>订货额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.id}-${row.order_no}-${index}`}>
                    <TableCell>
                      <Link
                        href={`/dashboard/purchase-orders/${row.id}`}
                        className='font-medium text-primary underline underline-offset-4 hover:text-primary/80'
                      >
                        {row.order_no}
                      </Link>
                    </TableCell>
                    <TableCell>{showStore ? row.store_name || '门店订货' : row.company_name}</TableCell>
                    <TableCell className='max-w-[360px] whitespace-normal'>
                      <div className='line-clamp-2'>{row.product_summary || '暂无明细'}</div>
                      <div className='text-xs text-muted-foreground'>
                        {row.item_count > 1 ? `共 ${row.item_count} 个 SKU` : row.spec_summary}
                      </div>
                    </TableCell>
                    <TableCell>{formatNumber(row.order_quota_total)}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberOrdersCard({ rows }: { rows: Array<Record<string, any>> }) {
  return (
    <Card>
      <CardHeader className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <CardTitle>最近散客订单</CardTitle>
          <CardDescription>门店收银核销、异常处理和退货回补会沉淀在这里。</CardDescription>
        </div>
        <Button asChild variant='outline' size='sm'>
          <Link href='/dashboard/member-orders'>查看全部</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState>暂无散客订单。</EmptyState>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>门店</TableHead>
                  <TableHead>商品摘要</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.id}-${row.order_no}-${index}`}>
                    <TableCell>
                      <Link
                        href={`/dashboard/member-orders/${row.id}`}
                        className='font-medium text-primary underline underline-offset-4 hover:text-primary/80'
                      >
                        {row.order_no}
                      </Link>
                    </TableCell>
                    <TableCell>{row.store_name}</TableCell>
                    <TableCell className='max-w-[360px] whitespace-normal'>
                      <div className='line-clamp-2'>{row.product_summary || '暂无明细'}</div>
                      <div className='text-xs text-muted-foreground'>{row.spec_summary}</div>
                    </TableCell>
                    <TableCell>{formatNumber(row.total_amount)}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompanyRanking({ rows }: { rows: Array<Record<string, any>> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>分公司经营排行</CardTitle>
        <CardDescription>按订货额消耗、销售额、核销量和异常数综合观察。</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState>暂无分公司排行数据。</EmptyState>
        ) : (
          <div className='space-y-3'>
            {rows.map((row, index) => (
              <Link
                key={`${row.id}-${index}`}
                href={`/dashboard/companies/${row.id}`}
                className='block rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-muted/40'
              >
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-sm text-muted-foreground'>#{index + 1} {row.code}</div>
                    <div className='font-semibold'>{row.name}</div>
                  </div>
                  <div className='text-right text-sm'>
                    <div className='font-medium'>{formatNumber(row.order_quota_spent)}</div>
                    <div className='text-muted-foreground'>订货额消耗</div>
                  </div>
                </div>
                <div className='mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3'>
                  <span>销售额 {formatNumber(row.total_sales)}</span>
                  <span>核销 {formatNumber(row.writeoff_count)}</span>
                  <span>异常 {formatNumber(row.abnormal_count)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StoreOrderReservation({ stats }: { stats: Record<string, number> }) {
  const total = stats.pending + stats.waitingShipment + stats.completed + stats.abnormal;
  return (
    <Card>
      <CardHeader>
        <CardTitle>门店订货预留</CardTitle>
        <CardDescription>未来 App 发起门店向分公司订货后，会按同一套订单表展示。</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-3 text-sm lg:grid-cols-4'>
          <div className='rounded-lg border p-3'><div className='text-muted-foreground'>待处理</div><div className='text-2xl font-semibold'>{formatNumber(stats.pending)}</div></div>
          <div className='rounded-lg border p-3'><div className='text-muted-foreground'>待发货</div><div className='text-2xl font-semibold'>{formatNumber(stats.waitingShipment)}</div></div>
          <div className='rounded-lg border p-3'><div className='text-muted-foreground'>已完成</div><div className='text-2xl font-semibold'>{formatNumber(stats.completed)}</div></div>
          <div className='rounded-lg border p-3'><div className='text-muted-foreground'>异常</div><div className='text-2xl font-semibold'>{formatNumber(stats.abnormal)}</div></div>
        </div>
        {total === 0 && <EmptyState>门店订货 App 接入后将在这里显示。</EmptyState>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardOverviewPage() {
  const user = await requirePermission('overview:view');
  const overview = await getDashboardOverview(user);
  const headquarters = overview.scope === 'headquarters';
  const summary = overview.summary;
  const title = headquarters ? '总公司经营指挥台' : '分公司经营首页';
  const description = headquarters
    ? '查看全局订货、库存、审核和分公司经营风险。'
    : '查看本分公司的订货额、库存、门店和订单处理状态。';

  const metrics = headquarters
    ? [
        ['分公司总数', formatNumber(summary.companyCount), '当前纳管的分公司数量'],
        ['门店总数', formatNumber(summary.storeCount), '全部分公司下属门店'],
        ['总库存量', formatNumber(summary.inventoryQuantityTotal), `库存金额 ${formatCurrency(summary.inventoryAmountTotal)}`],
        ['可用订货额', formatNumber(summary.availableOrderQuota), `总订货额 ${formatNumber(summary.totalOrderQuota)}`],
        ['待办事项', formatNumber(overview.pendingTasks.reduce((sum: number, item: any) => sum + item.count, 0)), '审核、异常和风险事项合计'],
        ['低库存 SKU', formatNumber(summary.warningInventoryCount), '低库存与缺货 SKU']
      ]
    : [
        ['可用订货额', formatNumber(summary.availableOrderQuota), `总订货额 ${formatNumber(summary.totalOrderQuota)}`],
        ['已用订货额', formatNumber(summary.usedOrderQuota), '已创建并扣减的订货单额度'],
        ['库存总量', formatNumber(summary.inventoryQuantityTotal), `库存金额 ${formatCurrency(summary.inventoryAmountTotal)}`],
        ['低库存 SKU', formatNumber(summary.warningInventoryCount), '需要尽快补货的 SKU'],
        ['门店数量', formatNumber(summary.storeCount), `营业中 ${formatNumber(summary.activeStoreCount)}`],
        ['今日核销', formatNumber(summary.todayWriteoffCount), '今日已核销散客订单']
      ];

  return (
    <PageContainer
      pageTitle={title}
      pageDescription={description}
      pageHeaderAction={<QuickActions headquarters={headquarters} />}
    >
      <div className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6'>
          {metrics.map(([label, value, hint]) => metricCard(label, value, hint))}
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]'>
          <PendingTasks tasks={overview.pendingTasks} />
          <StoreOrderReservation stats={overview.storeOrderStats} />
        </div>

        {headquarters && (
          <div className='grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]'>
            <CompanyRanking rows={overview.companyRanking} />
            <LowInventoryCard rows={overview.lowInventory} />
          </div>
        )}

        {!headquarters && (
          <div className='grid gap-4 xl:grid-cols-2'>
            <LowInventoryCard rows={overview.lowInventory} />
            <MemberOrdersCard rows={overview.memberOrders} />
          </div>
        )}

        <div className='grid gap-4 xl:grid-cols-2'>
          <PurchaseOrdersCard
            title='分公司向总公司订货'
            description='后台当前只开放这一类订货创建入口。'
            rows={overview.headquartersPurchaseOrders}
            emptyMessage='暂无分公司订货单。'
          />
          <PurchaseOrdersCard
            title='门店向分公司订货'
            description='App 门店订货接入后会显示具体订单，后台当前只展示不创建。'
            rows={overview.storePurchaseOrders}
            emptyMessage='门店订货 App 接入后将在这里显示。'
            showStore
          />
        </div>

        {headquarters && <MemberOrdersCard rows={overview.memberOrders} />}
      </div>
    </PageContainer>
  );
}
