'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEMO_CREDENTIALS, SECONDARY_CREDENTIALS } from '@/lib/auth/shared';
import { cn } from '@/lib/utils';
import { Metadata } from 'next';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { InteractiveGridPattern } from './interactive-grid';

export const metadata: Metadata = {
  title: '米粒冠后台登录',
  description: '米粒冠后台本地开发登录页'
};

export default function SignInViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [account, setAccount] = useState(DEMO_CREDENTIALS.account);
  const [password, setPassword] = useState(DEMO_CREDENTIALS.password);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const redirectTo = searchParams.get('redirectTo') || '/dashboard/overview';

  const readErrorMessage = async (response: Response) => {
    const clonedResponse = response.clone();

    try {
      const body = (await response.json()) as { message?: string };
      return body.message ?? '登录失败，请重试';
    } catch {
      const text = await clonedResponse.text().catch(() => '');
      return text || `登录失败（${response.status}），请检查服务端日志`;
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    startTransition(async () => {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ account, password })
      });

      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    });
  };

  return (
    <div className='relative flex min-h-screen flex-col items-center justify-center overflow-hidden md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <div className='relative hidden h-full flex-col p-10 lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-sidebar' />
        <div className='text-sidebar-foreground relative z-20 flex items-center text-lg font-medium'>
          <span className='mr-3 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-white/40'>
            <Image
              src='/logo.png'
              alt='米粒冠 Logo'
              width={40}
              height={40}
              className='h-full w-full object-contain'
              priority
            />
          </span>
          米粒冠后台
        </div>
        <InteractiveGridPattern
          className={cn(
            'mask-[radial-gradient(400px_circle_at_center,white,transparent)]',
            'inset-x-0 inset-y-[0%] h-full skew-y-12'
          )}
        />
        <div className='text-sidebar-foreground relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg'>统一管理门店、订单、会员、营销活动和经营数据。</p>
            <footer className='text-sidebar-foreground/70 text-sm'>米粒冠一期后台管理端</footer>
          </blockquote>
        </div>
      </div>
      <div className='flex h-full items-center justify-center p-4 lg:p-8'>
        <div className='flex w-full max-w-md flex-col items-center justify-center space-y-6'>
          <Card className='w-full'>
              <CardHeader>
                <CardTitle>登录米粒冠后台</CardTitle>
                <CardDescription>当前已接入本地 PostgreSQL + Redis 员工账号，可体验不同角色的菜单和权限差异。</CardDescription>
              </CardHeader>
            <CardContent>
              <form className='space-y-4' onSubmit={handleSubmit}>
                <div className='space-y-2'>
                  <Label htmlFor='account'>账号</Label>
                  <Input
                    id='account'
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='password'>密码</Label>
                  <Input
                    id='password'
                    type='password'
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                {error ? (
                  <Alert variant='destructive'>
                    <AlertTitle>登录失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button className='w-full' type='submit' disabled={isPending}>
                  {isPending ? '登录中...' : '进入后台'}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Alert className='w-full text-sm'>
            <AlertTitle>测试账号</AlertTitle>
            <AlertDescription>
              默认管理员：`{DEMO_CREDENTIALS.account}` / `{DEMO_CREDENTIALS.password}`；其他角色：
              {SECONDARY_CREDENTIALS.map((item) => ` ${item.label}(${item.account}/${item.password})`).join('，')}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
