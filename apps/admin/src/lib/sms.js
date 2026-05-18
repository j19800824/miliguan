import { randomBytes } from 'node:crypto';

const SMS_ENDPOINT = process.env.ALIYUN_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com';
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateAccountPassword(length = 10) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

function getSmsConfig() {
  return {
    enabled: process.env.ALIYUN_SMS_ENABLED === 'true',
    accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || '',
    signName: process.env.ALIYUN_SMS_SIGN_NAME || '',
    templateCode: process.env.ALIYUN_SMS_ACCOUNT_TEMPLATE_CODE || ''
  };
}

export function isMainlandMobile(phone) {
  return /^1\d{10}$/.test(String(phone || '').trim());
}

export function formatAccountSmsResult(prefix, result) {
  if (result?.sent) {
    return `${prefix}，账号密码短信已发送`;
  }
  if (result?.skipped) {
    return `${prefix}，短信未发送：${result.message}`;
  }
  return `${prefix}，短信发送失败：${result?.message || '请检查阿里云短信配置'}`;
}

export async function sendAccountPasswordSms(payload) {
  const phone = String(payload.phone || '').trim();
  if (!isMainlandMobile(phone)) {
    throw new Error('请填写 11 位手机号，用于发送账号密码短信');
  }
  if (!payload.password) {
    throw new Error('短信发送缺少一次性初始密码');
  }

  const config = getSmsConfig();
  if (!config.enabled) {
    return {
      sent: false,
      skipped: true,
      message: '当前环境未开启短信发送，请设置 ALIYUN_SMS_ENABLED=true'
    };
  }
  if (!config.accessKeyId || !config.accessKeySecret || !config.signName || !config.templateCode) {
    return {
      sent: false,
      skipped: true,
      message: '缺少 ALIYUN_SMS_ACCESS_KEY_ID / ALIYUN_SMS_ACCESS_KEY_SECRET / ALIYUN_SMS_SIGN_NAME / ALIYUN_SMS_ACCOUNT_TEMPLATE_CODE'
    };
  }

  const [{ default: DysmsapiClient, SendSmsRequest }, { Config }, { RuntimeOptions }] =
    await Promise.all([
      import('@alicloud/dysmsapi20170525'),
      import('@alicloud/openapi-client'),
      import('@alicloud/tea-util')
    ]);
  const ClientClass = DysmsapiClient.default || DysmsapiClient;
  const client = new ClientClass(
    new Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: SMS_ENDPOINT
    })
  );
  const request = new SendSmsRequest({
    phoneNumbers: phone,
    signName: config.signName,
    templateCode: config.templateCode,
    templateParam: JSON.stringify({
      name: payload.name || '',
      account: payload.account || phone,
      password: payload.password
    })
  });
  const response = await client.sendSmsWithOptions(request, new RuntimeOptions({}));
  const body = response?.body || {};

  if (body.code && body.code !== 'OK') {
    throw new Error(body.message || `阿里云短信返回异常：${body.code}`);
  }

  return { sent: true, skipped: false, message: body.message || 'OK', bizId: body.bizId };
}

export async function sendAccountPasswordSmsSafe(payload) {
  try {
    return await sendAccountPasswordSms(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : '短信发送失败';
    console.error('[sms] account password sms failed', {
      phone: payload.phone,
      account: payload.account,
      scene: payload.scene,
      message
    });
    return { sent: false, skipped: false, message };
  }
}
