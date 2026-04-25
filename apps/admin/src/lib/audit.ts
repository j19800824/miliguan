import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/database.js';
import type { AdminSessionUser } from '@/lib/auth/shared';

function jsonFromText(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function readRequestBody(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (request.method === 'GET' || request.method === 'HEAD') {
    return {};
  }

  try {
    if (contentType.includes('application/json')) {
      return await request.clone().json();
    }
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.clone().formData();
      return Object.fromEntries(
        Array.from(formData.entries()).map(([key, value]) => {
          if (value instanceof File) {
            return [key, { name: value.name, size: value.size, type: value.type }];
          }
          return [key, value];
        })
      );
    }
    const text = await request.clone().text();
    return jsonFromText(text);
  } catch {
    return {};
  }
}

async function readResponseBody(response: NextResponse) {
  try {
    const text = await response.clone().text();
    return jsonFromText(text);
  } catch {
    return {};
  }
}

function requestHeadersObject(request: Request) {
  return Object.fromEntries(Array.from(request.headers.entries()));
}

function searchParamsObject(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

export async function auditRoute(
  request: Request,
  {
    module,
    action,
    operator,
    handler
  }: {
    module: string;
    action: string;
    operator?: AdminSessionUser | null;
    handler: () => Promise<NextResponse>;
  }
) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const requestBody = await readRequestBody(request);
  const query = searchParamsObject(request);
  const headers = requestHeadersObject(request);
  let response: NextResponse;

  try {
    response = await handler();
  } catch (error) {
    response = NextResponse.json(
      { message: error instanceof Error ? error.message : '服务器内部错误' },
      { status: 500 }
    );
  }

  const responseBody = await readResponseBody(response);
  try {
    await createAuditLog({
      requestId,
      operatorId: operator?.id ?? '',
      operatorName: operator?.name ?? '',
      operatorAccount: operator?.account ?? '',
      operatorRole: operator?.roleName ?? '',
      module,
      action,
      method: request.method,
      path: new URL(request.url).pathname,
      query,
      requestHeaders: headers,
      requestBody,
      responseStatus: response.status,
      responseBody,
      ip: headers['x-forwarded-for'] ?? '',
      userAgent: headers['user-agent'] ?? '',
      durationMs: Date.now() - startedAt
    });
  } catch {
    // 审计失败不影响主业务请求
  }

  return response;
}
