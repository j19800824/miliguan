import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/server';
import { listSystemSettings } from '@/lib/database.js';
import { SystemSettingsManager } from '@/features/admin/components/system-settings-manager';

export const metadata = {
  title: '米粒冠后台 - 系统设置'
};

export default async function SettingsPage() {
  await requirePermission('settings:view');
  const settings = await listSystemSettings();

  return (
    <PageContainer pageTitle='系统设置' pageDescription='维护订货额度、排行、核销、扫码、消息通知和基础参数。'>
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>规则配置</CardTitle>
            <CardDescription>覆盖订货额度规则、排行规则、核销规则、扫码规则、消息通知和基础字典。</CardDescription>
          </CardHeader>
          <CardContent>
            <SystemSettingsManager rows={settings} canEdit />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
