'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PaginationFooter } from './pagination-footer';

export function ClientPaginatedItems({
  items,
  emptyState,
  initialPageSize = 10,
  className = 'space-y-2',
  total,
  page,
  pageSize,
  pageParamName = 'page',
  pageSizeParamName = 'pageSize'
}: {
  items: React.ReactNode[];
  emptyState: React.ReactNode;
  initialPageSize?: number;
  className?: string;
  total?: number;
  page?: number;
  pageSize?: number;
  pageParamName?: string;
  pageSizeParamName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serverMode = typeof total === 'number' && typeof page === 'number' && typeof pageSize === 'number';
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(initialPageSize);

  useEffect(() => {
    if (!serverMode) {
      setLocalPage(1);
    }
  }, [items.length, localPageSize, serverMode]);

  const totalRows = serverMode ? total! : items.length;
  const currentPageSize = serverMode ? pageSize! : localPageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / currentPageSize));
  const currentPage = serverMode ? Math.min(page!, totalPages) : Math.min(localPage, totalPages);
  const pageItems = useMemo(
    () => (serverMode ? items : items.slice((currentPage - 1) * currentPageSize, currentPage * currentPageSize)),
    [items, currentPage, currentPageSize, serverMode]
  );

  const updateQuery = (nextPage: number, nextPageSize: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(pageParamName, String(nextPage));
    params.set(pageSizeParamName, String(nextPageSize));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className={className}>
        {items.length === 0 ? emptyState : pageItems}
      </div>
      <PaginationFooter
        total={totalRows}
        page={currentPage}
        totalPages={totalPages}
        pageSize={currentPageSize}
        onPageChange={(nextPage) => {
          if (serverMode) {
            updateQuery(nextPage, currentPageSize);
            return;
          }
          setLocalPage(nextPage);
        }}
        onPageSizeChange={(nextPageSize) => {
          if (serverMode) {
            updateQuery(1, nextPageSize);
            return;
          }
          setLocalPageSize(nextPageSize);
        }}
      />
    </>
  );
}
