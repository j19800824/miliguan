import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: '米粒冠后台登录'
};

export default function Page() {
  redirect('/auth/sign-in');
}
