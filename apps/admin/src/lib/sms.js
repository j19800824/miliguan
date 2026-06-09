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
    accountTemplateCode: process.env.ALIYUN_SMS_ACCOUNT_TEMPLATE_CODE || '',
    loginTemplateCode: process.env.ALIYUN_SMS_LOGIN_TEMPLATE_CODE || ''
  };
}

function missingCredentials(config) {
  return !config.accessKeyId || !config.accessKeySecret || !config.signName;
}

/**
 * Shared Aliyun SMS dispatcher. Resolves the SDK lazily so the dependency is
 * only loaded when SMS is actually enabled.
 */
async function dispatchSms({ phone, templateCode, templateParam }) {
  const config = getSmsConfig();
  if (!config.enabled) {
    return {
      sent: false,
      skipped: true,
      message: '当前环境未开启短信发送，请设置 ALIYUN_SMS_ENABLED=true'
    };
  }
  if (missingCredentials(config) || !templateCode) {
    return {
      sent: false,
      skipped: true,
      message:
        '缺少短信配置：ALIYUN_SMS_ACCESS_KEY_ID / ALIYUN_SMS_ACCESS_KEY_SECRET / ALIYUN_SMS_SIGN_NAME / 模板 CODE'
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
    templateCode,
    templateParam: JSON.stringify(templateParam)
  });
  const response = await client.sendSmsWithOptions(request, new RuntimeOptions({}));
  const body = response?.body || {};

  if (body.code && body.code !== 'OK') {
    throw new Error(body.message || `阿里云短信返回异常：${body.code}`);
  }

  return { sent: true, skipped: false, message: body.message || 'OK', bizId: body.bizId };
}

/**
 * 发送登录验证码短信。模板变量名必须是 `code`（与阿里云申报的验证码模板一致）。
 */
export async function sendLoginCodeSms(phone, code) {
  const normalizedPhone = String(phone || '').trim();
  if (!isMainlandMobile(normalizedPhone)) {
    throw new Error('请填写 11 位手机号，用于发送登录验证码');
  }
  if (!code) {
    throw new Error('短信发送缺少验证码');
  }
  const config = getSmsConfig();
  return dispatchSms({
    phone: normalizedPhone,
    templateCode: config.loginTemplateCode,
    templateParam: { code: String(code) }
  });
}

export async function sendLoginCodeSmsSafe(phone, code) {
  try {
    return await sendLoginCodeSms(phone, code);
  } catch (error) {
    const message = error instanceof Error ? error.message : '验证码短信发送失败';
    console.error('[sms] login code sms failed', { phone, message });
    return { sent: false, skipped: false, message };
  }
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
  return dispatchSms({
    phone,
    templateCode: config.accountTemplateCode,
    templateParam: {
      name: payload.name || '',
      account: payload.account || phone,
      password: payload.password
    }
  });
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
