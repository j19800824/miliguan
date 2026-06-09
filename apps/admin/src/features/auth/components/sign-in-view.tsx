'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Metadata } from 'next';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState, useTransition } from 'react';
import { InteractiveGridPattern } from './interactive-grid';

export const metadata: Metadata = {
  title: '米粒冠后台登录',
  description: '米粒冠后台手机号 + 短信验证码登录'
};

const PHONE_PATTERN = /^1\d{10}$/;

export default function SignInViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [isPending, startTransition] = useTransition();

  const redirectTo = searchParams.get('redirectTo') || '/dashboard/overview';
  const phoneValid = PHONE_PATTERN.test(phone.trim());

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const readErrorMessage = async (response: Response) => {
    const clonedResponse = response.clone();
    try {
      const body = (await response.json()) as { message?: string };
      return body.message ?? '操作失败，请重试';
    } catch {
      const text = await clonedResponse.text().catch(() => '');
      return text || `操作失败（${response.status}），请检查服务端日志`;
    }
  };

  const handleSendCode = async () => {
    setError('');
    setNotice('');
    if (!phoneValid) {
      setError('请输入有效的 11 位手机号');
      return;
    }
    setSending(true);
    try {
      const response = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() })
      });
      if (!response.ok) {
        setError(await readErrorMessage(response));
        return;
      }
      const body = (await response.json()) as { resendAfter?: number; message?: string };
      setCountdown(body.resendAfter ?? 60);
      setNotice(body.message ?? '验证码已发送，请注意查收');
    } catch {
      setError('网络异常，验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    startTransition(async () => {
      const response = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() })
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
              <CardDescription>请使用绑定的手机号 + 短信验证码登录。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className='space-y-4' onSubmit={handleSubmit}>
                <div className='space-y-2'>
                  <Label htmlFor='phone'>手机号</Label>
                  <Input
                    id='phone'
                    inputMode='numeric'
                    autoComplete='tel'
                    maxLength={11}
                    placeholder='请输入 11 位手机号'
                    value={phone}
                    onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='code'>验证码</Label>
                  <div className='flex gap-2'>
                    <Input
                      id='code'
                      inputMode='numeric'
                      autoComplete='one-time-code'
                      maxLength={6}
                      placeholder='请输入验证码'
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    />
                    <Button
                      type='button'
                      variant='outline'
                      className='shrink-0 whitespace-nowrap'
                      disabled={!phoneValid || sending || countdown > 0}
                      onClick={handleSendCode}
                    >
                      {countdown > 0 ? `${countdown}s 后重发` : sending ? '发送中...' : '获取验证码'}
                    </Button>
                  </div>
                </div>
                {notice ? (
                  <Alert>
                    <AlertTitle>提示</AlertTitle>
                    <AlertDescription>{notice}</AlertDescription>
                  </Alert>
                ) : null}
                {error ? (
                  <Alert variant='destructive'>
                    <AlertTitle>登录失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  className='w-full'
                  type='submit'
                  disabled={isPending || !phoneValid || code.trim().length < 4}
                >
                  {isPending ? '登录中...' : '进入后台'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
