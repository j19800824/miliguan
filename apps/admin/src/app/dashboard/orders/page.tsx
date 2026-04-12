import { redirect } from 'next/navigation';

export const metadata = {
  title: '米粒冠后台 - 订单管理'
};

export default function OrdersPage() {
  redirect('/dashboard/purchase-orders');
}
