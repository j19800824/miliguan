import React from 'react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import SearchInput from '../search-input';
import { ThemeSelector } from '../themes/theme-selector';
import { ThemeModeToggle } from '../themes/theme-mode-toggle';
import { NotificationCenter } from '@/features/notifications/components/notification-center';
import { ClientBreadcrumbs } from '../client-breadcrumbs';

export default function Header() {
  return (
    <header className='bg-background sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 overflow-hidden'>
      <div className='flex min-w-0 flex-1 items-center gap-2 px-4'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mr-2 h-4' />
        <ClientBreadcrumbs />
      </div>

      <div className='flex shrink-0 items-center gap-2 px-4'>
        <div className='hidden md:flex'>
          <SearchInput />
        </div>
        <ThemeModeToggle />
        <div className='hidden sm:block'>
          <ThemeSelector />
        </div>
        <NotificationCenter />
      </div>
    </header>
  );
}
