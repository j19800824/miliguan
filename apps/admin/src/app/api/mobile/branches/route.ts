import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listCompanies } from '@/lib/database.js';

interface DbCompany {
  id: string | number;
  name: string;
  total_sales?: number | string;
  total_verify?: number | string;
  total_points?: number | string;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const result = await listCompanies({ page: 1, pageSize: 50, user });
    const rows = (result.rows ?? []) as DbCompany[];
    const sorted = [...rows].sort(
      (a, b) => Number(b.total_sales ?? 0) - Number(a.total_sales ?? 0),
    );
    const branches = sorted.map((row, idx) => ({
      id: String(row.id),
      name: row.name,
      sales: Number(row.total_sales ?? 0).toLocaleString('en-US'),
      verify: Number(row.total_verify ?? 0),
      points: Number(row.total_points ?? 0),
      rank: idx + 1,
      trend: idx % 2 === 0 ? 'up' : 'down',
    }));
    return NextResponse.json(branches);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询分公司失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
