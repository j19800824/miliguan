import { redirect } from 'next/navigation';

export const metadata = {
  title: '米粒冠后台 - 营销中心'
};

export default function MarketingPage() {
  redirect('/dashboard/redeem');
}
