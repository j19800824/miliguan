import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listCompanyStoresByCompany } from '@/lib/database.js';

interface DbStoreRow {
  id: string | number;
  name: string;
  manager_name?: string;
  status?: string;
  today_verify_count?: number | string;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  if (!user.companyId) {
    return NextResponse.json([]);
  }

  try {
    const result = await listCompanyStoresByCompany(user.companyId, {
      page: 1,
      pageSize: 50,
      user,
    });
    const stores = (result.rows ?? []).map((row: DbStoreRow) => ({
      id: String(row.id),
      name: row.name,
      manager: row.manager_name ?? '-',
      verify: Number(row.today_verify_count ?? 0),
      status: row.status === '异常' ? 'warn' : 'normal',
    }));
    return NextResponse.json(stores);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询门店失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
