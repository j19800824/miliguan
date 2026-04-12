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
    baseUrl: readEnv('OSS_BASE_URL'),
    uploadPrefix: readEnv('OSS_UPLOAD_PREFIX') || 'products'
  };
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
