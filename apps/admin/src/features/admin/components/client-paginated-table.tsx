'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { PaginationFooter } from './pagination-footer';

export function ClientPaginatedTable({
  headers,
  rows,
  emptyMessage,
  initialPageSize = 10,
  total,
  page,
  pageSize,
  pageParamName = 'page',
  pageSizeParamName = 'pageSize'
}: {
  headers: React.ReactNode[];
  rows: React.ReactNode[];
  emptyMessage: string;
  initialPageSize?: number;
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
  }, [rows.length, localPageSize, serverMode]);

  const totalRows = serverMode ? total! : rows.length;
  const currentPageSize = serverMode ? pageSize! : localPageSize;
  const totalPages = Math.max(1, Math.ceil(totalRows / currentPageSize));
  const currentPage = serverMode ? Math.min(page!, totalPages) : Math.min(localPage, totalPages);
  const pageRows = useMemo(
    () => (serverMode ? rows : rows.slice((currentPage - 1) * currentPageSize, currentPage * currentPageSize)),
    [rows, currentPage, currentPageSize, serverMode]
  );

  const updateQuery = (nextPage: number, nextPageSize: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(pageParamName, String(nextPage));
    params.set(pageSizeParamName, String(nextPageSize));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, index) => (
                <TableHead key={index}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={headers.length} className='py-10 text-center text-sm text-muted-foreground'>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pageRows
            )}
          </TableBody>
        </Table>
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
