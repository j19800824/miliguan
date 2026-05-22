import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listStoresWithSqbTerminal } from '@/lib/database.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SqbTerminalActivator } from '@/features/admin/components/sqb-terminal-activator';

export const metadata = {
  title: '米粒冠后台 - 收钱吧终端管理',
};

interface StoreRow {
  id: string;
  storeName: string;
  companyId: string;
  companyName: string;
  managerName: string;
  managerPhone: string;
  sqbTerminalSn: string;
  sqbDeviceId: string;
  activated: boolean;
}

export default async function PaymentTerminalsPage() {
  const user = await requirePermission('stores:view');
  const canEdit = hasPermission(user, 'stores:edit');
  const rows = (await listStoresWithSqbTerminal({})) as StoreRow[];

  const total = rows.length;
  const activated = rows.filter((r) => r.activated).length;
  const pending = total - activated;

  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold'>收钱吧终端管理</h1>
        <p className='text-sm text-muted-foreground'>
          为每个门店激活独立的收钱吧终端。激活后该门店即可通过移动端发起收款与分账。
        </p>
      </div>

      <div className='grid grid-cols-3 gap-4'>
        <div className='rounded-lg border bg-card p-4'>
          <div className='text-xs text-muted-foreground'>门店总数</div>
          <div className='mt-1 text-2xl font-bold'>{total}</div>
        </div>
        <div className='rounded-lg border bg-card p-4'>
          <div className='text-xs text-muted-foreground'>已激活</div>
          <div className='mt-1 text-2xl font-bold text-emerald-600'>{activated}</div>
        </div>
        <div className='rounded-lg border bg-card p-4'>
          <div className='text-xs text-muted-foreground'>待激活</div>
          <div className='mt-1 text-2xl font-bold text-amber-600'>{pending}</div>
        </div>
      </div>

      <div className='rounded-lg border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>门店</TableHead>
              <TableHead>分公司</TableHead>
              <TableHead>店长</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>terminal_sn</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className='font-medium'>{row.storeName}</TableCell>
                <TableCell>{row.companyName}</TableCell>
                <TableCell>
                  <div>{row.managerName || '—'}</div>
                  <div className='text-xs text-muted-foreground'>
                    {row.managerPhone || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  {row.activated ? (
                    <Badge className='bg-emerald-600 hover:bg-emerald-600/90'>
                      已激活
                    </Badge>
                  ) : (
                    <Badge variant='outline' className='border-amber-500 text-amber-700'>
                      待激活
                    </Badge>
                  )}
                </TableCell>
                <TableCell className='font-mono text-xs text-muted-foreground'>
                  {row.sqbTerminalSn || '—'}
                </TableCell>
                <TableCell className='text-right'>
                  <SqbTerminalActivator
                    storeId={row.id}
                    storeName={row.storeName}
                    activated={row.activated}
                    terminalSn={row.sqbTerminalSn}
                    canEdit={canEdit}
                  />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className='py-8 text-center text-sm text-muted-foreground'>
                  暂无门店
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
