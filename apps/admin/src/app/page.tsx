import { getAdminSession } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

export default async function Page() {
  const user = await getAdminSession();

  if (!user) {
    return redirect('/auth/sign-in');
  }

  redirect('/dashboard/overview');
}
