import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Heading } from '../ui/heading';
import type { InfobarContent } from '@/components/ui/infobar';

function PageSkeleton() {
  return (
    <div className='flex min-w-0 flex-1 animate-pulse flex-col gap-4 p-4 md:px-6'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='bg-muted mb-2 h-8 w-48 rounded' />
          <div className='bg-muted h-4 w-96 rounded' />
        </div>
      </div>
      <div className='bg-muted mt-6 h-40 w-full rounded-lg' />
      <div className='bg-muted h-40 w-full rounded-lg' />
    </div>
  );
}

export default function PageContainer({
  children,
  scrollable = false,
  isLoading = false,
  access = true,
  accessFallback,
  pageTitle,
  pageDescription,
  infoContent,
  pageHeaderAction
}: {
  children: React.ReactNode;
  scrollable?: boolean;
  isLoading?: boolean;
  access?: boolean;
  accessFallback?: React.ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  infoContent?: InfobarContent;
  pageHeaderAction?: React.ReactNode;
}) {
  if (!access) {
    return (
      <div className='flex flex-1 items-center justify-center p-4 md:px-6'>
        {accessFallback ?? (
          <div className='text-muted-foreground text-center text-lg'>当前账号无权访问此页面。</div>
        )}
      </div>
    );
  }

  const content = isLoading ? <PageSkeleton /> : children;

  const hasHeader = pageTitle || pageHeaderAction;

  const inner = (
    <div className='flex min-w-0 flex-1 flex-col overflow-x-hidden p-4 md:px-6'>
      {hasHeader && (
        <div className='bg-background sticky top-0 z-10 mb-4 flex flex-col gap-4 pb-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0 flex-1'>
            <Heading
              title={pageTitle ?? ''}
              description={pageDescription ?? ''}
              infoContent={infoContent}
            />
          </div>
          {pageHeaderAction && <div className='min-w-0 shrink-0 max-w-full overflow-x-auto'>{pageHeaderAction}</div>}
        </div>
      )}
      {content}
    </div>
  );

  if (scrollable) {
    return <ScrollArea className='h-[calc(100dvh-52px)]'>{inner}</ScrollArea>;
  }

  return inner;
}
