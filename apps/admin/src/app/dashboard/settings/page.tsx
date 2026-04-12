import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hasPermission, requirePermission } from '@/lib/auth/server';
import { listInventoryAdjustments, listPointAdjustments, listSystemSettings } from '@/lib/database.js';
import { SystemSettingsManager } from '@/features/admin/components/system-settings-manager';
import { ApprovalDecisionActions } from '@/features/admin/components/approval-decision-actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const metadata = {
  title: '米粒冠后台 - 系统设置'
};

export default async function SettingsPage() {
  const user = await requirePermission('settings:view');
  const settings = await listSystemSettings();
  const pointAdjustments = await listPointAdjustments();
  const inventoryAdjustments = await listInventoryAdjustments();

  return (
    <PageContainer pageTitle='系统设置' pageDescription='维护积分、排行、核销、扫码、消息通知和基础参数。'>
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>规则配置</CardTitle>
            <CardDescription>覆盖积分规则、排行规则、核销规则、扫码规则、消息通知和基础字典。</CardDescription>
          </CardHeader>
          <CardContent>
            <SystemSettingsManager rows={settings} canEdit={hasPermission(user, 'settings:view')} />
          </CardContent>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>积分调整审核台</CardTitle>
              <CardDescription>审核分公司积分增减申请。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>类型</TableHead><TableHead>积分数</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pointAdjustments.map((row: (typeof pointAdjustments)[number]) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.change_type}</TableCell>
                        <TableCell>{row.points_amount}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>
                          {row.status === '待审核' ? (
                            <ApprovalDecisionActions
                              endpoint={`/api/admin/points/adjustments/${row.id}/approve`}
                              canApprove={hasPermission(user, 'points:approve')}
                              label='积分审核'
                            />
                          ) : (
                            <span className='text-xs text-muted-foreground'>已完成</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>库存调整审核台</CardTitle>
              <CardDescription>审核手工库存调整，保证库存可信。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto rounded-lg border'>
                <Table>
                  <TableHeader><TableRow><TableHead>分公司</TableHead><TableHead>商品</TableHead><TableHead>申请库存</TableHead><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {inventoryAdjustments.map((row: (typeof inventoryAdjustments)[number]) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.company_name}</TableCell>
                        <TableCell>{row.product_name}</TableCell>
                        <TableCell>{row.requested_quantity}</TableCell>
                        <TableCell><Badge variant='outline'>{row.status}</Badge></TableCell>
                        <TableCell>
                          {row.status === '待审核' ? (
                            <ApprovalDecisionActions
                              endpoint={`/api/admin/inventory/adjustments/${row.id}/approve`}
                              canApprove={hasPermission(user, 'inventory:approve')}
                              label='库存审核'
                            />
                          ) : (
                            <span className='text-xs text-muted-foreground'>已完成</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
