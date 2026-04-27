import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listAdminStaff } from '@/lib/database.js';

interface DbStaffRow {
  id: string | number;
  name?: string;
  full_name?: string;
  department?: string;
  store_name?: string;
  total_points?: number | string;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const result = await listAdminStaff({ page: 1, pageSize: 50 });
    const rows = ((result.rows ?? []) as DbStaffRow[])
      .map((row) => ({
        id: String(row.id),
        name: row.full_name ?? row.name ?? '-',
        org: row.store_name ?? row.department ?? '-',
        points: Number(row.total_points ?? 0),
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 20)
      .map((row, idx) => ({
        rank: idx + 1,
        name: row.name,
        org: row.org,
        points: row.points,
        isMe: row.id === user.id,
      }));
    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询排行失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
