'use client';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { useBreadcrumbs } from '@/hooks/use-breadcrumbs';
import { Icons } from '@/components/icons';
import { Fragment, useEffect, useState } from 'react';

export function Breadcrumbs() {
  const [mounted, setMounted] = useState(false);
  const items = useBreadcrumbs();
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (items.length === 0) return null;

  return (
    <Breadcrumb className='min-w-0'>
      <BreadcrumbList className='min-w-0 flex-nowrap overflow-hidden'>
        {items.map((item, index) => (
          <Fragment key={item.title}>
            {index !== items.length - 1 && (
              <BreadcrumbItem className='hidden min-w-0 md:block'>
                <BreadcrumbLink className='truncate' href={item.link}>{item.title}</BreadcrumbLink>
              </BreadcrumbItem>
            )}
            {index < items.length - 1 && (
              <BreadcrumbSeparator className='hidden md:block'>
                <Icons.slash />
              </BreadcrumbSeparator>
            )}
            {index === items.length - 1 && <BreadcrumbPage className='truncate'>{item.title}</BreadcrumbPage>}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
