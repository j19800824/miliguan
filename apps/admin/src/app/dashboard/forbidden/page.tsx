import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: '米粒冠后台 - 无权限访问'
};

export default async function ForbiddenPage({
  searchParams
}: {
  searchParams: Promise<{ permission?: string }>;
}) {
  const { permission } = await searchParams;

  return (
    <PageContainer pageTitle='无权限访问' pageDescription='当前账号没有访问该页面所需的权限。'>
      <div className='mx-auto max-w-2xl'>
        <Card>
          <CardHeader>
            <CardTitle>页面已被拦截</CardTitle>
            <CardDescription>
              如果这是你需要的工作内容，请联系超级管理员为当前账号分配对应角色或权限。
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='text-muted-foreground text-sm'>
              你可以先返回工作台，或者让管理员在“角色管理 / 权限分配”中为你开通访问能力。
            </div>
            {permission ? (
              <div className='flex items-center gap-2 text-sm'>
                <span className='text-muted-foreground'>缺少权限码</span>
                <Badge variant='outline'>{permission}</Badge>
              </div>
            ) : null}
            <div className='flex items-center gap-2'>
              <Button asChild>
                <Link href='/dashboard/overview'>返回工作台</Link>
              </Button>
              <Button asChild variant='outline'>
                <Link href='/dashboard/roles'>去看角色管理</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
