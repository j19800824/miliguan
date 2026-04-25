import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import { SessionActivity } from '@/components/layout/session-activity';
import { TabNavigation } from '@/components/layout/tab-navigation';
import Header from '@/components/layout/header';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { getNavGroupsForUser } from '@/config/nav-config';
import { requireAdminSession } from '@/lib/auth/server';
import { filterNavGroups } from '@/lib/permissions';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: '米粒冠后台',
  description: '米粒冠后台工作区',
  robots: {
    index: false,
    follow: false
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Persisting the sidebar state in the cookie.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';
  const user = await requireAdminSession();
  const groups = filterNavGroups(getNavGroupsForUser(user), user.permissions);
  return (
    <KBar groups={groups}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <InfobarProvider defaultOpen={false}>
          <AppSidebar user={user} groups={groups} />
          <SidebarInset>
            <SessionActivity />
            <Header />
            <TabNavigation />
            {/* page main content */}
            {children}
            {/* page main content ends */}
          </SidebarInset>
          <InfoSidebar side='right' />
        </InfobarProvider>
      </SidebarProvider>
    </KBar>
  );
}
