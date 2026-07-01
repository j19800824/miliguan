import OSS from 'ali-oss';

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : '';
}

export function getOssConfig() {
  return {
    region: readEnv('OSS_REGION'),
    bucket: readEnv('OSS_BUCKET'),
    accessKeyId: readEnv('OSS_ACCESS_KEY_ID'),
    accessKeySecret: readEnv('OSS_ACCESS_KEY_SECRET'),
    endpoint: readEnv('OSS_ENDPOINT'),
    baseUrl: readEnv('APP_RELEASE_CDN_BASE_URL') || readEnv('OSS_BASE_URL'),
    uploadPrefix: readEnv('OSS_UPLOAD_PREFIX') || 'products'
  };
}

export function buildPublicOssUrl(key: string): string {
  const baseUrl = getOssConfig().baseUrl.replace(/\/+$/, '');
  const normalizedKey = String(key || '').replace(/^\/+/, '');
  return baseUrl && normalizedKey ? `${baseUrl}/${normalizedKey}` : '';
}

export function isOssEnabled() {
  const config = getOssConfig();
  return Boolean(config.region && config.bucket && config.accessKeyId && config.accessKeySecret);
}

export function createOssClient() {
  const config = getOssConfig();
  if (!isOssEnabled()) {
    throw new Error('阿里云 OSS 配置不完整');
  }

  return new OSS({
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: config.endpoint || undefined
  });
}

type SignFn = (
  name: string,
  opts: { method: string; expires: number; 'Content-Type'?: string }
) => string;

function forceHttpsSignedUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }
  return parsed.toString();
}

/** 生成浏览器直传用的签名 PUT URL（默认 10 分钟有效，APK 较大）。 */
export function signPutUrl(key: string, contentType?: string, expires = 600): string {
  const client = createOssClient() as unknown as { signatureUrl: SignFn };
  return forceHttpsSignedUrl(
    client.signatureUrl(key, {
      method: 'PUT',
      expires,
      'Content-Type': contentType || 'application/octet-stream'
    })
  );
}

/** 生成签名下载 GET URL（默认 1 小时有效）。桶保持私有读，无需公共读。 */
export function signGetUrl(key: string, expires = 3600): string {
  const client = createOssClient() as unknown as { signatureUrl: SignFn };
  return forceHttpsSignedUrl(client.signatureUrl(key, { method: 'GET', expires }));
}
