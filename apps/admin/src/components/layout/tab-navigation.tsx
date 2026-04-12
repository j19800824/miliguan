'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Icons } from '@/components/icons';

type TabItem = {
  title: string;
  path: string;
};

const STORAGE_KEY = 'miliguan-admin-tabs';
const DEFAULT_TAB: TabItem = { title: '工作台', path: '/dashboard/overview' };

function resolveTabTitle(pathname: string) {
  const exactTitles: Record<string, string> = {
    '/dashboard/overview': '工作台',
    '/dashboard/categories': '分类管理',
    '/dashboard/products': '商品管理',
    '/dashboard/product-approvals': '商品审核',
    '/dashboard/companies': '分公司管理',
    '/dashboard/inventory': '库存管理',
    '/dashboard/purchase-orders': '订货单管理',
    '/dashboard/member-orders': '会员订单管理',
    '/dashboard/redeem': '积分兑换',
    '/dashboard/reports': '数据报表',
    '/dashboard/settings': '系统设置',
    '/dashboard/roles': '角色管理',
    '/dashboard/permissions': '权限管理',
    '/dashboard/staff': '后台员工',
    '/dashboard/stores': '门店管理',
    '/dashboard/members': '会员管理',
    '/dashboard/kanban': '协同看板',
    '/dashboard/notifications': '通知中心'
  };

  if (exactTitles[pathname]) {
    return exactTitles[pathname];
  }

  const productSkuMatch = pathname.match(/^\/dashboard\/products\/([^/]+)\/skus\/([^/]+)$/);
  if (productSkuMatch) {
    return `SKU详情 #${productSkuMatch[2]}`;
  }

  const detailPatterns: Array<[RegExp, string]> = [
    [/^\/dashboard\/products\/([^/]+)$/, '商品详情'],
    [/^\/dashboard\/companies\/([^/]+)$/, '分公司详情'],
    [/^\/dashboard\/purchase-orders\/([^/]+)$/, '订货单详情'],
    [/^\/dashboard\/member-orders\/([^/]+)$/, '会员订单详情'],
    [/^\/dashboard\/roles\/([^/]+)$/, '角色授权'],
    [/^\/dashboard\/staff\/([^/]+)$/, '员工详情']
  ];

  for (const [pattern, title] of detailPatterns) {
    const match = pathname.match(pattern);
    if (match) {
      return `${title} #${match[1]}`;
    }
  }

  return '页面';
}

export function TabNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<TabItem[]>([DEFAULT_TAB]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as TabItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setTabs(parsed);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!pathname.startsWith('/dashboard')) {
      return;
    }

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.some((tab) => tab.path === pathname)
        ? currentTabs
        : currentTabs.concat({ path: pathname, title: resolveTabTitle(pathname) });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTabs));
      return nextTabs;
    });
  }, [pathname]);

  const visibleTabs = useMemo(() => {
    const deduped = new Map<string, TabItem>();
    for (const tab of tabs) {
      deduped.set(tab.path, tab);
    }
    return Array.from(deduped.values());
  }, [tabs]);

  const closeTab = (path: string) => {
    if (path === DEFAULT_TAB.path) {
      return;
    }

    const nextTabs = visibleTabs.filter((tab) => tab.path !== path);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTabs));
    setTabs(nextTabs);

    if (pathname === path) {
      const fallback = nextTabs[nextTabs.length - 1] ?? DEFAULT_TAB;
      router.push(fallback.path);
    }
  };

  return (
    <div className='border-b bg-background/95 px-4'>
      <ScrollArea className='w-full whitespace-nowrap'>
        <div className='flex min-h-11 items-center gap-2 py-2'>
          {visibleTabs.map((tab) => {
            const active = tab.path === pathname;
            return (
              <div
                key={tab.path}
                className={`group flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'
                }`}
              >
                <Link href={tab.path} className='max-w-[160px] truncate'>
                  {tab.title}
                </Link>
                {tab.path !== DEFAULT_TAB.path ? (
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='h-5 w-5 opacity-70 hover:opacity-100'
                    onClick={() => closeTab(tab.path)}
                  >
                    <Icons.close className='h-3.5 w-3.5' />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation='horizontal' />
      </ScrollArea>
    </div>
  );
}
