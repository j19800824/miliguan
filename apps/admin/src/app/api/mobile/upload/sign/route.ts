import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { createOssClient, getOssConfig, isOssEnabled } from '@/lib/oss';

interface SignBody {
  filename?: string;
  contentType?: string;
  scope?: 'avatar' | 'order' | 'misc';
}

const SCOPE_PREFIX: Record<string, string> = {
  avatar: 'mobile/avatar',
  order: 'mobile/order',
  misc: 'mobile/misc',
};

function safeName(name: string) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  if (!isOssEnabled()) {
    return NextResponse.json(
      { message: 'OSS 未配置，无法上传文件' },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as SignBody;
    const scope = body.scope && SCOPE_PREFIX[body.scope] ? body.scope : 'misc';
    const prefix = SCOPE_PREFIX[scope];
    const ts = Date.now();
    const filename = `${prefix}/${user.id}/${ts}-${safeName(body.filename ?? 'file')}`;

    const client = createOssClient() as unknown as {
      signatureUrl: (
        name: string,
        opts: {
          method: string;
          expires: number;
          'Content-Type'?: string;
        },
      ) => string;
    };
    // 5-minute upload window
    const url = client.signatureUrl(filename, {
      method: 'PUT',
      expires: 300,
      'Content-Type': body.contentType ?? 'application/octet-stream',
    });

    const config = getOssConfig();
    const finalUrl = config.baseUrl
      ? `${config.baseUrl.replace(/\/+$/, '')}/${filename}`
      : `https://${config.bucket}.${config.region}.aliyuncs.com/${filename}`;

    return NextResponse.json({
      ok: true,
      uploadUrl: url,
      finalUrl,
      key: filename,
      contentType: body.contentType ?? 'application/octet-stream',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '签名失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
