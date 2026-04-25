import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusToneClasses = {
  success:
    'border-emerald-500/40 bg-emerald-500/12 text-emerald-300 dark:border-emerald-400/35 dark:bg-emerald-400/12 dark:text-emerald-200',
  warning:
    'border-amber-500/45 bg-amber-500/12 text-amber-300 dark:border-amber-400/40 dark:bg-amber-400/12 dark:text-amber-200',
  danger:
    'border-red-500/45 bg-red-500/12 text-red-300 dark:border-red-400/40 dark:bg-red-400/12 dark:text-red-200',
  info:
    'border-sky-500/40 bg-sky-500/12 text-sky-300 dark:border-sky-400/35 dark:bg-sky-400/12 dark:text-sky-200',
  neutral:
    'border-zinc-500/35 bg-zinc-500/10 text-zinc-300 dark:border-zinc-400/25 dark:bg-zinc-400/10 dark:text-zinc-200'
} as const;

type StatusTone = keyof typeof statusToneClasses;

const statusToneMap: Record<string, StatusTone> = {
  正常: 'success',
  启用: 'success',
  营业中: 'success',
  在职: 'success',
  活跃: 'success',
  已通过: 'success',
  自动通过: 'success',
  已入库: 'success',
  已核销: 'success',
  已完成: 'success',
  已处理: 'success',
  成功: 'success',
  充足: 'success',

  待审核: 'warning',
  待入库: 'warning',
  待核销: 'warning',
  待处理: 'warning',
  待确认: 'warning',
  筹备中: 'warning',
  预警: 'warning',
  低库存: 'warning',

  异常: 'danger',
  停用: 'danger',
  已驳回: 'danger',
  已删除: 'danger',
  缺货: 'danger',
  失败: 'danger',

  已退货: 'info',
  退货: 'info',
  已取消: 'neutral',
  未入库: 'neutral',
  未核销: 'neutral',
  草稿: 'neutral'
};

export function getStatusTone(status: string | number | null | undefined): StatusTone {
  const text = String(status ?? '').trim();
  return statusToneMap[text] ?? 'neutral';
}

export function getStatusBadgeClass(status: string | number | null | undefined) {
  return statusToneClasses[getStatusTone(status)];
}

export function StatusBadge({
  status,
  className
}: {
  status: string | number | null | undefined;
  className?: string;
}) {
  return (
    <Badge variant='outline' className={cn(getStatusBadgeClass(status), className)}>
      {String(status ?? '')}
    </Badge>
  );
}
