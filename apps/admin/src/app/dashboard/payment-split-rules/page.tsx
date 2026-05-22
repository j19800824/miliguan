import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listAllSplitRules, seedDefaultSplitRules } from '@/lib/database.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SplitRuleEditor,
  type SplitRuleFormValue,
} from '@/features/admin/components/split-rule-editor';
import { SplitRuleDeleteButton } from '@/features/admin/components/split-rule-delete-button';

export const metadata = {
  title: '米粒冠后台 - 分账规则',
};

interface SplitRuleRow {
  id: string;
  scope: 'global' | 'company' | 'store' | 'sku';
  scopeId: string;
  recipientType: 'hq' | 'company' | 'store' | 'sales_staff';
  recipientAccountId: string;
  recipientName: string;
  rateType: 'percent' | 'fixed' | 'percent_of_store' | 'residual';
  rateValue: number;
  priority: number;
  status: '启用' | '停用';
  remark: string;
}

const SCOPE_LABEL: Record<SplitRuleRow['scope'], string> = {
  global: '全局',
  company: '分公司',
  store: '门店',
  sku: 'SKU',
};

const RECIPIENT_LABEL: Record<SplitRuleRow['recipientType'], string> = {
  hq: '总部',
  company: '分公司',
  store: '门店',
  sales_staff: '销售员',
};

function rateText(rule: SplitRuleRow): string {
  switch (rule.rateType) {
    case 'percent':
      return `${(rule.rateValue * 100).toFixed(2)}%`;
    case 'fixed':
      return `¥${rule.rateValue.toFixed(2)}`;
    case 'percent_of_store':
      return `门店净收入 ${(rule.rateValue * 100).toFixed(2)}%`;
    case 'residual':
      return '剩余';
    default:
      return String(rule.rateValue);
  }
}

export default async function PaymentSplitRulesPage() {
  const user = await requirePermission('overview:view');
  const canEdit = hasPermission(user, 'stores:edit');
  // Seed defaults so first-visit shows the 4 baseline rules instead of empty.
  await seedDefaultSplitRules();
  const rows = (await listAllSplitRules({})) as SplitRuleRow[];

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-start justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>分账规则</h1>
          <p className='text-sm text-muted-foreground'>
            规则按 priority 升序匹配；store 域 &gt; company 域 &gt; global 域。停用后不再参与新订单分账，已有分账记录不受影响。
          </p>
        </div>
        <SplitRuleEditor
          canEdit={canEdit}
          trigger={
            <Button size='sm' disabled={!canEdit}>
              + 新建规则
            </Button>
          }
        />
      </div>

      <div className='rounded-lg border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>优先级</TableHead>
              <TableHead>范围</TableHead>
              <TableHead>收款方</TableHead>
              <TableHead>方式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const formValue: SplitRuleFormValue = {
                id: row.id,
                scope: row.scope,
                scopeId: row.scopeId,
                recipientType: row.recipientType,
                rateType: row.rateType,
                rateValue: row.rateValue,
                priority: row.priority,
                status: row.status,
                remark: row.remark,
              };
              return (
                <TableRow key={row.id}>
                  <TableCell className='font-mono'>{row.priority}</TableCell>
                  <TableCell>
                    <div className='font-medium'>{SCOPE_LABEL[row.scope]}</div>
                    {row.scopeId && (
                      <div className='text-xs text-muted-foreground'>
                        #{row.scopeId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{RECIPIENT_LABEL[row.recipientType]}</TableCell>
                  <TableCell>{rateText(row)}</TableCell>
                  <TableCell>
                    {row.status === '启用' ? (
                      <Badge className='bg-emerald-600 hover:bg-emerald-600/90'>
                        启用
                      </Badge>
                    ) : (
                      <Badge variant='outline'>停用</Badge>
                    )}
                  </TableCell>
                  <TableCell className='max-w-xs truncate text-sm text-muted-foreground'>
                    {row.remark || '—'}
                  </TableCell>
                  <TableCell className='space-x-2 text-right'>
                    <SplitRuleEditor
                      initial={formValue}
                      canEdit={canEdit}
                      trigger={
                        <Button size='sm' variant='outline' disabled={!canEdit}>
                          编辑
                        </Button>
                      }
                    />
                    {row.status === '启用' && (
                      <SplitRuleDeleteButton id={row.id} disabled={!canEdit} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className='py-8 text-center text-sm text-muted-foreground'>
                  暂无规则
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
