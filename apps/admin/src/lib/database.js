import { randomUUID, randomInt } from 'node:crypto';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { hashPassword, isPasswordHash, verifyPassword } from './auth/password.js';
import {
  generateAccountPassword,
  isMainlandMobile,
  sendLoginCodeSmsSafe
} from './sms.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured');
}

if (!redisUrl) {
  throw new Error('REDIS_URL is not configured');
}

const globalForData = globalThis;

const pool =
  globalForData.__miliguanPgPool ??
  new Pool({
    connectionString: databaseUrl
  });

const redis =
  globalForData.__miliguanRedisClient ??
  createClient({
    url: redisUrl
  });

if (process.env.NODE_ENV !== 'production') {
  globalForData.__miliguanPgPool = pool;
  globalForData.__miliguanRedisClient = redis;
}

let redisReadyPromise;
let initializedPromise;
const SESSION_TTL_SECONDS = 60 * 60;

// ----- 登录验证码（OTP）配置 -----
const OTP_CODE_TTL_SECONDS = 300; // 验证码有效期 5 分钟
const OTP_RESEND_TTL_SECONDS = 60; // 60 秒重发锁
const OTP_MAX_ATTEMPTS = 5; // 校验失败上限
const OTP_LOCK_TTL_SECONDS = 600; // 超过上限锁定 10 分钟

function now() {
  return new Date().toISOString();
}

function formatShanghaiDateTime(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

async function query(text, values = []) {
  return pool.query(text, values);
}

async function ensureRedis() {
  if (redis.isOpen) {
    return redis;
  }

  if (!redisReadyPromise) {
    redisReadyPromise = redis.connect().catch((error) => {
      redisReadyPromise = undefined;
      throw error;
    });
  }

  await redisReadyPromise;
  redisReadyPromise = undefined;
  return redis;
}

function toNumber(value) {
  return Number(value ?? 0);
}

function boolValue(value) {
  return Boolean(value);
}

function getUserCompanyId(user) {
  const value = user?.companyId ?? user?.company_id ?? '';
  return value ? Number(value) : null;
}

function canAccessAllCompanies(user) {
  if (user?.dataScope === 'all') return true;
  if (['company', 'store'].includes(user?.dataScope)) return false;
  const companyId = getUserCompanyId(user);
  if (!companyId) return true;
  const roleScope = String(user?.roleScope ?? user?.role_scope ?? '');
  return ['总部', '总公司', '平台', '系统'].includes(roleScope);
}

function assertCanAccessCompany(user, companyId) {
  if (canAccessAllCompanies(user)) return;
  if (getUserCompanyId(user) !== Number(companyId)) {
    throw new Error('当前账号没有该分公司的数据权限');
  }
}

function appendCompanyDataScope(sql, params, user, columnName = 'companies.id') {
  if (canAccessAllCompanies(user)) {
    return sql;
  }
  const companyId = getUserCompanyId(user);
  if (!companyId) {
    return sql.replace(/ORDER BY/i, ` WHERE 1 = 0 ORDER BY`);
  }
  params.push(companyId);
  const condition = `${columnName} = $${params.length}`;
  return sql.replace(/ORDER BY/i, `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${condition} ORDER BY`);
}

async function assertCanAccessEntityRecord(entity, id, user) {
  if (canAccessAllCompanies(user)) return;

  if (entity === 'companies') {
    assertCanAccessCompany(user, id);
    return;
  }

  const tableByEntity = {
    stores: 'company_stores',
    inventory: 'company_inventory',
    'purchase-orders': 'purchase_orders',
    'member-orders': 'member_orders'
  };
  const table = tableByEntity[entity];
  if (!table) return;

  const row = (await query(`SELECT company_id FROM ${table} WHERE id = $1`, [Number(id)])).rows[0];
  if (!row) {
    throw new Error('记录不存在');
  }
  assertCanAccessCompany(user, row.company_id);
}

function resolveAdminDataScope(row) {
  const roleScope = String(row?.role_scope ?? '');
  if (!row?.company_id || ['总部', '总公司', '平台', '系统'].includes(roleScope)) {
    return 'all';
  }
  return row?.store_id ? 'store' : 'company';
}

function parseJsonSetting(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function buildDeleteStatusFilter(filterValue, columnName) {
  if (filterValue === '__deleted__') {
    return { condition: `${columnName} = '已删除'`, applies: true };
  }
  if (filterValue === '__with_deleted__') {
    return { condition: '', applies: false };
  }
  return { condition: `${columnName} = '正常'`, applies: true };
}

async function getSystemSettingValue(settingKey) {
  const row = (
    await query('SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1', [settingKey])
  ).rows[0];
  return row?.setting_value ?? '';
}

async function getNumericSystemSetting(settingKey, fallback) {
  const raw = await getSystemSettingValue(settingKey);
  const normalized = String(raw || '').replace('%', '').trim();
  if (normalized.includes(':')) {
    const [left, right] = normalized.split(':').map((item) => Number(item.trim()));
    if (Number.isFinite(left) && Number.isFinite(right) && left !== 0) {
      return right / left;
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getDefaultStoreOrderQuota() {
  return getNumericSystemSetting('order_quota.default_store_quota', 298000);
}

async function getFirstStoreReceiptReturnRatio() {
  return getNumericSystemSetting('order_quota.first_store_receipt_return_ratio', 0.5);
}

async function getWriteoffOrderQuotaRebateRatio() {
  return getNumericSystemSetting('order_quota.rebate_ratio', 0.08);
}

async function changeStoreOrderQuota(storeId, delta, reason, createdBy = '系统') {
  const amount = Number(delta || 0);
  const store = (
    await query(
      `
        SELECT id, available_order_quota, total_order_quota
        FROM company_stores
        WHERE id = $1 AND delete_status = '正常'
      `,
      [Number(storeId)]
    )
  ).rows[0];
  if (!store) {
    throw new Error('门店不存在');
  }

  const nextAvailable = toNumber(store.available_order_quota) + amount;
  const nextTotal = amount > 0 ? toNumber(store.total_order_quota) + amount : toNumber(store.total_order_quota);
  await query(
    `
      UPDATE company_stores
      SET available_order_quota = $1, total_order_quota = $2, updated_by = $3, updated_at = $4
      WHERE id = $5
    `,
    [nextAvailable, nextTotal, createdBy, now(), Number(storeId)]
  );
  await appendApprovalLog({
    entityType: 'company_store',
    entityId: storeId,
    action: '门店订货额度变更',
    result: amount >= 0 ? '增加' : '扣减',
    note: `${reason}：${amount}`,
    createdBy
  });
}

async function applyFirstStoreReceiptCompanyRebate({
  companyId,
  storeId,
  orderQuotaTotal,
  sourcePurchaseOrderId = null,
  createdBy = '系统'
}) {
  const store = (
    await query(
      `
        SELECT id, first_purchase_rebate_done
        FROM company_stores
        WHERE id = $1 AND company_id = $2 AND delete_status = '正常'
      `,
      [Number(storeId), Number(companyId)]
    )
  ).rows[0];
  if (!store || store.first_purchase_rebate_done) {
    return;
  }

  const ratio = await getFirstStoreReceiptReturnRatio();
  const amount = Math.max(0, Number(orderQuotaTotal || 0) * ratio);
  if (amount > 0) {
    await changeCompanyOrderQuota(
      companyId,
      amount,
      `门店首次订货收货回补分公司订货额度（比例 ${ratio}）`,
      createdBy
    );
    await createAutoReturnOrderQuotaAdjustment({
      companyId,
      amount,
      reason: '门店首次报单收货，系统按基础设置自动回补分公司订货额度',
      createdBy,
      sourcePurchaseOrderId
    });
  }

  await query(
    `UPDATE company_stores SET first_purchase_rebate_done = TRUE, updated_by = $1, updated_at = $2 WHERE id = $3`,
    [createdBy, now(), Number(storeId)]
  );
}

async function getOrderQuotaLevelRules() {
  const raw = await getSystemSettingValue('order_quota.level_rules');
  const parsed = parseJsonSetting(raw, {
    战略级: 598000,
    成长级: 398000,
    标准级: 298000,
    孵化级: 198000
  });
  return parsed;
}

async function getDefaultCompanyLevel() {
  const level = await getSystemSettingValue('order_quota.default_company_level');
  return level || '标准级';
}

async function getCompanyBaseOrderQuota(companyLevel) {
  const rules = await getOrderQuotaLevelRules();
  const defaultLevel = await getDefaultCompanyLevel();
  const level = companyLevel && rules[companyLevel] ? companyLevel : defaultLevel;
  return {
    companyLevel: level,
    quota: Number(rules[level] ?? 298000)
  };
}

async function syncCompanyOrderQuota(companyId) {
  const company = (
    await query('SELECT id, company_level FROM companies WHERE id = $1', [Number(companyId)])
  ).rows[0];
  if (!company) {
    throw new Error('分公司不存在');
  }

  const { companyLevel, quota } = await getCompanyBaseOrderQuota(company.company_level);
  const used = Number(
    (
      await query(
        `
          SELECT COALESCE(SUM(order_quota_total), 0) AS amount
          FROM purchase_orders
          WHERE company_id = $1
            AND store_id IS NULL
            AND order_quota_deducted = TRUE
            AND delete_status = '正常'
        `,
        [Number(companyId)]
      )
    ).rows[0]?.amount ?? 0
  );

  const activeTemporary = Number(
    (
      await query(
        `
          SELECT COALESCE(SUM(order_quota_amount), 0) AS amount
          FROM order_quota_adjustments
          WHERE company_id = $1
            AND adjustment_type = '临时额度调整'
            AND status = '已通过'
            AND delete_status = '正常'
            AND (expires_at IS NULL OR expires_at > NOW())
        `,
        [Number(companyId)]
      )
    ).rows[0]?.amount ?? 0
  );

  const returned = Number(
    (
      await query(
        `
          SELECT COALESCE(SUM(order_quota_amount), 0) AS amount
          FROM order_quota_adjustments
          WHERE company_id = $1
            AND adjustment_type = '退货回补'
            AND status = '已通过'
            AND delete_status = '正常'
        `,
        [Number(companyId)]
      )
    ).rows[0]?.amount ?? 0
  );

  const totalOrderQuota = quota + activeTemporary + returned;
  const availableOrderQuota = totalOrderQuota - used;

  await query(
    `
      UPDATE companies
      SET company_level = $1, total_order_quota = $2, available_order_quota = $3, updated_by = $4, updated_at = $5
      WHERE id = $6
        AND (
          company_level IS DISTINCT FROM $1
          OR total_order_quota IS DISTINCT FROM $2
          OR available_order_quota IS DISTINCT FROM $3
        )
    `,
    [companyLevel, totalOrderQuota, availableOrderQuota, '系统', now(), Number(companyId)]
  );
}

async function softDeleteEntity(table, id, actorName, extraUpdates = {}) {
  const timestamp = now();
  const assignments = [
    'delete_status = $1',
    'deleted_at = $2',
    'deleted_by = $3',
    'updated_by = $4',
    'updated_at = $5'
  ];
  const values = ['已删除', timestamp, actorName, actorName, timestamp];
  let index = 6;

  for (const [key, value] of Object.entries(extraUpdates)) {
    assignments.push(`${key} = $${index}`);
    values.push(value);
    index += 1;
  }

  values.push(Number(id));
  await query(`UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${index}`, values);
}

async function markUpdatedBy(table, id, actorName) {
  await query(`UPDATE ${table} SET updated_by = $1 WHERE id = $2`, [actorName, Number(id)]);
}

async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      role_name TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      module TEXT NOT NULL,
      permission_name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL,
      status TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      company_level TEXT NOT NULL DEFAULT '标准级',
      manager_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      status TEXT NOT NULL,
      available_order_quota NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_order_quota NUMERIC(12, 2) NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_stores (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      manager_phone TEXT NOT NULL DEFAULT '',
      available_order_quota NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_order_quota NUMERIC(12, 2) NOT NULL DEFAULT 0,
      first_purchase_rebate_done BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_categories (
      id SERIAL PRIMARY KEY,
      category_name TEXT NOT NULL UNIQUE,
      category_code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      spu_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      scenario TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_skus (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      sku_code TEXT NOT NULL UNIQUE,
      spec TEXT NOT NULL,
      packaging TEXT NOT NULL,
      unit TEXT NOT NULL,
      barcode TEXT NOT NULL UNIQUE,
      qr_code TEXT NOT NULL UNIQUE,
      image_url TEXT NOT NULL DEFAULT '',
      order_quota_price NUMERIC(12, 2) NOT NULL,
      redeem_points_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_change_requests (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT '待审核',
      request_note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      approved_by TEXT NOT NULL DEFAULT '',
      approved_note TEXT NOT NULL DEFAULT '',
      approved_at TIMESTAMPTZ,
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_inventory (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      safety_stock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (company_id, sku_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      requested_quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_quota_adjustments (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      adjustment_type TEXT NOT NULL DEFAULT '临时额度调整',
      change_type TEXT NOT NULL,
      order_quota_amount NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      target_company_level TEXT NOT NULL DEFAULT '',
      source_member_order_id INTEGER,
      source_purchase_order_id INTEGER,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      order_quota_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL,
      remark TEXT NOT NULL DEFAULT '',
      abnormal_flag BOOLEAN NOT NULL DEFAULT FALSE,
      approval_status TEXT NOT NULL,
      order_quota_deducted BOOLEAN NOT NULL DEFAULT FALSE,
      stock_received BOOLEAN NOT NULL DEFAULT FALSE,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      order_quota_unit_price NUMERIC(12, 2) NOT NULL,
      subtotal_order_quota NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member_orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES company_stores(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      customer_type TEXT NOT NULL DEFAULT 'walk_in',
      member_id INTEGER,
      sales_staff_name TEXT NOT NULL,
      member_name TEXT NOT NULL DEFAULT '散客',
      member_phone TEXT NOT NULL DEFAULT '',
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
      stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
      writeoff_quota_rebated BOOLEAN NOT NULL DEFAULT FALSE,
      order_quota_returned BOOLEAN NOT NULL DEFAULT FALSE,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member_order_items (
      id SERIAL PRIMARY KEY,
      member_order_id INTEGER NOT NULL REFERENCES member_orders(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12, 2) NOT NULL,
      point_rebate_base NUMERIC(12, 2) NOT NULL,
      writeoff_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS writeoff_records (
      id SERIAL PRIMARY KEY,
      member_order_id INTEGER NOT NULL REFERENCES member_orders(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES company_stores(id) ON DELETE CASCADE,
      sales_staff_name TEXT NOT NULL,
      product_code TEXT NOT NULL,
      status TEXT NOT NULL,
      writeoff_time TEXT NOT NULL,
      remark TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS approval_logs (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      setting_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      setting_name TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_redeem_items (
      id SERIAL PRIMARY KEY,
      item_name TEXT NOT NULL,
      item_code TEXT NOT NULL UNIQUE,
      points_cost NUMERIC(12, 2) NOT NULL,
      stock INTEGER NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_redeem_orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      item_id INTEGER NOT NULL REFERENCES point_redeem_items(id) ON DELETE CASCADE,
      member_name TEXT NOT NULL,
      member_phone TEXT NOT NULL,
      points_cost NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      account TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      department TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      login_scope TEXT NOT NULL DEFAULT 'admin',
      last_login TEXT NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      manager_name TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL,
      staff_count INTEGER NOT NULL,
      monthly_revenue NUMERIC(12, 2) NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      level TEXT NOT NULL,
      tags TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT NOT NULL,
      total_spent NUMERIC(12, 2) NOT NULL,
      delete_status TEXT NOT NULL DEFAULT '正常',
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS delete_requests (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT '待审核',
      request_note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      approved_by TEXT NOT NULL DEFAULT '',
      approved_note TEXT NOT NULL DEFAULT '',
      approved_at TIMESTAMPTZ,
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id SERIAL PRIMARY KEY,
      request_id TEXT NOT NULL,
      operator_id TEXT NOT NULL DEFAULT '',
      operator_name TEXT NOT NULL DEFAULT '',
      operator_account TEXT NOT NULL DEFAULT '',
      operator_role TEXT NOT NULL DEFAULT '',
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      query_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      response_status INTEGER NOT NULL,
      response_body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      id SERIAL PRIMARY KEY,
      recipient_scope TEXT NOT NULL,
      recipient_user_id INTEGER,
      recipient_company_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      action_type TEXT NOT NULL DEFAULT 'redirect',
      action_label TEXT NOT NULL DEFAULT '',
      action_url TEXT NOT NULL DEFAULT '',
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL,
      read_at TIMESTAMPTZ
    );
  `);
}

async function migrateTables() {
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'available_points'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'available_order_quota'
      ) THEN
        ALTER TABLE companies RENAME COLUMN available_points TO available_order_quota;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'total_points'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'total_order_quota'
      ) THEN
        ALTER TABLE companies RENAME COLUMN total_points TO total_order_quota;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_skus' AND column_name = 'points_price'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'product_skus' AND column_name = 'order_quota_price'
      ) THEN
        ALTER TABLE product_skus RENAME COLUMN points_price TO order_quota_price;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'point_adjustments'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'order_quota_adjustments'
      ) THEN
        ALTER TABLE point_adjustments RENAME TO order_quota_adjustments;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_quota_adjustments' AND column_name = 'points_amount'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_quota_adjustments' AND column_name = 'order_quota_amount'
      ) THEN
        ALTER TABLE order_quota_adjustments RENAME COLUMN points_amount TO order_quota_amount;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_orders' AND column_name = 'points_total'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_orders' AND column_name = 'order_quota_total'
      ) THEN
        ALTER TABLE purchase_orders RENAME COLUMN points_total TO order_quota_total;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_orders' AND column_name = 'points_deducted'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_orders' AND column_name = 'order_quota_deducted'
      ) THEN
        ALTER TABLE purchase_orders RENAME COLUMN points_deducted TO order_quota_deducted;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_order_items' AND column_name = 'points_unit_price'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_order_items' AND column_name = 'order_quota_unit_price'
      ) THEN
        ALTER TABLE purchase_order_items RENAME COLUMN points_unit_price TO order_quota_unit_price;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_order_items' AND column_name = 'subtotal_points'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_order_items' AND column_name = 'subtotal_order_quota'
      ) THEN
        ALTER TABLE purchase_order_items RENAME COLUMN subtotal_points TO subtotal_order_quota;
      END IF;
    END $$;
  `);
  const softDeleteTables = [
    'roles',
    'permissions',
    'companies',
    'company_stores',
    'product_categories',
    'products',
    'product_skus',
    'company_inventory',
    'inventory_adjustments',
    'order_quota_adjustments',
    'purchase_orders',
    'member_orders',
    'admin_staff',
    'stores',
    'members'
  ];

  for (const table of softDeleteTables) {
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS delete_status TEXT NOT NULL DEFAULT '正常'`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by TEXT NOT NULL DEFAULT ''`);
  }
  const updatedByTables = [
    ...softDeleteTables,
    'product_change_requests',
    'delete_requests',
    'point_redeem_items',
    'point_redeem_orders'
  ];

  for (const table of updatedByTables) {
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT ''`);
  }
  await query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_level TEXT NOT NULL DEFAULT '标准级'`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS manager_staff_id INTEGER REFERENCES admin_staff(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS manager_phone TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS available_order_quota NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS total_order_quota NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS first_purchase_rebate_done BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE member_orders ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'walk_in'`);
  await query(`ALTER TABLE member_orders ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES members(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE member_orders ADD COLUMN IF NOT EXISTS writeoff_quota_rebated BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE member_orders ADD COLUMN IF NOT EXISTS order_quota_returned BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`UPDATE member_orders SET customer_type = 'walk_in' WHERE customer_type = '' OR customer_type IS NULL`);
  await query(`UPDATE member_orders SET member_name = '散客' WHERE customer_type = 'walk_in' AND (member_name = '' OR member_name IS NULL)`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS recipient_scope TEXT NOT NULL DEFAULT 'all'`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS recipient_user_id INTEGER`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS recipient_company_id INTEGER`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'system'`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unread'`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'redirect'`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS action_label TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS action_url TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await query(`ALTER TABLE admin_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`);
  await query(`ALTER TABLE order_quota_adjustments ADD COLUMN IF NOT EXISTS adjustment_type TEXT NOT NULL DEFAULT '临时额度调整'`);
  await query(`ALTER TABLE order_quota_adjustments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
  await query(`ALTER TABLE order_quota_adjustments ADD COLUMN IF NOT EXISTS target_company_level TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE order_quota_adjustments ADD COLUMN IF NOT EXISTS source_member_order_id INTEGER REFERENCES member_orders(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE order_quota_adjustments ADD COLUMN IF NOT EXISTS source_purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS redeem_points_price NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await query(`
    UPDATE product_skus
    SET
      name = CASE WHEN name = '' THEN sku_code ELSE name END,
      redeem_points_price = CASE WHEN redeem_points_price = 0 THEN order_quota_price ELSE redeem_points_price END,
      sale_price = CASE WHEN sale_price = 0 THEN order_quota_price ELSE sale_price END
  `);
  await query(`
    ALTER TABLE admin_staff
    ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL
  `);
  await query(`
    ALTER TABLE admin_staff
    ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL
  `);
  await query(`
    ALTER TABLE admin_staff
    ADD COLUMN IF NOT EXISTS login_scope TEXT NOT NULL DEFAULT 'admin'
  `);
  // 验证码登录：把 admin 超管手机号迁移为绑定的真实号码（幂等）。
  await query(`
    UPDATE admin_staff
    SET phone = '13601667307'
    WHERE account = 'admin' AND phone <> '13601667307'
  `);
  await query(`
    ALTER TABLE product_change_requests
    ADD COLUMN IF NOT EXISTS request_note TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    ALTER TABLE product_change_requests
    ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    ALTER TABLE product_change_requests
    ADD COLUMN IF NOT EXISTS approved_note TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    ALTER TABLE product_change_requests
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
  `);
  await query(`
    ALTER TABLE delete_requests
    ADD COLUMN IF NOT EXISTS request_note TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    ALTER TABLE delete_requests
    ADD COLUMN IF NOT EXISTS approved_by TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    ALTER TABLE delete_requests
    ADD COLUMN IF NOT EXISTS approved_note TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    ALTER TABLE delete_requests
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
  `);
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'order_quota.cash_ratio',
      '订货额度规则',
      '订货额度与人民币换算比例',
      '1:1',
      '默认 1 订货额度 = 1 元，用于总部给分公司发放订货额度的后台口径。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'order_quota.default_store_quota',
      '订货额度规则',
      '门店默认订货额度',
      '298000',
      '新建门店时自动初始化的可用订货额度和累计订货额度。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'order_quota.first_store_receipt_return_ratio',
      '订货额度规则',
      '门店首次收货回补分公司比例',
      '0.5',
      '门店首次向分公司订货并确认收货后，按本比例回补所属分公司的订货额度。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'order_quota.default_company_level',
      '订货额度规则',
      '默认分公司等级',
      '标准级',
      '分公司创建时默认使用的等级，等级对应的初始订货额度由等级额度配置决定。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'order_quota.level_rules',
      '订货额度规则',
      '分公司等级额度配置',
      JSON.stringify({
        战略级: 598000,
        成长级: 398000,
        标准级: 298000,
        孵化级: 198000
      }),
      '不同分公司等级对应的初始订货额度。未命中时回退到默认等级。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'mobile.splash.enabled',
      '移动端启动图',
      '是否启用 App 启动图',
      'true',
      '开启后 App 启动时展示品牌启动图；关闭后直接进入登录或首页。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'mobile.splash.image_url',
      '移动端启动图',
      'App 启动图 URL',
      '',
      '留空时使用服务器默认启动图；填写 HTTPS 图片地址后，App 会下载并在下次启动优先使用。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'mobile.splash.version',
      '移动端启动图',
      'App 启动图版本号',
      'default-20260701',
      '更换启动图后修改这个版本号，App 会识别为新图并重新缓存。',
      '系统',
      now(),
      now()
    ]
  );
  await query(
    `
      INSERT INTO system_settings
        (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (setting_key) DO NOTHING
    `,
    [
      'mobile.splash.duration_ms',
      '移动端启动图',
      'App 启动图展示时长',
      '1200',
      'App 内品牌启动图展示时长，单位毫秒。',
      '系统',
      now(),
      now()
    ]
  );
  await query(`
    UPDATE system_settings
    SET setting_key = 'order_quota.cash_ratio'
    WHERE setting_key = 'points.cash_ratio'
      AND NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'order_quota.cash_ratio')
  `);
  await query(`
    UPDATE system_settings
    SET setting_key = 'order_quota.rebate_ratio'
    WHERE setting_key = 'points.rebate_ratio'
      AND NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'order_quota.rebate_ratio')
  `);
  await query(`
    UPDATE system_settings
    SET
      category = CASE
        WHEN setting_key = 'order_quota.cash_ratio' THEN '订货额度规则'
        WHEN setting_key = 'order_quota.rebate_ratio' THEN '订货额度规则'
        ELSE category
      END,
      setting_name = CASE
        WHEN setting_key = 'order_quota.cash_ratio' THEN '订货额度与人民币换算比例'
        WHEN setting_key = 'order_quota.rebate_ratio' THEN '核销回补订货额度比例'
        ELSE setting_name
      END,
      description = CASE
        WHEN setting_key = 'order_quota.cash_ratio' THEN '默认 1 订货额度 = 1 元，用于总部给分公司发放订货额度的后台口径。'
        WHEN setting_key = 'order_quota.rebate_ratio' THEN '核销成功后按订单金额的一定比例回补订货额度。'
        ELSE description
      END
    WHERE setting_key IN ('order_quota.cash_ratio', 'order_quota.rebate_ratio')
  `);
  await query(`
    UPDATE permissions
    SET code = CASE
      WHEN code = 'points:view' THEN 'order-quota:view'
      WHEN code = 'points:edit' THEN 'order-quota:edit'
      WHEN code = 'points:approve' THEN 'order-quota:approve'
      ELSE code
    END
    WHERE code IN ('points:view', 'points:edit', 'points:approve')
      AND NOT EXISTS (
        SELECT 1
        FROM permissions newer
        WHERE newer.code IN ('order-quota:view', 'order-quota:edit', 'order-quota:approve')
      )
  `);
  await query(`
    UPDATE permissions
    SET
      module = '订货额度管理',
      permission_name = CASE
        WHEN code = 'order-quota:view' THEN '查看订货额调整记录'
        WHEN code = 'order-quota:edit' THEN '编辑订货额调整记录'
        WHEN code = 'order-quota:approve' THEN '审核订货额调整'
        ELSE permission_name
      END
    WHERE code IN ('order-quota:view', 'order-quota:edit', 'order-quota:approve')
  `);
}

async function seedRoles() {
  const timestamp = now();
  const roles = [
    ['超级管理员', '平台', '启用', '拥有全部后台菜单、数据与配置权限。'],
    ['总部运营', '平台', '启用', '负责商品、分公司、订货单、会员订单日常管理。'],
    ['总部审核员', '平台', '启用', '负责订货额度调整、库存调整和异常订货单审核。'],
    ['商品管理员', '平台', '启用', '负责商品主数据与 SKU 维护。'],
    ['分公司管理员', '分公司', '启用', '负责所属分公司门店、库存和会员订单管理。'],
    ['门店 App 账号', '门店', '启用', '仅供门店负责人登录 App 使用，不开放管理后台菜单。'],
    ['老板视图账号', '平台', '启用', '仅查看工作台、报表和经营数据，不做编辑。']
  ];

  for (const role of roles) {
    await query(
      `
        INSERT INTO roles (role_name, scope, status, description, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (role_name) DO NOTHING
      `,
      [...role, timestamp, timestamp]
    );
  }
}

async function seedPermissions() {
  const timestamp = now();
  const permissions = [
    ['工作台', '查看工作台', 'overview:view', '页面', '启用'],
    ['分类管理', '查看商品分类', 'categories:view', '页面', '启用'],
    ['分类管理', '编辑商品分类', 'categories:edit', '按钮', '启用'],
    ['商品管理', '查看商品列表', 'products:view', '页面', '启用'],
    ['商品管理', '编辑商品资料', 'products:edit', '按钮', '启用'],
    ['商品管理', '审核商品变更', 'products:approve', '按钮', '启用'],
    ['分公司管理', '查看分公司列表', 'companies:view', '页面', '启用'],
    ['分公司管理', '编辑分公司资料', 'companies:edit', '按钮', '启用'],
    ['门店管理', '查看分公司门店', 'company-stores:view', '页面', '启用'],
    ['门店管理', '编辑分公司门店', 'company-stores:edit', '按钮', '启用'],
    ['库存管理', '查看库存总览', 'inventory:view', '页面', '启用'],
    ['库存管理', '编辑库存记录', 'inventory:edit', '按钮', '启用'],
    ['库存管理', '审核库存调整', 'inventory:approve', '按钮', '启用'],
    ['订货单管理', '查看订货单列表', 'purchase-orders:view', '页面', '启用'],
    ['订货单管理', '编辑订货单', 'purchase-orders:edit', '按钮', '启用'],
    ['订货单管理', '审核订货单', 'purchase-orders:approve', '按钮', '启用'],
    ['会员订单管理', '查看会员订单列表', 'member-orders:view', '页面', '启用'],
    ['会员订单管理', '编辑会员订单', 'member-orders:edit', '按钮', '启用'],
    ['会员订单管理', '处理会员订单异常', 'member-orders:handle', '按钮', '启用'],
    ['订货额度管理', '查看订货额调整记录', 'order-quota:view', '页面', '启用'],
    ['订货额度管理', '编辑订货额调整记录', 'order-quota:edit', '按钮', '启用'],
    ['订货额度管理', '审核订货额调整', 'order-quota:approve', '按钮', '启用'],
    ['后台员工', '查看员工列表', 'staff:view', '页面', '启用'],
    ['后台员工', '编辑员工账号', 'staff:edit', '按钮', '启用'],
    ['角色管理', '查看角色列表', 'roles:view', '页面', '启用'],
    ['角色管理', '编辑角色信息', 'roles:edit', '按钮', '启用'],
    ['角色管理', '配置角色权限', 'roles:grant', '按钮', '启用'],
    ['权限管理', '查看权限列表', 'permissions:view', '页面', '启用'],
    ['权限管理', '编辑权限点', 'permissions:edit', '按钮', '启用'],
    ['删除管理', '审核删除申请', 'delete:approve', '按钮', '启用'],
    ['会员管理', '查看会员列表', 'members:view', '页面', '启用'],
    ['会员管理', '编辑会员档案', 'members:edit', '按钮', '启用'],
    ['数据报表', '查看数据报表', 'reports:view', '页面', '启用'],
    ['协同看板', '查看协同看板', 'kanban:view', '页面', '启用'],
    ['通知中心', '查看通知中心', 'notifications:view', '页面', '启用'],
    ['系统设置', '查看系统设置', 'settings:view', '页面', '启用'],
    ['应用发布', '查看应用版本', 'app-releases:view', '页面', '启用'],
    ['应用发布', '上传应用版本', 'app-releases:edit', '按钮', '启用']
  ];

  for (const permission of permissions) {
    await query(
      `
        INSERT INTO permissions (module, permission_name, code, level, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (code) DO NOTHING
      `,
      [...permission, timestamp, timestamp]
    );
  }
}

async function seedRolePermissions() {
  const timestamp = now();
  const roles = (await query('SELECT id, role_name FROM roles')).rows;
  const permissions = (await query('SELECT id, code FROM permissions')).rows;
  const roleMap = Object.fromEntries(roles.map((role) => [role.role_name, role.id]));
  const permissionMap = Object.fromEntries(
    permissions.map((permission) => [permission.code, permission.id])
  );

  const relations = {
    超级管理员: Object.keys(permissionMap),
    总部运营: [
      'overview:view',
      'categories:view',
      'categories:edit',
      'products:view',
      'products:edit',
      'companies:view',
      'companies:edit',
      'company-stores:view',
      'company-stores:edit',
      'inventory:view',
      'purchase-orders:view',
      'purchase-orders:edit',
      'member-orders:view',
      'member-orders:edit',
      'order-quota:view',
      'staff:view',
      'roles:view',
      'permissions:view',
      'delete:approve',
      'reports:view',
      'kanban:view',
      'notifications:view'
    ],
    总部审核员: [
      'overview:view',
      'products:view',
      'products:approve',
      'companies:view',
      'inventory:view',
      'inventory:approve',
      'purchase-orders:view',
      'purchase-orders:approve',
      'member-orders:view',
      'member-orders:handle',
      'order-quota:view',
      'order-quota:approve',
      'delete:approve',
      'reports:view',
      'notifications:view'
    ],
    商品管理员: ['overview:view', 'categories:view', 'categories:edit', 'products:view', 'products:edit', 'inventory:view', 'notifications:view'],
    分公司管理员: [
      'overview:view',
      'companies:view',
      'company-stores:view',
      'company-stores:edit',
      'inventory:view',
      'purchase-orders:view',
      'purchase-orders:edit',
      'member-orders:view',
      'member-orders:edit',
      'order-quota:view',
      'notifications:view'
    ],
    '门店 App 账号': [],
    老板视图账号: ['overview:view', 'companies:view', 'inventory:view', 'purchase-orders:view', 'member-orders:view', 'reports:view', 'notifications:view']
  };

  for (const [roleName, permissionCodes] of Object.entries(relations)) {
    const roleId = roleMap[roleName];
    if (!roleId) continue;

    for (const permissionCode of permissionCodes) {
      const permissionId = permissionMap[permissionCode];
      if (!permissionId) continue;

      await query(
        `
          INSERT INTO role_permissions (role_id, permission_id, created_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `,
        [roleId, permissionId, timestamp]
      );
    }
  }
}

async function seedCompanies() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM companies')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const companies = [
    ['华东分公司', 'BR-EAST-001', '赵晴', '13810010001', '启用', 8600, 20000, '负责上海、杭州、苏州门店经营'],
    ['华南分公司', 'BR-SOUTH-001', '郑南', '13810010002', '启用', 4200, 15000, '负责广州、深圳市场拓展'],
    ['西南分公司', 'BR-WEST-001', '陈卓', '13810010003', '筹备中', 2100, 10000, '负责成都与周边门店布局']
  ];

  for (const company of companies) {
    await query(
      `
        INSERT INTO companies
          (name, code, manager_name, contact_phone, status, available_order_quota, total_order_quota, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (code) DO NOTHING
      `,
      [...company, timestamp, timestamp]
    );
  }
}

async function seedCompanyStores() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM company_stores')).rows[0].count);
  if (count > 0) return;

  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const timestamp = now();
  const defaultStoreQuota = await getDefaultStoreOrderQuota();
  const stores = [
    [companyMap['BR-EAST-001'], '静安寺社区门店', 'ST-EAST-001', '上海市静安区南京西路 1888 号', '陈雪', '13810020001', defaultStoreQuota, defaultStoreQuota, '营业中'],
    [companyMap['BR-EAST-001'], '陆家嘴社区门店', 'ST-EAST-002', '上海市浦东新区银城中路 66 号', '李韬', '13810020002', defaultStoreQuota, defaultStoreQuota, '营业中'],
    [companyMap['BR-EAST-001'], '万象城社区门店', 'ST-EAST-003', '杭州市拱墅区丰潭路 380 号', '宋宁', '13810020003', defaultStoreQuota, defaultStoreQuota, '营业中'],
    [companyMap['BR-SOUTH-001'], '天河城社区门店', 'ST-SOUTH-001', '广州市天河区天河路 208 号', '周敏', '13810020004', defaultStoreQuota, defaultStoreQuota, '筹备中'],
    [companyMap['BR-WEST-001'], 'IFS 社区门店', 'ST-WEST-001', '成都市锦江区红星路三段 1 号', '吴哲', '13810020005', defaultStoreQuota, defaultStoreQuota, '营业中']
  ];

  for (const store of stores) {
    await query(
      `
        INSERT INTO company_stores
          (company_id, name, code, address, manager_name, manager_phone, available_order_quota, total_order_quota, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (code) DO NOTHING
      `,
      [...store, timestamp, timestamp]
    );
  }
}

async function seedProductCategories() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM product_categories')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const categories = [
    ['饮品', 'CAT-DRINK', '咖啡、茶饮等高频消费品', '启用', 10],
    ['轻食', 'CAT-LIGHT-FOOD', '早餐、轻食与搭配品', '启用', 20],
    ['周边', 'CAT-MERCH', '品牌周边与兑换商品', '启用', 30]
  ];

  for (const category of categories) {
    await query(
      `
        INSERT INTO product_categories
          (category_name, category_code, description, status, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (category_code) DO NOTHING
      `,
      [...category, timestamp, timestamp]
    );
  }
}

async function seedProducts() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM products')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const products = [
    ['SPU-COFFEE-001', '米粒冠冻干咖啡', '米粒冠', '饮品', '办公下午茶', '总部统一供货的高频饮品 SKU 组合。', '启用'],
    ['SPU-TEA-001', '轻享鲜萃茶', '米粒冠', '饮品', '门店热销', '适合下午茶和外带场景。', '启用'],
    ['SPU-SNACK-001', '谷物能量棒', '米粒冠', '轻食', '早餐场景', '门店会员订单高频搭配品。', '启用']
  ];

  for (const product of products) {
    await query(
      `
        INSERT INTO products
          (spu_code, name, brand, category, scenario, description, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (spu_code) DO NOTHING
      `,
      [...product, timestamp, timestamp]
    );
  }
}

async function seedProductSkus() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM product_skus')).rows[0].count);
  if (count > 0) return;

  const products = (await query('SELECT id, spu_code FROM products')).rows;
  const productMap = Object.fromEntries(products.map((item) => [item.spu_code, item.id]));
  const timestamp = now();
  const skus = [
    [productMap['SPU-COFFEE-001'], '冻干咖啡箱装', 'SKU-COFFEE-BOX-01', '12 瓶 / 箱', '箱装', '箱', '690100000001', 'QR-COFFEE-BOX-01', '', 180, 220, 168, '启用'],
    [productMap['SPU-COFFEE-001'], '冻干咖啡单瓶', 'SKU-COFFEE-BTL-01', '1 瓶', '单瓶', '瓶', '690100000002', 'QR-COFFEE-BTL-01', '', 18, 25, 15, '启用'],
    [productMap['SPU-TEA-001'], '鲜萃茶杯装', 'SKU-TEA-CUP-01', '500ml', '杯装', '杯', '690100000003', 'QR-TEA-CUP-01', '', 12, 18, 12, '启用'],
    [productMap['SPU-TEA-001'], '鲜萃茶箱装', 'SKU-TEA-BOX-01', '20 杯 / 箱', '箱装', '箱', '690100000004', 'QR-TEA-BOX-01', '', 220, 280, 208, '启用'],
    [productMap['SPU-SNACK-001'], '能量棒盒装', 'SKU-SNACK-BOX-01', '24 支 / 盒', '盒装', '盒', '690100000005', 'QR-SNACK-BOX-01', '', 96, 128, 88, '启用']
  ];

  for (const sku of skus) {
    await query(
      `
        INSERT INTO product_skus
          (product_id, name, sku_code, spec, packaging, unit, barcode, qr_code, image_url, order_quota_price, redeem_points_price, sale_price, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (sku_code) DO NOTHING
      `,
      [...sku, timestamp, timestamp]
    );
  }
}

async function seedAdminStaff() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM admin_staff')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const roles = (await query('SELECT id, role_name FROM roles')).rows;
  const roleMap = Object.fromEntries(roles.map((role) => [role.role_name, role.id]));
  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const stores = (await query('SELECT id, code FROM company_stores')).rows;
  const storeMap = Object.fromEntries(stores.map((item) => [item.code, item.id]));
  // 验证码登录：admin 超管绑定真实手机号 13601667307；其余种子账号用假号 138000000xx。
  const staff = [
    ['林可', 'admin', 'admin123', '产品技术中心', roleMap['超级管理员'], null, null, '在职', '13601667307', 'linke@miliguan.local', '今天 09:21'],
    ['赵晴', 'operator', 'operator123', '总部运营部', roleMap['总部运营'], companyMap['BR-EAST-001'], null, '在职', '13800000001', 'zhaoqing@miliguan.local', '今天 10:05'],
    ['周筱', 'auditor', 'auditor123', '总部审核组', roleMap['总部审核员'], null, null, '在职', '13800000002', 'zhouxiao@miliguan.local', '昨天 18:42'],
    ['郑南', 'product', 'product123', '商品中心', roleMap['商品管理员'], null, null, '在职', '13800000003', 'zhengnan@miliguan.local', '昨天 14:16'],
    ['陈卓', 'branch', 'branch123', '华东分公司', roleMap['分公司管理员'], companyMap['BR-EAST-001'], storeMap['ST-EAST-001'], '在职', '13800000004', 'chenzhuo@miliguan.local', '今天 08:48'],
    ['吴敏', 'boss', 'boss123', '经营管理中心', roleMap['老板视图账号'], null, null, '在职', '13800000005', 'wumin@miliguan.local', '2026-04-03 09:12']
  ];

  for (const item of staff) {
    const hashedPassword = await hashPassword(item[2]);
    await query(
      `
        INSERT INTO admin_staff
          (name, account, password, department, role_id, company_id, store_id, status, phone, email, last_login, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (account) DO NOTHING
      `,
      [item[0], item[1], hashedPassword, ...item.slice(3), timestamp, timestamp]
    );
  }
}

async function migrateLegacyStaffPasswords() {
  const rows = (
    await query(
      `
        SELECT id, password
        FROM admin_staff
        WHERE password IS NOT NULL
      `
    )
  ).rows;

  for (const row of rows) {
    if (isPasswordHash(row.password)) {
      continue;
    }

    const hashed = await hashPassword(row.password);
    await query('UPDATE admin_staff SET password = $1, updated_by = $2, updated_at = $3 WHERE id = $4', [
      hashed,
      '系统',
      now(),
      row.id
    ]);
  }
}

async function seedLegacyStores() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM stores')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const stores = [
    ['静安寺门店', '陈雪', '上海', '待审核', 8, 86200],
    ['陆家嘴门店', '李韬', '上海', '营业中', 12, 152480],
    ['万象城门店', '宋宁', '杭州', '营业中', 9, 104360]
  ];

  for (const store of stores) {
    await query(
      `
        INSERT INTO stores (name, manager_name, city, status, staff_count, monthly_revenue, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [...store, timestamp, timestamp]
    );
  }
}

async function seedMembers() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM members')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const members = [
    ['王静', '黑金', '高频到店 / 下午茶', '上海', '高价值', 12860],
    ['刘晨', '金卡', '早餐偏好 / 团购', '杭州', '活跃', 4320],
    ['张怡', '银卡', '首单转化', '苏州', '沉默', 680]
  ];

  for (const member of members) {
    await query(
      `
        INSERT INTO members (name, level, tags, city, status, total_spent, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [...member, timestamp, timestamp]
    );
  }
}

async function seedCompanyInventory() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM company_inventory')).rows[0].count);
  if (count > 0) return;

  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const skus = (await query('SELECT id, sku_code FROM product_skus')).rows;
  const skuMap = Object.fromEntries(skus.map((item) => [item.sku_code, item.id]));
  const timestamp = now();
  const rows = [
    [companyMap['BR-EAST-001'], skuMap['SKU-COFFEE-BOX-01'], 42, 15, '充足'],
    [companyMap['BR-EAST-001'], skuMap['SKU-TEA-BOX-01'], 18, 12, '预警'],
    [companyMap['BR-SOUTH-001'], skuMap['SKU-SNACK-BOX-01'], 26, 10, '充足'],
    [companyMap['BR-WEST-001'], skuMap['SKU-COFFEE-BTL-01'], 8, 20, '低库存']
  ];

  for (const row of rows) {
    await query(
      `
        INSERT INTO company_inventory
          (company_id, sku_id, quantity, safety_stock, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (company_id, sku_id) DO NOTHING
      `,
      [...row, timestamp, timestamp]
    );
  }
}

async function seedPointAdjustments() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM order_quota_adjustments')).rows[0].count);
  if (count > 0) return;

  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const timestamp = now();
  const rows = [
    [companyMap['BR-EAST-001'], '增加', 3000, '开业首月激励补贴', '已通过', '林可'],
    [companyMap['BR-SOUTH-001'], '减少', 800, '异常退货扣减', '待审核', '周筱']
  ];

  for (const row of rows) {
    await query(
      `
        INSERT INTO order_quota_adjustments
          (company_id, change_type, order_quota_amount, reason, status, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [...row, timestamp, timestamp]
    );
  }
}

async function seedPurchaseOrders() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM purchase_orders')).rows[0].count);
  if (count > 0) return;

  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const skus = (await query('SELECT id, sku_code, order_quota_price FROM product_skus')).rows;
  const skuMap = Object.fromEntries(skus.map((item) => [item.sku_code, item]));
  const timestamp = now();
  const orders = [
    ['PO-202604-001', companyMap['BR-EAST-001'], '已入库', 540, '为会员活动备货', false, '已通过', true, true, 'SKU-COFFEE-BOX-01', 3],
    ['PO-202604-002', companyMap['BR-SOUTH-001'], '待审核', 1320, '新店开业首批订货', true, '待审核', false, false, 'SKU-TEA-BOX-01', 6],
    ['PO-202604-003', companyMap['BR-WEST-001'], '待入库', 192, '早餐组合补货', false, '自动通过', true, false, 'SKU-SNACK-BOX-01', 2]
  ];

  for (const order of orders) {
    const [orderNo, companyId, status, orderQuotaTotal, remark, abnormalFlag, approvalStatus, orderQuotaDeducted, stockReceived, skuCode, quantity] = order;
    const result = await query(
      `
        INSERT INTO purchase_orders
          (order_no, company_id, status, order_quota_total, remark, abnormal_flag, approval_status, order_quota_deducted, stock_received, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (order_no) DO NOTHING
        RETURNING id
      `,
      [orderNo, companyId, status, orderQuotaTotal, remark, abnormalFlag, approvalStatus, orderQuotaDeducted, stockReceived, timestamp, timestamp]
    );

    const purchaseOrderId =
      result.rows[0]?.id ??
      (await query('SELECT id FROM purchase_orders WHERE order_no = $1', [orderNo])).rows[0].id;
    const sku = skuMap[skuCode];
    await query(
      `
        INSERT INTO purchase_order_items
          (purchase_order_id, sku_id, quantity, order_quota_unit_price, subtotal_order_quota)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [purchaseOrderId, sku.id, quantity, sku.order_quota_price, toNumber(sku.order_quota_price) * quantity]
    );
  }
}

async function seedMemberOrders() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM member_orders')).rows[0].count);
  if (count > 0) return;

  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const stores = (await query('SELECT id, code FROM company_stores')).rows;
  const storeMap = Object.fromEntries(stores.map((item) => [item.code, item.id]));
  const purchaseOrders = (await query('SELECT id, order_no FROM purchase_orders')).rows;
  const orderMap = Object.fromEntries(purchaseOrders.map((item) => [item.order_no, item.id]));
  const skus = (await query('SELECT id, sku_code FROM product_skus')).rows;
  const skuMap = Object.fromEntries(skus.map((item) => [item.sku_code, item.id]));
  const timestamp = now();
  const orders = [
    ['MO-202604-001', companyMap['BR-EAST-001'], storeMap['ST-EAST-001'], '已核销', '陈雪', '王静', '13812340001', 108, orderMap['PO-202604-001'], true, 'SKU-COFFEE-BTL-01', 6, 18],
    ['MO-202604-002', companyMap['BR-EAST-001'], storeMap['ST-EAST-002'], '待核销', '李韬', '刘晨', '13812340002', 48, orderMap['PO-202604-003'], false, 'SKU-TEA-CUP-01', 4, 12],
    ['MO-202604-003', companyMap['BR-SOUTH-001'], storeMap['ST-SOUTH-001'], '异常', '周敏', '张怡', '13812340003', 96, null, false, 'SKU-SNACK-BOX-01', 1, 96]
  ];

  for (const order of orders) {
    const [orderNo, companyId, storeId, status, salesStaffName, memberName, memberPhone, totalAmount, purchaseOrderId, stockDeducted, skuCode, quantity, unitPrice] = order;
    const result = await query(
      `
        INSERT INTO member_orders
          (order_no, company_id, store_id, status, sales_staff_name, member_name, member_phone, total_amount, purchase_order_id, stock_deducted, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (order_no) DO NOTHING
        RETURNING id
      `,
      [orderNo, companyId, storeId, status, salesStaffName, memberName, memberPhone, totalAmount, purchaseOrderId, stockDeducted, timestamp, timestamp]
    );

    const memberOrderId =
      result.rows[0]?.id ??
      (await query('SELECT id FROM member_orders WHERE order_no = $1', [orderNo])).rows[0].id;

    await query(
      `
        INSERT INTO member_order_items
          (member_order_id, sku_id, quantity, unit_price, point_rebate_base, writeoff_status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [memberOrderId, skuMap[skuCode], quantity, unitPrice, unitPrice * quantity, status === '已核销' ? '已核销' : status]
    );
  }
}

async function seedWriteoffRecords() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM writeoff_records')).rows[0].count);
  if (count > 0) return;

  const orders = (await query('SELECT id, order_no, store_id, sales_staff_name FROM member_orders')).rows;
  const orderMap = Object.fromEntries(orders.map((item) => [item.order_no, item]));
  const items = (
    await query(
      `
        SELECT member_order_id, sku_id
        FROM member_order_items
      `
    )
  ).rows;
  const itemMap = Object.fromEntries(items.map((item) => [String(item.member_order_id), item]));

  await query(
    `
      INSERT INTO writeoff_records
        (member_order_id, sku_id, store_id, sales_staff_name, product_code, status, writeoff_time, remark)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      orderMap['MO-202604-001'].id,
      itemMap[String(orderMap['MO-202604-001'].id)].sku_id,
      orderMap['MO-202604-001'].store_id,
      orderMap['MO-202604-001'].sales_staff_name,
      'QR-COFFEE-BTL-01',
      '成功',
      '2026-04-10 15:26',
      '门店扫码核销完成'
    ]
  );
}

async function seedApprovalLogs() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM approval_logs')).rows[0].count);
  if (count > 0) return;

  const purchaseOrders = (await query('SELECT id, order_no FROM purchase_orders')).rows;
  const orderQuotaAdjustments = (await query('SELECT id FROM order_quota_adjustments ORDER BY id ASC')).rows;
  const timestamp = now();

  await query(
    `
      INSERT INTO approval_logs (entity_type, entity_id, action, result, note, created_by, created_at)
      VALUES
        ('purchase_order', $1, '自动审核', '已通过', '系统自动扣减订货额度并进入待入库', '系统', $3),
        ('purchase_order', $2, '人工审核', '待审核', '分公司订货额不足，等待总部审核', '周筱', $3),
        ('order_quota_adjustment', $4, '订货额调整', '待审核', '等待总部审核员确认', '周筱', $3)
    `,
    [String(purchaseOrders[0].id), String(purchaseOrders[1].id), timestamp, String(orderQuotaAdjustments[1].id)]
  );
}

async function seedInventoryAdjustments() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM inventory_adjustments')).rows[0].count);
  if (count > 0) return;

  const companies = (await query('SELECT id, code FROM companies')).rows;
  const companyMap = Object.fromEntries(companies.map((item) => [item.code, item.id]));
  const skus = (await query('SELECT id, sku_code FROM product_skus')).rows;
  const skuMap = Object.fromEntries(skus.map((item) => [item.sku_code, item.id]));
  const timestamp = now();
  const rows = [
    [companyMap['BR-EAST-001'], skuMap['SKU-TEA-BOX-01'], 28, '活动前备货调整', '待审核', '赵晴'],
    [companyMap['BR-WEST-001'], skuMap['SKU-COFFEE-BTL-01'], 15, '盘点后修正差异', '已通过', '陈卓']
  ];

  for (const row of rows) {
    await query(
      `
        INSERT INTO inventory_adjustments
          (company_id, sku_id, requested_quantity, reason, status, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [...row, timestamp, timestamp]
    );
  }
}

async function seedSystemSettings() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM system_settings')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const rows = [
    ['order_quota.cash_ratio', '订货额度规则', '订货额度与人民币换算比例', '1:1', '默认 1 订货额度 = 1 元，用于总部给分公司发放订货额度的后台口径。', '林可'],
    ['order_quota.rebate_ratio', '订货额度规则', '核销回补订货额度比例', '0.08', '核销成功后按订单金额的 8% 回补订货额度。', '林可'],
    ['rank.periods', '排行规则', '排行统计周期', '日榜,月榜,年榜', '支持经营排行日榜、月榜、年榜', '林可'],
    ['writeoff.timeout', '核销规则', '核销超时阈值', '15', '商品码超过 15 分钟未完成核销需重试', '周筱'],
    ['scan.required_employee_code', '扫码规则', '是否强制扫描员工码', 'true', '门店完成销售需绑定员工一维码', '周筱'],
    ['message.low_inventory', '消息通知设置', '低库存提醒', '开启', '低库存自动通知总部运营和分公司管理员', '赵晴'],
    ['dict.member_levels', '字典与基础参数', '会员等级字典', '银卡,金卡,黑金', '用于会员订单和经营分析展示', '林可']
  ];

  for (const row of rows) {
    await query(
      `
        INSERT INTO system_settings
          (setting_key, category, setting_name, setting_value, description, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (setting_key) DO NOTHING
      `,
      [...row, timestamp, timestamp]
    );
  }
}

async function normalizeSeedStoreQuotas() {
  const defaultStoreQuota = await getDefaultStoreOrderQuota();
  await query(
    `
      UPDATE company_stores
      SET
        available_order_quota = CASE WHEN available_order_quota = 0 THEN $1 ELSE available_order_quota END,
        total_order_quota = CASE WHEN total_order_quota = 0 THEN $1 ELSE total_order_quota END,
        updated_at = $2
      WHERE available_order_quota = 0 OR total_order_quota = 0
    `,
    [defaultStoreQuota, now()]
  );
}

async function seedRedeemItems() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM point_redeem_items')).rows[0].count);
  if (count > 0) return;

  const timestamp = now();
  const rows = [
    ['品牌保温杯', 'RD-CUP-001', 399, 120, '启用', '用于会员积分兑换的轻量权益商品'],
    ['米粒冠手提袋', 'RD-BAG-001', 129, 300, '启用', '活动常用周边'],
    ['咖啡兑换券', 'RD-COUPON-001', 99, 999, '启用', '门店核销型兑换权益']
  ];

  for (const row of rows) {
    await query(
      `
        INSERT INTO point_redeem_items
          (item_name, item_code, points_cost, stock, status, description, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (item_code) DO NOTHING
      `,
      [...row, timestamp, timestamp]
    );
  }
}

async function seedRedeemOrders() {
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM point_redeem_orders')).rows[0].count);
  if (count > 0) return;

  const items = (await query('SELECT id, item_code, points_cost FROM point_redeem_items')).rows;
  const itemMap = Object.fromEntries(items.map((item) => [item.item_code, item]));
  const timestamp = now();
  const rows = [
    ['RO-202604-001', itemMap['RD-CUP-001'].id, '王静', '13812340001', itemMap['RD-CUP-001'].points_cost, '已发货'],
    ['RO-202604-002', itemMap['RD-COUPON-001'].id, '刘晨', '13812340002', itemMap['RD-COUPON-001'].points_cost, '待核销']
  ];

  for (const row of rows) {
    await query(
      `
        INSERT INTO point_redeem_orders
          (order_no, item_id, member_name, member_phone, points_cost, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (order_no) DO NOTHING
      `,
      [...row, timestamp, timestamp]
    );
  }
}

export async function initializeDatabase() {
  if (!initializedPromise) {
    initializedPromise = (async () => {
      await ensureRedis();
      await createTables();
      await migrateTables();
      await seedRoles();
      await seedPermissions();
      await seedRolePermissions();
      await seedCompanies();
      await seedCompanyStores();
      await seedProductCategories();
      await seedProducts();
      await seedProductSkus();
      await seedAdminStaff();
      await migrateLegacyStaffPasswords();
      await seedLegacyStores();
      await seedMembers();
      await seedCompanyInventory();
      await seedPointAdjustments();
      await seedPurchaseOrders();
      await seedMemberOrders();
      await seedWriteoffRecords();
      await seedApprovalLogs();
      await seedInventoryAdjustments();
      await seedSystemSettings();
      await normalizeSeedStoreQuotas();
      await seedRedeemItems();
      await seedRedeemOrders();
    })().catch((error) => {
      initializedPromise = undefined;
      throw error;
    });
  }

  await initializedPromise;
}

export async function closeDatabaseConnections() {
  if (redis.isOpen) {
    await redis.quit();
  }
  await pool.end();
  redisReadyPromise = undefined;
  initializedPromise = undefined;
}

function buildListQuery({
  baseQuery,
  searchColumns = [],
  search,
  filterColumn,
  filterValue,
  orderBy
}) {
  const params = [];
  const where = [];

  if (search && searchColumns.length > 0) {
    const searchValue = `%${search}%`;
    where.push(
      `(${searchColumns
        .map((column, index) => `${column} ILIKE $${params.length + index + 1}`)
        .join(' OR ')})`
    );
    for (const _ of searchColumns) params.push(searchValue);
  }

  if (filterColumn && filterValue && filterValue !== 'all') {
    params.push(filterValue);
    where.push(`${filterColumn} = $${params.length}`);
  }

  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `${baseQuery}${whereClause} ORDER BY ${orderBy}`,
    params
  };
}

export async function listStores({ search = '', status = 'all', page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  const deleteFilter = buildDeleteStatusFilter(status, 'company_stores.delete_status');
  if (search) {
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword);
    where.push(
      '(company_stores.name ILIKE $1 OR company_stores.manager_name ILIKE $2 OR companies.name ILIKE $3)'
    );
  }
  if (status !== 'all') {
    if (!['__deleted__', '__with_deleted__'].includes(status)) {
      params.push(status);
      where.push(`company_stores.status = $${params.length}`);
    }
  }
  if (deleteFilter.applies) {
    where.push(deleteFilter.condition);
  }
  if (!canAccessAllCompanies(user)) {
    const companyId = getUserCompanyId(user);
    if (companyId) {
      params.push(companyId);
      where.push(`company_stores.company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return executePaginatedQuery({
    sql: `
      SELECT
        company_stores.id,
        company_stores.name,
        COALESCE(manager_staff.name, company_stores.manager_name) AS manager_name,
        COALESCE(NULLIF(company_stores.manager_phone, ''), manager_staff.phone) AS manager_phone,
        company_stores.available_order_quota,
        company_stores.total_order_quota,
        companies.name AS city,
        company_stores.status,
        COUNT(DISTINCT admin_staff.id)::int AS staff_count,
        COALESCE(SUM(member_orders.total_amount), 0) AS monthly_revenue
      FROM company_stores
      INNER JOIN companies ON companies.id = company_stores.company_id
      LEFT JOIN admin_staff AS manager_staff ON manager_staff.id = company_stores.manager_staff_id
      LEFT JOIN admin_staff ON admin_staff.store_id = company_stores.id
      LEFT JOIN member_orders ON member_orders.store_id = company_stores.id
      ${whereClause}
      GROUP BY company_stores.id, companies.name, manager_staff.name, manager_staff.phone
      ORDER BY company_stores.updated_at DESC, company_stores.id DESC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      name: row.name,
      manager_name: row.manager_name,
      manager_phone: row.manager_phone ?? '',
      city: row.city,
      available_order_quota: toNumber(row.available_order_quota),
      total_order_quota: toNumber(row.total_order_quota),
      status: row.status,
      staff_count: toNumber(row.staff_count),
      monthly_revenue: toNumber(row.monthly_revenue)
    })
  });
}

export async function listAdminStaff({ search = '', role = 'all', page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(role, 'admin_staff.delete_status');
  const queryData = buildListQuery({
    baseQuery: `
      SELECT
        admin_staff.id,
        admin_staff.name,
        admin_staff.account,
        admin_staff.password,
        admin_staff.department,
        admin_staff.status,
        admin_staff.phone,
        admin_staff.email,
        admin_staff.last_login,
        admin_staff.role_id,
        roles.role_name
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
    `,
    searchColumns: ['admin_staff.name', 'admin_staff.phone', 'admin_staff.email', 'roles.role_name'],
    search,
    filterColumn: 'roles.role_name',
    filterValue: ['__deleted__', '__with_deleted__'].includes(role) ? 'all' : role,
    orderBy: 'admin_staff.updated_at DESC, admin_staff.id DESC'
  });
  let sql = queryData.sql;
  if (deleteFilter.applies) {
    sql = sql.replace(
      'ORDER BY admin_staff.updated_at DESC, admin_staff.id DESC',
      `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY admin_staff.updated_at DESC, admin_staff.id DESC`
    );
  }
  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      name: row.name,
      account: row.account,
      department: row.department,
      role_id: String(row.role_id),
      role_name: row.role_name,
      status: row.status,
      phone: row.phone,
      email: row.email,
      last_login: row.last_login
    })
  });
}

export async function listMembers({ search = '', status = 'all', page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(status, 'members.delete_status');
  const queryData = buildListQuery({
    baseQuery: 'SELECT id, name, level, tags, city, status, total_spent FROM members',
    searchColumns: ['name', 'tags', 'city'],
    search,
    filterColumn: 'status',
    filterValue: ['__deleted__', '__with_deleted__'].includes(status) ? 'all' : status,
    orderBy: 'updated_at DESC, id DESC'
  });
  let sql = queryData.sql;
  if (deleteFilter.applies) {
    sql = sql.replace('ORDER BY updated_at DESC, id DESC', `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY updated_at DESC, id DESC`);
  }
  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      name: row.name,
      level: row.level,
      tags: row.tags,
      city: row.city,
      status: row.status,
      total_spent: toNumber(row.total_spent)
    })
  });
}

export async function listRoles({ search = '', scope = 'all', page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  const deleteFilter = buildDeleteStatusFilter(scope, 'roles.delete_status');

  if (search) {
    const value = `%${search}%`;
    params.push(value, value, value);
    where.push('(roles.role_name ILIKE $1 OR roles.description ILIKE $2 OR roles.scope ILIKE $3)');
  }

  if (scope && scope !== 'all') {
    if (!['__deleted__', '__with_deleted__'].includes(scope)) {
      params.push(scope);
      where.push(`roles.scope = $${params.length}`);
    }
  }
  if (deleteFilter.applies) {
    where.push(deleteFilter.condition);
  }

  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return executePaginatedQuery({
    sql: `
      SELECT
        roles.id,
        roles.role_name,
        roles.scope,
        roles.status,
        roles.description,
        COUNT(admin_staff.id)::int AS member_count
      FROM roles
      LEFT JOIN admin_staff ON admin_staff.role_id = roles.id
      ${whereClause}
      GROUP BY roles.id
      ORDER BY roles.updated_at DESC, roles.id DESC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      role_name: row.role_name,
      scope: row.scope,
      status: row.status,
      description: row.description,
      member_count: toNumber(row.member_count)
    })
  });
}

export async function listPermissions({ search = '', level = 'all', page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(level, 'permissions.delete_status');
  const queryData = buildListQuery({
    baseQuery: 'SELECT id, module, permission_name, code, level, status FROM permissions',
    searchColumns: ['module', 'permission_name', 'code', 'level'],
    search,
    filterColumn: 'level',
    filterValue: ['__deleted__', '__with_deleted__'].includes(level) ? 'all' : level,
    orderBy: 'updated_at DESC, id DESC'
  });
  let sql = queryData.sql;
  if (deleteFilter.applies) {
    sql = sql.replace('ORDER BY updated_at DESC, id DESC', `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY updated_at DESC, id DESC`);
  }
  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      module: row.module,
      permission_name: row.permission_name,
      code: row.code,
      level: row.level,
      status: row.status
    })
  });
}

export async function listProducts({ search = '', status = 'all', page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  const deleteFilter = buildDeleteStatusFilter(status, 'products.delete_status');
  if (search) {
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
    where.push(
      '(products.spu_code ILIKE $1 OR products.name ILIKE $2 OR products.brand ILIKE $3 OR products.category ILIKE $4)'
    );
  }
  if (status !== 'all') {
    if (!['__deleted__', '__with_deleted__'].includes(status)) {
      params.push(status);
      where.push(`products.status = $${params.length}`);
    }
  }
  if (deleteFilter.applies) {
    where.push(deleteFilter.condition);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return executePaginatedQuery({
    sql: `
      SELECT
        products.id,
        products.spu_code,
        products.name,
        products.brand,
        products.category,
        products.scenario,
        products.status,
        COUNT(product_skus.id)::int AS sku_count,
        COALESCE(MIN(product_skus.order_quota_price), 0) AS order_quota_price
      FROM products
      LEFT JOIN product_skus ON product_skus.product_id = products.id
      ${whereClause}
      GROUP BY products.id
      ORDER BY products.updated_at DESC, products.id DESC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      spu_code: row.spu_code,
      name: row.name,
      brand: row.brand,
      category: row.category,
      scenario: row.scenario,
      status: row.status,
      sku_count: toNumber(row.sku_count),
      order_quota_price: toNumber(row.order_quota_price)
    })
  });
}

export async function listCompanies({ search = '', status = 'all', page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  await syncAllCompaniesOrderQuota();
  const params = [];
  const where = [];
  const deleteFilter = buildDeleteStatusFilter(status, 'companies.delete_status');
  if (search) {
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword);
    where.push('(companies.name ILIKE $1 OR companies.code ILIKE $2 OR companies.manager_name ILIKE $3)');
  }
  if (status !== 'all') {
    if (!['__deleted__', '__with_deleted__'].includes(status)) {
      params.push(status);
      where.push(`companies.status = $${params.length}`);
    }
  }
  if (deleteFilter.applies) {
    where.push(deleteFilter.condition);
  }
  if (!canAccessAllCompanies(user)) {
    const companyId = getUserCompanyId(user);
    if (companyId) {
      params.push(companyId);
      where.push(`companies.id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return executePaginatedQuery({
    sql: `
      SELECT
        companies.id,
        companies.name,
        companies.code,
        companies.company_level,
        companies.manager_name,
        companies.contact_phone,
        companies.status,
        companies.available_order_quota,
        companies.total_order_quota,
        COUNT(DISTINCT company_stores.id)::int AS store_count,
        COALESCE(SUM(company_inventory.quantity), 0)::int AS inventory_quantity_total,
        COALESCE(SUM(company_inventory.quantity * product_skus.order_quota_price), 0) AS inventory_amount_total
      FROM companies
      LEFT JOIN company_stores ON company_stores.company_id = companies.id
      LEFT JOIN company_inventory ON company_inventory.company_id = companies.id
      LEFT JOIN product_skus ON product_skus.id = company_inventory.sku_id
      ${whereClause}
      GROUP BY companies.id
      ORDER BY companies.updated_at DESC, companies.id DESC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      name: row.name,
      code: row.code,
    company_level: row.company_level,
    manager_name: row.manager_name,
    contact_phone: row.contact_phone,
    status: row.status,
      available_order_quota: toNumber(row.available_order_quota),
      total_order_quota: toNumber(row.total_order_quota),
      inventory_quantity_total: toNumber(row.inventory_quantity_total),
      inventory_amount_total: toNumber(row.inventory_amount_total),
      store_count: toNumber(row.store_count)
    })
  });
}

export async function listInventory({ search = '', status = 'all', page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(status, 'company_inventory.delete_status');
  const queryData = buildListQuery({
    baseQuery: `
      SELECT
        company_inventory.id,
        companies.name AS company_name,
        products.name AS product_name,
        product_skus.sku_code,
        product_skus.spec,
        company_inventory.quantity,
        company_inventory.safety_stock,
        company_inventory.status
      FROM company_inventory
      INNER JOIN companies ON companies.id = company_inventory.company_id
      INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
    `,
    searchColumns: ['companies.name', 'products.name', 'product_skus.sku_code', 'product_skus.spec'],
    search,
    filterColumn: 'company_inventory.status',
    filterValue: ['__deleted__', '__with_deleted__'].includes(status) ? 'all' : status,
    orderBy: 'company_inventory.updated_at DESC, company_inventory.id DESC'
  });
  let sql = queryData.sql;
  sql = appendCompanyDataScope(sql, queryData.params, user, 'company_inventory.company_id');
  if (deleteFilter.applies) {
    sql = sql.replace('ORDER BY company_inventory.updated_at DESC, company_inventory.id DESC', `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY company_inventory.updated_at DESC, company_inventory.id DESC`);
  }
  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      company_name: row.company_name,
      product_name: row.product_name,
    sku_code: row.sku_code,
    spec: row.spec,
      quantity: toNumber(row.quantity),
      safety_stock: toNumber(row.safety_stock),
      status: row.status
    })
  });
}

export async function listPurchaseOrders({ search = '', status = 'all', page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(status, 'purchase_orders.delete_status');
  const queryData = buildListQuery({
    baseQuery: `
      SELECT
        purchase_orders.id,
        purchase_orders.order_no,
        companies.name AS company_name,
        purchase_orders.status,
        purchase_orders.approval_status,
        purchase_orders.order_quota_total,
        purchase_orders.abnormal_flag,
        purchase_orders.created_at
      FROM purchase_orders
      INNER JOIN companies ON companies.id = purchase_orders.company_id
    `,
    searchColumns: ['purchase_orders.order_no', 'companies.name'],
    search,
    filterColumn: 'purchase_orders.status',
    filterValue: ['__deleted__', '__with_deleted__'].includes(status) ? 'all' : status,
    orderBy: 'purchase_orders.updated_at DESC, purchase_orders.id DESC'
  });
  let sql = queryData.sql;
  sql = sql.replace('ORDER BY purchase_orders.updated_at DESC, purchase_orders.id DESC', `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}purchase_orders.store_id IS NULL ORDER BY purchase_orders.updated_at DESC, purchase_orders.id DESC`);
  sql = appendCompanyDataScope(sql, queryData.params, user, 'purchase_orders.company_id');
  if (deleteFilter.applies) {
    sql = sql.replace('ORDER BY purchase_orders.updated_at DESC, purchase_orders.id DESC', `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY purchase_orders.updated_at DESC, purchase_orders.id DESC`);
  }
  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      order_no: row.order_no,
      company_name: row.company_name,
      status: row.status,
      approval_status: row.approval_status,
      order_quota_total: toNumber(row.order_quota_total),
      abnormal_flag: boolValue(row.abnormal_flag) ? '异常' : '正常',
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });
}

export async function listMemberOrders({ search = '', status = 'all', page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(status, 'member_orders.delete_status');
  const queryData = buildListQuery({
    baseQuery: `
      SELECT
        member_orders.id,
        member_orders.order_no,
        companies.name AS company_name,
        company_stores.name AS store_name,
        member_orders.status,
        member_orders.customer_type,
        member_orders.member_name,
        member_orders.member_phone,
        member_orders.sales_staff_name,
        member_orders.total_amount,
        member_orders.created_at
      FROM member_orders
      INNER JOIN companies ON companies.id = member_orders.company_id
      INNER JOIN company_stores ON company_stores.id = member_orders.store_id
    `,
    searchColumns: ['member_orders.order_no', 'companies.name', 'company_stores.name', 'member_orders.member_name', 'member_orders.member_phone', 'member_orders.sales_staff_name'],
    search,
    filterColumn: 'member_orders.status',
    filterValue: ['__deleted__', '__with_deleted__'].includes(status) ? 'all' : status,
    orderBy: 'member_orders.updated_at DESC, member_orders.id DESC'
  });
  let sql = queryData.sql;
  sql = appendCompanyDataScope(sql, queryData.params, user, 'member_orders.company_id');
  if (deleteFilter.applies) {
    sql = sql.replace('ORDER BY member_orders.updated_at DESC, member_orders.id DESC', `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY member_orders.updated_at DESC, member_orders.id DESC`);
  }
  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      order_no: row.order_no,
      company_name: row.company_name,
    store_name: row.store_name,
    status: row.status,
      customer_type: row.customer_type ?? 'walk_in',
      customer_type_label: row.customer_type === 'member' ? '会员' : '散客',
      customer_name: row.customer_type === 'member' ? row.member_name : (row.member_name || '散客'),
      member_name: row.customer_type === 'member' ? row.member_name : (row.member_name || '散客'),
      member_phone: row.member_phone,
      sales_staff_name: row.sales_staff_name,
      total_amount: toNumber(row.total_amount),
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });
}

export async function listCompanyStoresByCompany(companyId, { page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  assertCanAccessCompany(user, companyId);
  const nextPage = normalizePageValue(page);
  const offset = (nextPage - 1) * pageSize;
  const total = Number(
    (
      await query(
        `
          SELECT COUNT(*)::int AS count
          FROM company_stores
          WHERE company_stores.company_id = $1 AND company_stores.delete_status = '正常'
        `,
        [Number(companyId)]
      )
    ).rows[0].count
  );
  const rows = (
    await query(
      `
        SELECT
          company_stores.id,
          company_stores.name,
          company_stores.code,
          company_stores.address,
          company_stores.manager_staff_id,
          COALESCE(admin_staff.name, company_stores.manager_name) AS manager_name,
          COALESCE(NULLIF(company_stores.manager_phone, ''), admin_staff.phone) AS manager_phone,
          company_stores.available_order_quota,
          company_stores.total_order_quota,
          company_stores.first_purchase_rebate_done,
          company_stores.status
        FROM company_stores
        LEFT JOIN admin_staff ON admin_staff.id = company_stores.manager_staff_id
        WHERE company_stores.company_id = $1 AND company_stores.delete_status = '正常'
        ORDER BY company_stores.updated_at DESC, company_stores.id DESC
        LIMIT $2 OFFSET $3
      `,
      [Number(companyId), pageSize, offset]
    )
  ).rows;

  return buildPaginatedResult(
    rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      code: row.code,
      address: row.address,
      manager_staff_id: row.manager_staff_id ? String(row.manager_staff_id) : '',
      manager_name: row.manager_name,
      manager_phone: row.manager_phone ?? '',
      available_order_quota: toNumber(row.available_order_quota),
      total_order_quota: toNumber(row.total_order_quota),
      first_purchase_rebate_done: boolValue(row.first_purchase_rebate_done),
      status: row.status
    })),
    total,
    nextPage,
    pageSize
  );
}

export async function listOrderQuotaAdjustments(
  { companyId, page = 1, pageSize = 10, user = {} } = /** @type {{ companyId?: string | number | undefined; page?: number; pageSize?: number; user?: unknown }} */ ({})
) {
  await initializeDatabase();
  const params = [];
  const where = [`order_quota_adjustments.delete_status = '正常'`];
  if (companyId) {
    assertCanAccessCompany(user, companyId);
    params.push(Number(companyId));
    where.push(`order_quota_adjustments.company_id = $${params.length}`);
  } else if (!canAccessAllCompanies(user)) {
    const scopedCompanyId = getUserCompanyId(user);
    if (scopedCompanyId) {
      params.push(scopedCompanyId);
      where.push(`order_quota_adjustments.company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  const whereClause = `WHERE ${where.join(' AND ')}`;
  const nextPage = normalizePageValue(page);
  const offset = (nextPage - 1) * pageSize;
  const total = Number(
    (
      await query(
        `
          SELECT COUNT(*)::int AS count
          FROM order_quota_adjustments
          ${whereClause}
        `,
        params
      )
    ).rows[0].count
  );

  const rows = (
    await query(
      `
        SELECT
          order_quota_adjustments.id,
          companies.name AS company_name,
          order_quota_adjustments.adjustment_type,
          order_quota_adjustments.change_type,
          order_quota_adjustments.order_quota_amount,
          order_quota_adjustments.reason,
          order_quota_adjustments.expires_at,
          order_quota_adjustments.target_company_level,
          COALESCE(member_orders.order_no, purchase_orders.order_no) AS source_order_no,
          CASE
            WHEN order_quota_adjustments.source_member_order_id IS NOT NULL THEN '会员订单'
            WHEN order_quota_adjustments.source_purchase_order_id IS NOT NULL THEN '订货单'
            ELSE ''
          END AS source_order_type,
          order_quota_adjustments.status,
          order_quota_adjustments.created_by,
          order_quota_adjustments.created_at
        FROM order_quota_adjustments
        INNER JOIN companies ON companies.id = order_quota_adjustments.company_id
        LEFT JOIN member_orders ON member_orders.id = order_quota_adjustments.source_member_order_id
        LEFT JOIN purchase_orders ON purchase_orders.id = order_quota_adjustments.source_purchase_order_id
        ${whereClause}
        ORDER BY order_quota_adjustments.updated_at DESC, order_quota_adjustments.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset]
    )
  ).rows;

  return buildPaginatedResult(
    rows.map((row) => ({
      id: String(row.id),
      company_name: row.company_name,
      adjustment_type: row.adjustment_type,
      change_type: row.change_type,
      order_quota_amount: toNumber(row.order_quota_amount),
      reason: row.reason,
      expires_at: row.expires_at ? new Date(row.expires_at).toLocaleString('zh-CN', { hour12: false }) : '',
      target_company_level: row.target_company_level,
      source_order_no: row.source_order_no ?? '',
      source_order_type: row.source_order_type ?? '',
      status: row.status,
      created_by: row.created_by,
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })),
    total,
    nextPage,
    pageSize
  );
}

export async function listInventoryLogs({ companyId, page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  if (companyId) {
    assertCanAccessCompany(user, companyId);
    params.push(Number(companyId));
    where.push(`inventory_logs.company_id = $${params.length}`);
  } else if (!canAccessAllCompanies(user)) {
    const scopedCompanyId = getUserCompanyId(user);
    if (scopedCompanyId) {
      params.push(scopedCompanyId);
      where.push(`inventory_logs.company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return executePaginatedQuery({
    sql: `
      SELECT
        inventory_logs.id,
        companies.name AS company_name,
        products.name AS product_name,
        product_skus.sku_code,
        inventory_logs.source_type,
        inventory_logs.change_type,
        inventory_logs.quantity,
        inventory_logs.balance_after,
        inventory_logs.remark,
        inventory_logs.created_at
      FROM inventory_logs
      INNER JOIN companies ON companies.id = inventory_logs.company_id
      INNER JOIN product_skus ON product_skus.id = inventory_logs.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      ${whereClause}
      ORDER BY inventory_logs.id DESC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      company_name: row.company_name,
      product_name: row.product_name,
      sku_code: row.sku_code,
      source_type: row.source_type,
      change_type: row.change_type,
      quantity: toNumber(row.quantity),
      balance_after: toNumber(row.balance_after),
      remark: row.remark,
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });
}

export async function listInventoryAdjustments({ status = 'all', page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  const deleteFilter = buildDeleteStatusFilter(status, 'inventory_adjustments.delete_status');
  if (status !== 'all') {
    if (!['__deleted__', '__with_deleted__'].includes(status)) {
      params.push(status);
      where.push(`inventory_adjustments.status = $${params.length}`);
    }
  }
  if (deleteFilter.applies) {
    where.push(deleteFilter.condition);
  }
  if (!canAccessAllCompanies(user)) {
    const scopedCompanyId = getUserCompanyId(user);
    if (scopedCompanyId) {
      params.push(scopedCompanyId);
      where.push(`inventory_adjustments.company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  return executePaginatedQuery({
    sql: `
      SELECT
        inventory_adjustments.id,
        companies.name AS company_name,
        products.name AS product_name,
        product_skus.sku_code,
        inventory_adjustments.requested_quantity,
        inventory_adjustments.reason,
        inventory_adjustments.status,
        inventory_adjustments.created_by,
        inventory_adjustments.created_at
      FROM inventory_adjustments
      INNER JOIN companies ON companies.id = inventory_adjustments.company_id
      INNER JOIN product_skus ON product_skus.id = inventory_adjustments.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      ${whereClause}
      ORDER BY inventory_adjustments.updated_at DESC, inventory_adjustments.id DESC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      company_name: row.company_name,
      product_name: row.product_name,
      sku_code: row.sku_code,
      requested_quantity: toNumber(row.requested_quantity),
      reason: row.reason,
      status: row.status,
      created_by: row.created_by,
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });
}

export async function listLowInventoryRecords({ page = 1, pageSize = 10, user = {} } = {}) {
  await initializeDatabase();
  const params = [];
  const where = ['company_inventory.quantity <= company_inventory.safety_stock'];
  if (!canAccessAllCompanies(user)) {
    const scopedCompanyId = getUserCompanyId(user);
    if (scopedCompanyId) {
      params.push(scopedCompanyId);
      where.push(`company_inventory.company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  return executePaginatedQuery({
    sql: `
      SELECT
        company_inventory.id,
        companies.name AS company_name,
        products.name AS product_name,
        product_skus.sku_code,
        company_inventory.quantity,
        company_inventory.safety_stock
      FROM company_inventory
      INNER JOIN companies ON companies.id = company_inventory.company_id
      INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY company_inventory.quantity ASC, company_inventory.id ASC
    `,
    params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      company_name: row.company_name,
      product_name: row.product_name,
      sku_code: row.sku_code,
      quantity: toNumber(row.quantity),
      safety_stock: toNumber(row.safety_stock)
    })
  });
}

export async function listWriteoffRecords({ memberOrderId } = {}) {
  await initializeDatabase();
  const params = [];
  let whereClause = '';
  if (memberOrderId) {
    params.push(Number(memberOrderId));
    whereClause = 'WHERE writeoff_records.member_order_id = $1';
  }

  const rows = (
    await query(
      `
        SELECT
          writeoff_records.id,
          products.name AS product_name,
          product_skus.sku_code,
          company_stores.name AS store_name,
          writeoff_records.sales_staff_name,
          writeoff_records.product_code,
          writeoff_records.status,
          writeoff_records.writeoff_time,
          writeoff_records.remark
        FROM writeoff_records
        INNER JOIN product_skus ON product_skus.id = writeoff_records.sku_id
        INNER JOIN products ON products.id = product_skus.product_id
        INNER JOIN company_stores ON company_stores.id = writeoff_records.store_id
        ${whereClause}
        ORDER BY writeoff_records.id DESC
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    product_name: row.product_name,
    sku_code: row.sku_code,
    store_name: row.store_name,
    sales_staff_name: row.sales_staff_name,
    product_code: row.product_code,
    status: row.status,
    writeoff_time: row.writeoff_time,
    remark: row.remark
  }));
}

export async function listSystemSettings() {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT id, setting_key, category, setting_name, setting_value, description, updated_by, updated_at
        FROM system_settings
        ORDER BY category ASC, id ASC
      `
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    setting_key: row.setting_key,
    category: row.category,
    setting_name: row.setting_name,
    setting_value: row.setting_value,
    description: row.description,
    updated_by: row.updated_by,
    updated_at: new Date(row.updated_at).toLocaleString('zh-CN', { hour12: false })
  }));
}

export async function getMobileAppSplashConfig(defaultImageUrl = '') {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT setting_key, setting_value
        FROM system_settings
        WHERE setting_key IN (
          'mobile.splash.enabled',
          'mobile.splash.image_url',
          'mobile.splash.version',
          'mobile.splash.duration_ms'
        )
      `
    )
  ).rows;
  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const duration = Number(settings['mobile.splash.duration_ms'] ?? 1200);

  return {
    enabled: String(settings['mobile.splash.enabled'] ?? 'true') !== 'false',
    imageUrl: String(settings['mobile.splash.image_url'] || defaultImageUrl || ''),
    version: String(settings['mobile.splash.version'] || 'default'),
    durationMs: Number.isFinite(duration) ? Math.max(0, Math.min(duration, 5000)) : 1200
  };
}

export async function updateSystemSetting(id, payload) {
  await initializeDatabase();
  const current = (
    await query(
      `
        SELECT setting_key
        FROM system_settings
        WHERE purchase_orders.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!current) {
    throw new Error('系统设置不存在');
  }

  let nextValue = payload.setting_value;
  if (current.setting_key === 'order_quota.level_rules') {
    let parsed;
    try {
      parsed = JSON.parse(String(payload.setting_value ?? '{}'));
    } catch {
      throw new Error('分公司等级额度配置格式不正确');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('分公司等级额度配置格式不正确');
    }
    const normalized = {};
    for (const [level, quota] of Object.entries(parsed)) {
      const nextQuota = Number(quota);
      if (!level.trim()) {
        throw new Error('分公司等级名称不能为空');
      }
      if (!Number.isFinite(nextQuota) || nextQuota < 0) {
        throw new Error(`分公司等级 ${level} 的订货额度必须是大于等于 0 的数字`);
      }
      normalized[level] = Math.round(nextQuota);
    }
    nextValue = JSON.stringify(normalized);
  }

  if (current.setting_key === 'order_quota.default_company_level') {
    const rules = await getOrderQuotaLevelRules();
    if (!Object.keys(rules).includes(String(payload.setting_value ?? ''))) {
      throw new Error('默认分公司等级必须存在于等级额度配置中');
    }
  }

  await query(
    `
      UPDATE system_settings
      SET setting_value = $1, description = $2, updated_by = $3, updated_at = $4
      WHERE id = $5
    `,
    [nextValue, payload.description ?? '', payload.updated_by ?? '后台用户', now(), Number(id)]
  );

  if (
    current.setting_key === 'order_quota.level_rules' ||
    current.setting_key === 'order_quota.default_company_level'
  ) {
    await syncAllCompaniesOrderQuota();
  }
}

export async function listRedeemItems({ page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  return executePaginatedQuery({
    sql: `
      SELECT id, item_name, item_code, points_cost, stock, status, description
      FROM point_redeem_items
      ORDER BY updated_at DESC, id DESC
    `,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      item_name: row.item_name,
      item_code: row.item_code,
      points_cost: toNumber(row.points_cost),
      stock: toNumber(row.stock),
      status: row.status,
      description: row.description
    })
  });
}

export async function createRedeemItem(payload) {
  await initializeDatabase();
  const result = await query(
    `
      INSERT INTO point_redeem_items
        (item_name, item_code, points_cost, stock, status, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      payload.item_name,
      payload.item_code,
      Number(payload.points_cost || 0),
      Number(payload.stock || 0),
      payload.status,
      payload.description ?? '',
      now(),
      now()
    ]
  );
  return result.rows[0].id;
}

export async function listRedeemOrders({ page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  return executePaginatedQuery({
    sql: `
      SELECT
        point_redeem_orders.id,
        point_redeem_orders.order_no,
        point_redeem_items.item_name,
        point_redeem_orders.member_name,
        point_redeem_orders.member_phone,
        point_redeem_orders.points_cost,
        point_redeem_orders.status,
        point_redeem_orders.created_at
      FROM point_redeem_orders
      INNER JOIN point_redeem_items ON point_redeem_items.id = point_redeem_orders.item_id
      ORDER BY point_redeem_orders.updated_at DESC, point_redeem_orders.id DESC
    `,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      order_no: row.order_no,
      item_name: row.item_name,
      member_name: row.member_name,
      member_phone: row.member_phone,
      points_cost: toNumber(row.points_cost),
      status: row.status,
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });
}

export async function getPermissionsByRoleId(roleId) {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT permissions.code
        FROM role_permissions
        INNER JOIN permissions ON permissions.id = role_permissions.permission_id
        WHERE role_permissions.role_id = $1
        ORDER BY permissions.id ASC
      `,
      [Number(roleId)]
    )
  ).rows;
  return rows.map((row) => row.code);
}

async function inferStaffDepartmentByRoleId(roleId) {
  const row = (
    await query('SELECT role_name, scope FROM roles WHERE id = $1', [Number(roleId)])
  ).rows[0];
  if (!row) {
    throw new Error('请选择有效的岗位角色');
  }
  const scopeDepartmentMap = {
    平台: '总公司',
    分公司: '分公司',
    门店: '门店'
  };
  return scopeDepartmentMap[row.scope] ?? row.role_name ?? '未分配';
}

export async function markStaffLastLogin(staffId) {
  await initializeDatabase();
  const loginTime = formatShanghaiDateTime();
  await query('UPDATE admin_staff SET last_login = $1, updated_at = $2 WHERE id = $3', [
    loginTime,
    now(),
    Number(staffId)
  ]);
  return loginTime;
}

function mapAdminUser(row, permissions) {
  return {
    id: String(row.id),
    name: row.name,
    fullName: row.name,
    email: row.email,
    account: row.account,
    department: row.department,
    roleId: String(row.role_id),
    roleName: row.role_name,
    roleScope: row.role_scope ?? '',
    dataScope: resolveAdminDataScope(row),
    companyId: row.company_id ? String(row.company_id) : '',
    storeId: row.store_id ? String(row.store_id) : '',
    permissions
  };
}

async function getStaffByAccount(account, password, loginScope = 'admin') {
  await initializeDatabase();
  const scopeClause =
    loginScope === 'app'
      ? "AND admin_staff.login_scope = 'app'"
      : loginScope === 'mobile'
        ? ''
      : "AND admin_staff.login_scope != 'app'";
  const result = await query(
    `
      SELECT
        admin_staff.id,
        admin_staff.name,
        admin_staff.account,
        admin_staff.password,
        admin_staff.department,
        admin_staff.status,
        admin_staff.phone,
        admin_staff.email,
        admin_staff.last_login,
        admin_staff.company_id,
        admin_staff.store_id,
        roles.id AS role_id,
        roles.role_name,
        roles.scope AS role_scope
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
      WHERE (admin_staff.account = $1 OR admin_staff.phone = $1)
        AND admin_staff.status != '停用'
        AND admin_staff.delete_status = '正常'
        ${scopeClause}
    `,
    [account]
  );

  const row = result.rows[0];
  if (!row) return null;
  const matched = await verifyPassword(password, row.password);
  if (!matched) return null;
  if (!isPasswordHash(row.password)) {
    const hashed = await hashPassword(password);
    await query('UPDATE admin_staff SET password = $1, updated_by = $2, updated_at = $3 WHERE id = $4', [
      hashed,
      '系统',
      now(),
      row.id
    ]);
  }
  await markStaffLastLogin(row.id);
  const permissions = await getPermissionsByRoleId(row.role_id);
  return mapAdminUser(row, permissions);
}

export async function getAdminByAccount(account, password) {
  return getStaffByAccount(account, password, 'admin');
}

export async function getAppAdminByAccount(account, password) {
  return getStaffByAccount(account, password, 'app');
}

export async function getMobileAdminByAccount(account, password) {
  return getStaffByAccount(account, password, 'mobile');
}

/**
 * 按手机号查找在职员工（验证码登录使用，不校验密码）。
 * loginScope: 'admin' = 后台（排除门店 App 账号）；'mobile' = 移动端（任意 scope）。
 */
async function getStaffByPhone(phone, loginScope = 'admin') {
  await initializeDatabase();
  const normalizedPhone = String(phone ?? '').trim();
  if (!isMainlandMobile(normalizedPhone)) return null;
  const scopeClause =
    loginScope === 'app'
      ? "AND admin_staff.login_scope = 'app'"
      : loginScope === 'mobile'
        ? ''
        : "AND admin_staff.login_scope != 'app'";
  const result = await query(
    `
      SELECT
        admin_staff.id,
        admin_staff.name,
        admin_staff.account,
        admin_staff.department,
        admin_staff.status,
        admin_staff.phone,
        admin_staff.email,
        admin_staff.last_login,
        admin_staff.company_id,
        admin_staff.store_id,
        roles.id AS role_id,
        roles.role_name,
        roles.scope AS role_scope
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
      WHERE admin_staff.phone = $1
        AND admin_staff.status != '停用'
        AND admin_staff.delete_status = '正常'
        ${scopeClause}
      ORDER BY admin_staff.id ASC
      LIMIT 1
    `,
    [normalizedPhone]
  );
  const row = result.rows[0];
  if (!row) return null;
  const permissions = await getPermissionsByRoleId(row.role_id);
  return mapAdminUser(row, permissions);
}

export async function getAdminByPhone(phone) {
  return getStaffByPhone(phone, 'admin');
}

export async function getMobileAdminByPhone(phone) {
  return getStaffByPhone(phone, 'mobile');
}

export async function getAdminById(id) {
  await initializeDatabase();
  const result = await query(
    `
      SELECT
        admin_staff.id,
        admin_staff.name,
        admin_staff.account,
        admin_staff.department,
        admin_staff.status,
        admin_staff.delete_status,
        admin_staff.phone,
        admin_staff.email,
        admin_staff.last_login,
        admin_staff.company_id,
        admin_staff.store_id,
        roles.id AS role_id,
        roles.role_name,
        roles.scope AS role_scope
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
      WHERE admin_staff.id = $1 AND admin_staff.status != '停用' AND admin_staff.delete_status = '正常'
    `,
    [Number(id)]
  );

  const row = result.rows[0];
  if (!row) return null;
  const permissions = await getPermissionsByRoleId(row.role_id);
  return mapAdminUser(row, permissions);
}

export async function getStaffRecordById(id) {
  await initializeDatabase();
  const result = await query(
    `
      SELECT
        admin_staff.id,
        admin_staff.name,
        admin_staff.account,
        admin_staff.password,
        admin_staff.department,
        admin_staff.status,
        admin_staff.phone,
        admin_staff.email,
        admin_staff.last_login,
        admin_staff.role_id,
        roles.role_name
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
      WHERE admin_staff.id = $1 AND admin_staff.delete_status = '正常'
    `,
    [Number(id)]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    name: row.name,
    account: row.account,
    department: row.department,
    status: row.status,
    delete_status: row.delete_status,
    phone: row.phone,
    email: row.email,
    last_login: row.last_login,
    role_id: String(row.role_id),
    role_name: row.role_name
  };
}

export async function getStaffDetail(id) {
  await initializeDatabase();
  const row = (
    await query(
      `
        SELECT
          admin_staff.id,
          admin_staff.name,
          admin_staff.account,
          admin_staff.department,
          admin_staff.status,
          admin_staff.delete_status,
          admin_staff.phone,
          admin_staff.email,
          admin_staff.last_login,
          admin_staff.company_id,
          admin_staff.store_id,
          roles.role_name,
          companies.name AS company_name,
          company_stores.name AS store_name
        FROM admin_staff
        LEFT JOIN roles ON roles.id = admin_staff.role_id
        LEFT JOIN companies ON companies.id = admin_staff.company_id
        LEFT JOIN company_stores ON company_stores.id = admin_staff.store_id
        WHERE admin_staff.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    name: row.name,
    account: row.account,
    department: row.department,
    status: row.status,
    delete_status: row.delete_status,
    phone: row.phone,
    email: row.email,
    last_login: row.last_login,
    role_name: row.role_name,
    company_id: row.company_id ? String(row.company_id) : '',
    store_id: row.store_id ? String(row.store_id) : '',
    company_name: row.company_name ?? '未绑定',
    store_name: row.store_name ?? '未绑定'
  };
}

export async function updateStaffOrganization(id, payload, actorName = '后台用户') {
  await initializeDatabase();
  await query(
    `
      UPDATE admin_staff
      SET company_id = $1, store_id = $2, updated_by = $3, updated_at = $4
      WHERE id = $5
    `,
    [
      payload.company_id && payload.company_id !== 'none' ? Number(payload.company_id) : null,
      payload.store_id && payload.store_id !== 'none' ? Number(payload.store_id) : null,
      actorName,
      now(),
      Number(id)
    ]
  );
}

export async function getRoleDetail(roleId) {
  await initializeDatabase();
  const result = await query(
    `
      SELECT id, role_name, scope, status, description
      FROM roles
      WHERE id = $1
    `,
    [Number(roleId)]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    role_name: row.role_name,
    scope: row.scope,
    status: row.status,
    description: row.description
  };
}

export async function getRolePermissionMatrix(roleId, { page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  return executePaginatedQuery({
    sql: `
      SELECT
        permissions.id,
        permissions.module,
        permissions.permission_name,
        permissions.code,
        permissions.level,
        permissions.status,
        CASE WHEN role_permissions.role_id IS NULL THEN FALSE ELSE TRUE END AS assigned
      FROM permissions
      LEFT JOIN role_permissions
        ON role_permissions.permission_id = permissions.id
       AND role_permissions.role_id = $1
      ORDER BY permissions.module ASC, permissions.id ASC
    `,
    params: [Number(roleId)],
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      module: row.module,
      permission_name: row.permission_name,
      code: row.code,
      level: row.level,
      status: row.status,
      assigned: row.assigned
    })
  });
}

export async function replaceRolePermissions(roleId, permissionIds = []) {
  await initializeDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [Number(roleId)]);
    const timestamp = now();
    for (const permissionId of permissionIds) {
      await client.query(
        `
          INSERT INTO role_permissions (role_id, permission_id, created_at)
          VALUES ($1, $2, $3)
        `,
        [Number(roleId), Number(permissionId), timestamp]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getRoleOptions() {
  await initializeDatabase();
  const rows = (await query(`SELECT id, role_name FROM roles WHERE delete_status = '正常' ORDER BY id ASC`)).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: row.role_name
  }));
}

export async function getProductCategoryOptions() {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT id, category_name, category_code
        FROM product_categories
        WHERE status = '启用' AND delete_status = '正常'
        ORDER BY sort_order ASC, id ASC
      `
    )
  ).rows;
  return rows.map((row) => ({
    value: row.category_name,
    label: `${row.category_name} (${row.category_code})`
  }));
}

export async function getCompanyOptions(user = {}) {
  await initializeDatabase();
  await syncAllCompaniesOrderQuota();
  const params = ['停用'];
  let sql = `
    SELECT id, name, code, available_order_quota
    FROM companies
    WHERE status != $1 AND delete_status = '正常'
    ORDER BY id ASC
  `;
  sql = appendCompanyDataScope(sql, params, user, 'id');
  const rows = (
    await query(sql, params)
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.name} (${row.code})`,
    code: row.code,
    availableOrderQuota: toNumber(row.available_order_quota)
  }));
}

export async function getCompanyLevelOptions() {
  const rules = await getOrderQuotaLevelRules();
  return Object.entries(rules).map(([level, quota]) => ({
    value: level,
    label: `${level}（${quota}）`
  }));
}

export async function getRefundEligibleMemberOrderOptions(companyId) {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT id, order_no, member_name, total_amount
        FROM member_orders
        WHERE status = '已核销'
          AND order_quota_returned = FALSE
          AND delete_status = '正常'
          AND ($1::int IS NULL OR company_id = $1)
        ORDER BY id DESC
      `,
      [companyId ? Number(companyId) : null]
    )
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.order_no} / ${row.member_name} / ${toNumber(row.total_amount)}`
  }));
}

export async function listPurchaseOrdersByCompany(companyId, { page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const nextPage = normalizePageValue(page);
  const offset = (nextPage - 1) * pageSize;
  const total = Number(
    (
      await query(
        `
          SELECT COUNT(*)::int AS count
          FROM purchase_orders
          WHERE company_id = $1 AND delete_status = '正常'
        `,
        [Number(companyId)]
      )
    ).rows[0].count
  );
  const rows = (
    await query(
      `
        SELECT
          purchase_orders.id,
          purchase_orders.order_no,
          purchase_orders.status,
          purchase_orders.order_quota_total,
          purchase_orders.approval_status,
          purchase_orders.delete_status,
          purchase_orders.created_at,
          COALESCE(order_items.item_count, 0)::int AS item_count,
          COALESCE(order_items.product_summary, '') AS product_summary,
          COALESCE(order_items.spec_summary, '') AS spec_summary
        FROM purchase_orders
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS item_count,
            STRING_AGG(products.name || ' × ' || purchase_order_items.quantity, ' / ' ORDER BY purchase_order_items.id ASC) AS product_summary,
            STRING_AGG(product_skus.spec || ' × ' || purchase_order_items.quantity, ' / ' ORDER BY purchase_order_items.id ASC) AS spec_summary
          FROM purchase_order_items
          INNER JOIN product_skus ON product_skus.id = purchase_order_items.sku_id
          INNER JOIN products ON products.id = product_skus.product_id
          WHERE purchase_order_items.purchase_order_id = purchase_orders.id
        ) order_items ON TRUE
        WHERE purchase_orders.company_id = $1 AND purchase_orders.delete_status = '正常'
        ORDER BY purchase_orders.updated_at DESC, purchase_orders.id DESC
        LIMIT $2 OFFSET $3
      `,
      [Number(companyId), pageSize, offset]
    )
  ).rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    product_name: row.product_summary || '',
    spec: row.spec_summary || '',
    item_count: toNumber(row.item_count),
    status: row.status,
    order_quota_total: toNumber(row.order_quota_total),
    approval_status: row.approval_status,
    delete_status: row.delete_status,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));

  return buildPaginatedResult(rows, total, nextPage, pageSize);
}

export async function listMemberOrdersByCompany(companyId, { page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const nextPage = normalizePageValue(page);
  const offset = (nextPage - 1) * pageSize;
  const total = Number(
    (
      await query(
        `
          SELECT COUNT(*)::int AS count
          FROM member_orders
          WHERE company_id = $1 AND delete_status = '正常'
        `,
        [Number(companyId)]
      )
    ).rows[0].count
  );
  const rows = (
    await query(
      `
        SELECT
          member_orders.id,
          member_orders.order_no,
          member_orders.status,
          member_orders.customer_type,
          member_orders.member_name,
          member_orders.total_amount,
          member_orders.delete_status,
          member_orders.created_at,
          products.name AS product_name,
          product_skus.spec
        FROM member_orders
        LEFT JOIN LATERAL (
          SELECT sku_id
          FROM member_order_items
          WHERE member_order_id = member_orders.id
          ORDER BY id ASC
          LIMIT 1
        ) first_item ON TRUE
        LEFT JOIN product_skus ON product_skus.id = first_item.sku_id
        LEFT JOIN products ON products.id = product_skus.product_id
        WHERE member_orders.company_id = $1 AND member_orders.delete_status = '正常'
        ORDER BY member_orders.updated_at DESC, member_orders.id DESC
        LIMIT $2 OFFSET $3
      `,
      [Number(companyId), pageSize, offset]
    )
  ).rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    product_name: row.product_name ?? '',
    spec: row.spec ?? '',
    status: row.status,
    customer_type: row.customer_type === 'member' ? '会员' : '散客',
    member_name: row.customer_type === 'member' ? row.member_name : (row.member_name || '散客'),
    total_amount: toNumber(row.total_amount),
    delete_status: row.delete_status,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));

  return buildPaginatedResult(rows, total, nextPage, pageSize);
}

export async function getStoreOptions(companyId, user = {}) {
  await initializeDatabase();
  const params = [];
  const where = [`delete_status = '正常'`];
  if (companyId && companyId !== 'all') {
    assertCanAccessCompany(user, companyId);
    params.push(Number(companyId));
    where.push(`company_id = $${params.length}`);
  } else if (!canAccessAllCompanies(user)) {
    const scopedCompanyId = getUserCompanyId(user);
    if (scopedCompanyId) {
      params.push(scopedCompanyId);
      where.push(`company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }

  const rows = (
    await query(
      `SELECT id, name, code FROM company_stores WHERE ${where.join(' AND ')} ORDER BY id ASC`,
      params
    )
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.name} (${row.code})`
  }));
}

export async function getAdminStaffSelectOptions({ companyId } = {}) {
  await initializeDatabase();
  const params = [];
  let whereClause = `WHERE admin_staff.status != '停用' AND admin_staff.delete_status = '正常'`;
  if (companyId) {
    params.push(Number(companyId));
    whereClause += ` AND (admin_staff.company_id IS NULL OR admin_staff.company_id = $${params.length})`;
  }

  const rows = (
    await query(
      `
        SELECT admin_staff.id, admin_staff.name, admin_staff.account, admin_staff.department, companies.name AS company_name
        FROM admin_staff
        LEFT JOIN companies ON companies.id = admin_staff.company_id
        ${whereClause}
        ORDER BY admin_staff.name ASC, admin_staff.id ASC
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.name} / ${row.account}${row.department ? ` / ${row.department}` : ''}${row.company_name ? ` / ${row.company_name}` : ''}`
  }));
}

export async function getProductSkuOptions() {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT
          product_skus.id,
          product_skus.sku_code,
          product_skus.spec,
          product_skus.order_quota_price,
          products.name AS product_name
        FROM product_skus
        INNER JOIN products ON products.id = product_skus.product_id
        WHERE product_skus.status = '启用' AND product_skus.delete_status = '正常' AND products.delete_status = '正常'
        ORDER BY product_skus.id ASC
      `
    )
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.product_name} / ${row.spec} / ${row.sku_code}`,
    skuCode: row.sku_code,
    productName: row.product_name,
    spec: row.spec,
    orderQuotaPrice: toNumber(row.order_quota_price)
  }));
}

export async function getPurchaseOrderOptions(user = {}) {
  await initializeDatabase();
  const params = [];
  const where = [`purchase_orders.status != '已驳回'`, `purchase_orders.delete_status = '正常'`];
  if (!canAccessAllCompanies(user)) {
    const scopedCompanyId = getUserCompanyId(user);
    if (scopedCompanyId) {
      params.push(scopedCompanyId);
      where.push(`purchase_orders.company_id = $${params.length}`);
    } else {
      where.push('1 = 0');
    }
  }
  const rows = (
    await query(
      `
        SELECT purchase_orders.id, purchase_orders.order_no, companies.name AS company_name
        FROM purchase_orders
        INNER JOIN companies ON companies.id = purchase_orders.company_id
        WHERE ${where.join(' AND ')}
        ORDER BY purchase_orders.id DESC
      `,
      params
    )
  ).rows;

  return [{ value: 'none', label: '不关联订货单' }].concat(
    rows.map((row) => ({
      value: String(row.id),
      label: `${row.order_no} / ${row.company_name}`
    }))
  );
}

async function getCount(sql, values = []) {
  const result = await query(sql, values);
  return Number(result.rows[0].count);
}

export async function getStoreStats(user = {}) {
  await initializeDatabase();
  const scope = canAccessAllCompanies(user) ? { clause: '', values: [] } : { clause: ' AND company_id = $1', values: [getUserCompanyId(user) ?? -1] };
  return {
    total: await getCount(`SELECT COUNT(*)::int AS count FROM company_stores WHERE delete_status = '正常'${scope.clause}`, scope.values),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM company_stores WHERE status = '营业中' AND delete_status = '正常'${scope.clause}`, scope.values),
    pending: await getCount(`SELECT COUNT(*)::int AS count FROM company_stores WHERE status = '筹备中' AND delete_status = '正常'${scope.clause}`, scope.values)
  };
}

export async function getStaffStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM admin_staff'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM admin_staff WHERE status = '在职'`),
    pending: await getCount(`SELECT COUNT(*)::int AS count FROM admin_staff WHERE status = '试用中'`)
  };
}

export async function getMemberStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM members'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM members WHERE status = '活跃'`),
    highValue: await getCount(`SELECT COUNT(*)::int AS count FROM members WHERE status = '高价值'`)
  };
}

export async function getRoleStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM roles'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM roles WHERE status = '启用'`),
    draft: await getCount(`SELECT COUNT(*)::int AS count FROM roles WHERE status != '启用'`)
  };
}

export async function getPermissionStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM permissions'),
    actionCount: await getCount(`SELECT COUNT(*)::int AS count FROM permissions WHERE level = '按钮'`),
    dataScope: await getCount(`SELECT COUNT(*)::int AS count FROM permissions WHERE level = '数据'`)
  };
}

export async function getProductStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM products'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM products WHERE status = '启用'`),
    skuCount: await getCount('SELECT COUNT(*)::int AS count FROM product_skus')
  };
}

export async function listProductChangeRequests({ page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  return executePaginatedQuery({
    sql: `
      SELECT
        product_change_requests.id,
        product_change_requests.entity_type,
        product_change_requests.entity_id,
        product_change_requests.product_id,
        product_change_requests.action,
        product_change_requests.payload,
        product_change_requests.status,
        product_change_requests.request_note,
        product_change_requests.created_by,
        product_change_requests.approved_by,
        product_change_requests.approved_note,
        product_change_requests.approved_at,
        product_change_requests.created_at,
        products.name AS product_name,
        products.spu_code
      FROM product_change_requests
      LEFT JOIN products ON products.id = product_change_requests.product_id
      ORDER BY
        CASE WHEN product_change_requests.status = '待审核' THEN 0 ELSE 1 END,
        product_change_requests.updated_at DESC,
        product_change_requests.id DESC
    `,
    page,
    pageSize,
    mapRow: (row) => {
      const payload = row.payload ?? {};
      const isSku = row.entity_type === 'sku';
      return {
        id: String(row.id),
        entity_type: row.entity_type,
        entity_label: productChangeEntityLabel(row.entity_type),
        action: productChangeActionLabel(row.action),
        status: row.status,
        request_note: row.request_note,
        created_by: row.created_by,
        approved_by: row.approved_by,
        approved_note: row.approved_note,
        approved_at: row.approved_at,
        created_at: row.created_at,
        product_id: row.product_id ? String(row.product_id) : '',
        entity_id: row.entity_id ? String(row.entity_id) : '',
        product_name:
          row.product_name ?? (payload.name || payload.product_name || (isSku ? '未命名 SKU' : '未命名商品')),
        spu_code: row.spu_code ?? payload.spu_code ?? '',
        sku_code: payload.sku_code ?? '',
        summary: isSku
          ? `${payload.name || payload.sku_code || '待生成'} / ${payload.spec || '未填写规格'}`
          : `${payload.name || row.product_name || '未命名商品'}`
      };
    }
  });
}

export async function listProductCategories({ search = '', status = 'all', page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const deleteFilter = buildDeleteStatusFilter(status, 'product_categories.delete_status');
  const queryData = buildListQuery({
    baseQuery:
      'SELECT id, category_name, category_code, description, status, sort_order FROM product_categories',
    searchColumns: ['category_name', 'category_code', 'description'],
    search,
    filterColumn: 'status',
    filterValue: ['__deleted__', '__with_deleted__'].includes(status) ? 'all' : status,
    orderBy: 'updated_at DESC, id DESC'
  });
  let sql = queryData.sql;
  if (deleteFilter.applies) {
    sql = sql.replace(
      'ORDER BY updated_at DESC, id DESC',
      `${sql.includes(' WHERE ') ? ' AND ' : ' WHERE '}${deleteFilter.condition} ORDER BY updated_at DESC, id DESC`
    );
  }

  return executePaginatedQuery({
    sql,
    params: queryData.params,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      category_name: row.category_name,
      category_code: row.category_code,
      description: row.description,
      status: row.status,
      sort_order: Number(row.sort_order)
    })
  });
}

export async function getCategoryStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM product_categories'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM product_categories WHERE status = '启用'`),
    used: await getCount(
      `SELECT COUNT(DISTINCT category)::int AS count FROM products WHERE category IN (SELECT category_name FROM product_categories)`
    )
  };
}

export async function getCompanyStats(user = {}) {
  await initializeDatabase();
  const companyScope = canAccessAllCompanies(user) ? { clause: '', values: [] } : { clause: ' AND id = $1', values: [getUserCompanyId(user) ?? -1] };
  const storeScope = canAccessAllCompanies(user) ? { clause: '', values: [] } : { clause: ' AND company_id = $1', values: [getUserCompanyId(user) ?? -1] };
  return {
    total: await getCount(`SELECT COUNT(*)::int AS count FROM companies WHERE delete_status = '正常'${companyScope.clause}`, companyScope.values),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM companies WHERE status = '启用' AND delete_status = '正常'${companyScope.clause}`, companyScope.values),
    storeCount: await getCount(`SELECT COUNT(*)::int AS count FROM company_stores WHERE delete_status = '正常'${storeScope.clause}`, storeScope.values)
  };
}

export async function getInventoryStats(user = {}) {
  await initializeDatabase();
  const scope = canAccessAllCompanies(user) ? { clause: '', values: [] } : { clause: ' AND company_id = $1', values: [getUserCompanyId(user) ?? -1] };
  return {
    total: await getCount(`SELECT COUNT(*)::int AS count FROM company_inventory WHERE delete_status = '正常'${scope.clause}`, scope.values),
    warning: await getCount(`SELECT COUNT(*)::int AS count FROM company_inventory WHERE quantity <= safety_stock AND delete_status = '正常'${scope.clause}`, scope.values),
    low: await getCount(`SELECT COUNT(*)::int AS count FROM company_inventory WHERE status = '低库存' AND delete_status = '正常'${scope.clause}`, scope.values)
  };
}

export async function getPurchaseOrderStats(user = {}) {
  await initializeDatabase();
  const scope = canAccessAllCompanies(user) ? { clause: '', values: [] } : { clause: ' AND company_id = $1', values: [getUserCompanyId(user) ?? -1] };
  return {
    total: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE delete_status = '正常' AND store_id IS NULL${scope.clause}`, scope.values),
    pending: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE approval_status = '待审核' AND delete_status = '正常' AND store_id IS NULL${scope.clause}`, scope.values),
    received: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE stock_received = TRUE AND delete_status = '正常' AND store_id IS NULL${scope.clause}`, scope.values)
  };
}

export async function getMemberOrderStats(user = {}) {
  await initializeDatabase();
  const scope = canAccessAllCompanies(user) ? { clause: '', values: [] } : { clause: ' AND company_id = $1', values: [getUserCompanyId(user) ?? -1] };
  return {
    total: await getCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE delete_status = '正常'${scope.clause}`, scope.values),
    writeoff: await getCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE status = '已核销' AND delete_status = '正常'${scope.clause}`, scope.values),
    abnormal: await getCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE status = '异常' AND delete_status = '正常'${scope.clause}`, scope.values)
  };
}

function buildDashboardCompanyScope(user, tableAlias, params) {
  if (canAccessAllCompanies(user)) {
    return '';
  }
  const companyId = getUserCompanyId(user);
  if (!companyId) {
    return ' AND 1 = 0';
  }
  params.push(companyId);
  return ` AND ${tableAlias}.company_id = $${params.length}`;
}

function formatDateTimeValue(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';
}

async function getDashboardCount(sql, params = []) {
  return toNumber((await query(sql, params)).rows[0]?.count);
}

async function getDashboardSummary(user) {
  const companyParams = [];
  const companyId = getUserCompanyId(user);
  const companyWhere = canAccessAllCompanies(user)
    ? "companies.delete_status = '正常'"
    : "companies.delete_status = '正常' AND companies.id = $1";
  if (!canAccessAllCompanies(user)) {
    companyParams.push(companyId ?? -1);
  }
  const companySummary = (
    await query(
      `
        SELECT
          COUNT(*)::int AS company_count,
          COALESCE(SUM(total_order_quota), 0) AS total_order_quota,
          COALESCE(SUM(available_order_quota), 0) AS available_order_quota
        FROM companies
        WHERE ${companyWhere}
      `,
      companyParams
    )
  ).rows[0];

  const storeParams = [];
  const storeScope = buildDashboardCompanyScope(user, 'company_stores', storeParams);
  const storeSummary = (
    await query(
      `
        SELECT
          COUNT(*)::int AS store_count,
          COUNT(*) FILTER (WHERE status = '营业中')::int AS active_store_count
        FROM company_stores
        WHERE delete_status = '正常'${storeScope}
      `,
      storeParams
    )
  ).rows[0];

  const inventoryParams = [];
  const inventoryScope = buildDashboardCompanyScope(user, 'company_inventory', inventoryParams);
  const inventorySummary = (
    await query(
      `
        SELECT
          COALESCE(SUM(company_inventory.quantity), 0)::int AS inventory_quantity_total,
          COALESCE(SUM(company_inventory.quantity * product_skus.order_quota_price), 0) AS inventory_amount_total,
          COUNT(*) FILTER (WHERE company_inventory.status IN ('低库存', '缺货'))::int AS warning_inventory_count
        FROM company_inventory
        INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
        WHERE company_inventory.delete_status = '正常'${inventoryScope}
      `,
      inventoryParams
    )
  ).rows[0];

  const memberParams = [];
  const memberScope = buildDashboardCompanyScope(user, 'member_orders', memberParams);
  const todayWriteoffCount = await getDashboardCount(
    `
      SELECT COUNT(*)::int AS count
      FROM member_orders
      WHERE delete_status = '正常'
        AND status = '已核销'
        AND updated_at >= CURRENT_DATE
        AND updated_at < CURRENT_DATE + INTERVAL '1 day'
        ${memberScope}
    `,
    memberParams
  );

  return {
    companyCount: toNumber(companySummary?.company_count),
    storeCount: toNumber(storeSummary?.store_count),
    activeStoreCount: toNumber(storeSummary?.active_store_count),
    totalOrderQuota: toNumber(companySummary?.total_order_quota),
    availableOrderQuota: toNumber(companySummary?.available_order_quota),
    usedOrderQuota: toNumber(companySummary?.total_order_quota) - toNumber(companySummary?.available_order_quota),
    inventoryQuantityTotal: toNumber(inventorySummary?.inventory_quantity_total),
    inventoryAmountTotal: toNumber(inventorySummary?.inventory_amount_total),
    warningInventoryCount: toNumber(inventorySummary?.warning_inventory_count),
    todayWriteoffCount
  };
}

async function getDashboardPendingTasks(user) {
  const purchaseParams = [];
  const purchaseScope = buildDashboardCompanyScope(user, 'purchase_orders', purchaseParams);
  const memberParams = [];
  const memberScope = buildDashboardCompanyScope(user, 'member_orders', memberParams);
  const inventoryParams = [];
  const inventoryScope = buildDashboardCompanyScope(user, 'company_inventory', inventoryParams);
  const adjustmentParams = [];
  const adjustmentScope = buildDashboardCompanyScope(user, 'inventory_adjustments', adjustmentParams);

  if (canAccessAllCompanies(user)) {
    return [
      { label: '订货额调整审核', count: await getDashboardCount("SELECT COUNT(*)::int AS count FROM order_quota_adjustments WHERE status = '待审核' AND delete_status = '正常'"), href: '/dashboard/order-quota-approvals' },
      { label: '库存调整审核', count: await getDashboardCount("SELECT COUNT(*)::int AS count FROM inventory_adjustments WHERE status = '待审核' AND delete_status = '正常'"), href: '/dashboard/inventory-approvals' },
      { label: '商品审核', count: await getDashboardCount("SELECT COUNT(*)::int AS count FROM product_change_requests WHERE status = '待审核'"), href: '/dashboard/product-approvals' },
      { label: '删除审核', count: await getDashboardCount("SELECT COUNT(*)::int AS count FROM delete_requests WHERE status = '待审核'"), href: '/dashboard/delete-approvals' },
      { label: '异常订货单', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE approval_status = '待审核' AND delete_status = '正常'${purchaseScope}`, purchaseParams), href: '/dashboard/purchase-orders' },
      { label: '散客订单异常', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE status = '异常' AND delete_status = '正常'${memberScope}`, memberParams), href: '/dashboard/member-orders' }
    ];
  }

  return [
    { label: '待入库订货单', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE store_id IS NULL AND stock_received = FALSE AND approval_status != '已驳回' AND delete_status = '正常'${purchaseScope}`, purchaseParams), href: '/dashboard/purchase-orders' },
    { label: '门店订货待处理', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE store_id IS NOT NULL AND status IN ('待审核', '待发货', '待入库') AND delete_status = '正常'${purchaseScope}`, purchaseParams), href: '/dashboard/purchase-orders' },
    { label: '异常散客订单', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE status = '异常' AND delete_status = '正常'${memberScope}`, memberParams), href: '/dashboard/member-orders' },
    { label: '低库存/缺货', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM company_inventory WHERE status IN ('低库存', '缺货') AND delete_status = '正常'${inventoryScope}`, inventoryParams), href: '/dashboard/inventory' },
    { label: '库存调整申请', count: await getDashboardCount(`SELECT COUNT(*)::int AS count FROM inventory_adjustments WHERE status = '待审核' AND delete_status = '正常'${adjustmentScope}`, adjustmentParams), href: '/dashboard/inventory' }
  ];
}

async function getDashboardRecentPurchaseOrders(user, { storeOrders = false, limit = 6 } = {}) {
  const params = [];
  const scope = buildDashboardCompanyScope(user, 'purchase_orders', params);
  params.push(limit);
  const rows = (
    await query(
      `
        SELECT
          purchase_orders.id,
          purchase_orders.order_no,
          companies.name AS company_name,
          company_stores.name AS store_name,
          purchase_orders.status,
          purchase_orders.approval_status,
          purchase_orders.order_quota_total,
          purchase_orders.stock_received,
          purchase_orders.created_at,
          COALESCE(order_items.item_count, 0)::int AS item_count,
          COALESCE(order_items.product_summary, '') AS product_summary,
          COALESCE(order_items.spec_summary, '') AS spec_summary
        FROM purchase_orders
        INNER JOIN companies ON companies.id = purchase_orders.company_id
        LEFT JOIN company_stores ON company_stores.id = purchase_orders.store_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS item_count,
            STRING_AGG(products.name || ' × ' || purchase_order_items.quantity, ' / ' ORDER BY purchase_order_items.id ASC) AS product_summary,
            STRING_AGG(product_skus.spec || ' × ' || purchase_order_items.quantity, ' / ' ORDER BY purchase_order_items.id ASC) AS spec_summary
          FROM purchase_order_items
          INNER JOIN product_skus ON product_skus.id = purchase_order_items.sku_id
          INNER JOIN products ON products.id = product_skus.product_id
          WHERE purchase_order_items.purchase_order_id = purchase_orders.id
        ) order_items ON TRUE
        WHERE purchase_orders.delete_status = '正常'
          AND purchase_orders.store_id IS ${storeOrders ? 'NOT NULL' : 'NULL'}
          ${scope}
        ORDER BY purchase_orders.updated_at DESC, purchase_orders.id DESC
        LIMIT $${params.length}
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    company_name: row.company_name,
    store_name: row.store_name ?? '',
    status: row.status,
    approval_status: row.approval_status,
    order_quota_total: toNumber(row.order_quota_total),
    stock_received: boolValue(row.stock_received),
    item_count: toNumber(row.item_count),
    product_summary: row.product_summary,
    spec_summary: row.spec_summary,
    created_at: formatDateTimeValue(row.created_at)
  }));
}

async function getDashboardRecentMemberOrders(user, limit = 6) {
  const params = [];
  const scope = buildDashboardCompanyScope(user, 'member_orders', params);
  params.push(limit);
  const rows = (
    await query(
      `
        SELECT
          member_orders.id,
          member_orders.order_no,
          companies.name AS company_name,
          company_stores.name AS store_name,
          member_orders.status,
          member_orders.customer_type,
          member_orders.member_name,
          member_orders.total_amount,
          member_orders.created_at,
          COALESCE(order_items.product_summary, '') AS product_summary,
          COALESCE(order_items.spec_summary, '') AS spec_summary
        FROM member_orders
        INNER JOIN companies ON companies.id = member_orders.company_id
        INNER JOIN company_stores ON company_stores.id = member_orders.store_id
        LEFT JOIN LATERAL (
          SELECT
            STRING_AGG(products.name || ' × ' || member_order_items.quantity, ' / ' ORDER BY member_order_items.id ASC) AS product_summary,
            STRING_AGG(product_skus.spec || ' × ' || member_order_items.quantity, ' / ' ORDER BY member_order_items.id ASC) AS spec_summary
          FROM member_order_items
          INNER JOIN product_skus ON product_skus.id = member_order_items.sku_id
          INNER JOIN products ON products.id = product_skus.product_id
          WHERE member_order_items.member_order_id = member_orders.id
        ) order_items ON TRUE
        WHERE member_orders.delete_status = '正常'${scope}
        ORDER BY member_orders.updated_at DESC, member_orders.id DESC
        LIMIT $${params.length}
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    company_name: row.company_name,
    store_name: row.store_name,
    status: row.status,
    customer_type: row.customer_type === 'member' ? '会员' : '散客',
    customer_name: row.customer_type === 'member' ? row.member_name : (row.member_name || '散客'),
    total_amount: toNumber(row.total_amount),
    product_summary: row.product_summary,
    spec_summary: row.spec_summary,
    created_at: formatDateTimeValue(row.created_at)
  }));
}

async function getDashboardLowInventory(user, limit = 6) {
  const params = [];
  const scope = buildDashboardCompanyScope(user, 'company_inventory', params);
  params.push(limit);
  const rows = (
    await query(
      `
        SELECT
          company_inventory.id,
          companies.name AS company_name,
          products.name AS product_name,
          product_skus.sku_code,
          product_skus.spec,
          company_inventory.quantity,
          company_inventory.safety_stock,
          company_inventory.status
        FROM company_inventory
        INNER JOIN companies ON companies.id = company_inventory.company_id
        INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
        INNER JOIN products ON products.id = product_skus.product_id
        WHERE company_inventory.delete_status = '正常'
          AND company_inventory.status IN ('低库存', '缺货')
          ${scope}
        ORDER BY
          CASE WHEN company_inventory.status = '缺货' THEN 0 ELSE 1 END,
          company_inventory.updated_at DESC,
          company_inventory.id DESC
        LIMIT $${params.length}
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    company_name: row.company_name,
    product_name: row.product_name,
    sku_code: row.sku_code,
    spec: row.spec,
    quantity: toNumber(row.quantity),
    safety_stock: toNumber(row.safety_stock),
    status: row.status
  }));
}

async function getDashboardCompanyRanking(limit = 6) {
  const rows = (
    await query(
      `
        SELECT
          companies.id,
          companies.name,
          companies.code,
          companies.available_order_quota,
          companies.total_order_quota,
          COALESCE(member_summary.total_sales, 0) AS total_sales,
          COALESCE(member_summary.writeoff_count, 0)::int AS writeoff_count,
          COALESCE(member_summary.abnormal_count, 0)::int AS abnormal_count,
          COALESCE(order_summary.order_quota_spent, 0) AS order_quota_spent,
          COALESCE(inventory_summary.inventory_amount, 0) AS inventory_amount
        FROM companies
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(total_amount), 0) AS total_sales,
            COUNT(*) FILTER (WHERE status = '已核销') AS writeoff_count,
            COUNT(*) FILTER (WHERE status = '异常') AS abnormal_count
          FROM member_orders
          WHERE member_orders.company_id = companies.id
            AND member_orders.delete_status = '正常'
        ) member_summary ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(order_quota_total), 0) AS order_quota_spent
          FROM purchase_orders
          WHERE purchase_orders.company_id = companies.id
            AND purchase_orders.store_id IS NULL
            AND purchase_orders.order_quota_deducted = TRUE
            AND purchase_orders.delete_status = '正常'
        ) order_summary ON TRUE
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(company_inventory.quantity * product_skus.order_quota_price), 0) AS inventory_amount
          FROM company_inventory
          INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
          WHERE company_inventory.company_id = companies.id
            AND company_inventory.delete_status = '正常'
        ) inventory_summary ON TRUE
        WHERE companies.delete_status = '正常'
        ORDER BY order_quota_spent DESC, total_sales DESC, companies.updated_at DESC
        LIMIT $1
      `,
      [limit]
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    code: row.code,
    available_order_quota: toNumber(row.available_order_quota),
    total_order_quota: toNumber(row.total_order_quota),
    total_sales: toNumber(row.total_sales),
    writeoff_count: toNumber(row.writeoff_count),
    abnormal_count: toNumber(row.abnormal_count),
    order_quota_spent: toNumber(row.order_quota_spent),
    inventory_amount: toNumber(row.inventory_amount)
  }));
}

async function getDashboardStoreOrderStats(user) {
  const params = [];
  const scope = buildDashboardCompanyScope(user, 'purchase_orders', params);
  const row = (
    await query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status IN ('待审核', '待处理'))::int AS pending,
          COUNT(*) FILTER (WHERE status = '待发货')::int AS waiting_shipment,
          COUNT(*) FILTER (WHERE status IN ('已完成', '已入库'))::int AS completed,
          COUNT(*) FILTER (WHERE abnormal_flag = TRUE OR approval_status = '已驳回')::int AS abnormal
        FROM purchase_orders
        WHERE store_id IS NOT NULL
          AND delete_status = '正常'
          ${scope}
      `,
      params
    )
  ).rows[0];

  return {
    pending: toNumber(row?.pending),
    waitingShipment: toNumber(row?.waiting_shipment),
    completed: toNumber(row?.completed),
    abnormal: toNumber(row?.abnormal)
  };
}

export async function getDashboardOverview(user = {}) {
  await initializeDatabase();
  await syncAllCompaniesOrderQuota();
  const isHeadquarters = canAccessAllCompanies(user);
  const summary = await getDashboardSummary(user);
  const [
    pendingTasks,
    lowInventory,
    headquartersPurchaseOrders,
    storePurchaseOrders,
    memberOrders,
    storeOrderStats
  ] = await Promise.all([
    getDashboardPendingTasks(user),
    getDashboardLowInventory(user),
    getDashboardRecentPurchaseOrders(user, { storeOrders: false }),
    getDashboardRecentPurchaseOrders(user, { storeOrders: true }),
    getDashboardRecentMemberOrders(user),
    getDashboardStoreOrderStats(user)
  ]);

  return {
    scope: isHeadquarters ? 'headquarters' : 'branch',
    summary,
    pendingTasks,
    lowInventory,
    headquartersPurchaseOrders,
    storePurchaseOrders,
    memberOrders,
    storeOrderStats,
    companyRanking: isHeadquarters ? await getDashboardCompanyRanking() : []
  };
}

function normalizeStoreInput(input) {
  return [
    input.name,
    input.manager_name,
    input.city,
    input.status,
    Number(input.staff_count || 0),
    Number(input.monthly_revenue || 0)
  ];
}

function normalizeStaffInput(input) {
  return [
    input.name,
    input.account,
    input.password ?? '',
    input.department ?? '未分配',
    Number(input.role_id),
    input.status,
    input.phone,
    input.email,
    input.last_login ?? '从未登录'
  ];
}

function normalizeMemberInput(input) {
  return [
    input.name,
    input.level,
    input.tags,
    input.city,
    input.status,
    Number(input.total_spent || 0)
  ];
}

function normalizeRoleInput(input) {
  return [input.role_name, input.scope, input.status, input.description];
}

function normalizePermissionInput(input) {
  return [input.module, input.permission_name, input.code, input.level, input.status];
}

function normalizeCategoryInput(input) {
  return [
    input.category_name,
    input.category_code,
    input.description ?? '',
    input.status,
    Number(input.sort_order || 0)
  ];
}

function normalizeProductInput(input) {
  return [
    input.spu_code,
    input.name,
    input.brand || '米粒冠',
    input.category,
    input.scenario,
    input.description ?? '',
    input.image_url ?? '',
    input.status
  ];
}

function normalizeSkuInput(input) {
  return [
    input.name,
    input.sku_code,
    input.spec,
    input.packaging,
    input.unit,
    input.barcode,
    input.qr_code,
    input.image_url ?? '',
    Number(input.order_quota_price || 0),
    Number(input.redeem_points_price || 0),
    Number(input.sale_price || 0),
    input.status ?? '启用'
  ];
}

function productChangeEntityLabel(entityType) {
  return entityType === 'sku' ? 'SKU' : 'SPU';
}

function productChangeActionLabel(action) {
  if (action === 'create') return '新增';
  if (action === 'update') return '修改';
  if (action === 'delete') return '删除';
  return action;
}

function validateSkuPayload(input) {
  const requiredTextFields = [
    ['name', 'SKU 名称'],
    ['sku_code', 'SKU 编码'],
    ['spec', '规格'],
    ['packaging', '包装'],
    ['unit', '单位'],
    ['barcode', '条码'],
    ['qr_code', '二维码']
  ];

  for (const [key, label] of requiredTextFields) {
    if (!String(input[key] ?? '').trim()) {
      throw new Error(`${label}不能为空`);
    }
  }

  const numericFields = [
    ['order_quota_price', '订货额度价'],
    ['redeem_points_price', '积分兑换价'],
    ['sale_price', '售价']
  ];

  for (const [key, label] of numericFields) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label}必须大于 0`);
    }
  }
}

function normalizeCompanyInput(input) {
  return [
    input.name,
    input.code,
    input.company_level,
    input.manager_name,
    input.contact_phone,
    input.status,
    input.notes ?? ''
  ];
}

function normalizeInventoryInput(input) {
  return [
    Number(input.company_id),
    Number(input.sku_id),
    Number(input.quantity || 0),
    Number(input.safety_stock || 0),
    input.status ?? '充足',
    input.remark ?? ''
  ];
}

async function getPrimarySkuByProductId(productId) {
  const result = await query(
    `
      SELECT id
      FROM product_skus
      WHERE product_id = $1
      ORDER BY id ASC
      LIMIT 1
    `,
    [Number(productId)]
  );
  return result.rows[0]?.id ?? null;
}

function purchaseOrderOrderQuotaTotal(quantity, orderQuotaPrice) {
  return Number(quantity || 0) * Number(orderQuotaPrice || 0);
}

function normalizePurchaseOrderItems(payload) {
  const rawItems = Array.isArray(payload.items) && payload.items.length > 0
    ? payload.items
    : [{ sku_id: payload.sku_id, quantity: payload.quantity }];

  return rawItems
    .map((item) => ({
      skuId: Number(item.sku_id),
      quantity: Number(item.quantity)
    }))
    .filter((item) => Number.isFinite(item.skuId) && item.skuId > 0 && Number.isFinite(item.quantity) && item.quantity > 0);
}

async function getCompanyById(companyId) {
  await syncCompanyOrderQuota(companyId);
  const result = await query(
    `
        SELECT id, name, code, available_order_quota, total_order_quota, delete_status
      FROM companies
      WHERE id = $1
    `,
    [Number(companyId)]
  );
  return result.rows[0] ?? null;
}

async function syncAllCompaniesOrderQuota() {
  const rows = (await query('SELECT id FROM companies WHERE delete_status = $1', ['正常'])).rows;
  for (const row of rows) {
    await syncCompanyOrderQuota(row.id);
  }
}

async function getSkuById(skuId) {
  const result = await query(
    `
      SELECT
        product_skus.id,
        product_skus.name,
        product_skus.sku_code,
        product_skus.spec,
        product_skus.order_quota_price,
        product_skus.redeem_points_price,
        product_skus.sale_price,
        product_skus.barcode,
        product_skus.qr_code,
        products.name AS product_name
      FROM product_skus
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE product_skus.id = $1
    `,
    [Number(skuId)]
  );
  return result.rows[0] ?? null;
}

async function getSkusByIds(skuIds) {
  if (skuIds.length === 0) return [];
  const result = await query(
    `
      SELECT
        product_skus.id,
        product_skus.name,
        product_skus.sku_code,
        product_skus.spec,
        product_skus.order_quota_price,
        products.name AS product_name
      FROM product_skus
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE product_skus.id = ANY($1::int[])
        AND product_skus.status = '启用'
        AND product_skus.delete_status = '正常'
        AND products.delete_status = '正常'
    `,
    [skuIds]
  );
  return result.rows;
}

async function generatePurchaseOrderNo(client, companyCode) {
  const compactDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${companyCode}-${compactDate}-`;
  const result = await client.query(
    'SELECT order_no FROM purchase_orders WHERE order_no LIKE $1 ORDER BY order_no DESC LIMIT 1',
    [`${prefix}%`]
  );
  const lastNo = result.rows[0]?.order_no ?? '';
  let nextSequence = Number(lastNo.slice(prefix.length)) + 1;
  if (!Number.isFinite(nextSequence) || nextSequence <= 0) {
    nextSequence = 1;
  }
  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

async function getProductById(productId) {
  const result = await query(
    `
      SELECT id, spu_code, name, category, status
      FROM products
      WHERE id = $1
    `,
    [Number(productId)]
  );
  return result.rows[0] ?? null;
}

function normalizePageValue(page) {
  const next = Number(page ?? 1);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : 1;
}

function buildPaginatedResult(rows, total, page, pageSize) {
  const totalRows = Number(total ?? 0);
  return {
    rows,
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize))
  };
}

function stripOrderBy(sql) {
  return sql.replace(/\sORDER BY[\s\S]*$/i, '');
}

async function executePaginatedQuery({
  sql,
  params = [],
  page = 1,
  pageSize = 10,
  mapRow
}) {
  const nextPage = normalizePageValue(page);
  const nextPageSize = Number(pageSize) > 0 ? Number(pageSize) : 10;
  const offset = (nextPage - 1) * nextPageSize;
  const countSql = `SELECT COUNT(*)::int AS count FROM (${stripOrderBy(sql)}) AS paged_rows`;
  const total = Number((await query(countSql, params)).rows[0].count);
  const rows = (await query(`${sql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, nextPageSize, offset])).rows;
  return buildPaginatedResult(rows.map(mapRow), total, nextPage, nextPageSize);
}

async function getSkuRecordById(skuId) {
  const result = await query(
    `
      SELECT
        product_skus.id,
        product_skus.product_id,
        product_skus.name,
        product_skus.sku_code,
        product_skus.spec,
        product_skus.packaging,
        product_skus.unit,
        product_skus.barcode,
        product_skus.qr_code,
        product_skus.image_url,
        product_skus.order_quota_price,
        product_skus.redeem_points_price,
        product_skus.sale_price,
        product_skus.status,
        product_skus.delete_status,
        products.name AS product_name,
        products.spu_code
      FROM product_skus
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE product_skus.id = $1
    `,
    [Number(skuId)]
  );
  return result.rows[0] ?? null;
}

async function assertSkuBelongsToProduct(productId, skuId) {
  const result = await query(
    `
      SELECT id
      FROM product_skus
      WHERE id = $1 AND product_id = $2
    `,
    [Number(skuId), Number(productId)]
  );
  if (!result.rows[0]) {
    throw new Error('未找到对应的 SKU 记录');
  }
}

async function assertCategoryExists(categoryName) {
  const result = await query(
    'SELECT id FROM product_categories WHERE category_name = $1 AND status = $2 LIMIT 1',
    [categoryName, '启用']
  );
  if (!result.rows[0]) {
    throw new Error('所选商品分类不存在或已停用');
  }
}

async function appendApprovalLog({ entityType, entityId, action, result, note, createdBy = '系统' }) {
  await query(
    `
      INSERT INTO approval_logs (entity_type, entity_id, action, result, note, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [entityType, String(entityId), action, result, note ?? '', createdBy, now()]
  );
}

function normalizeNotificationPayload(payload = {}) {
  return {
    recipientScope: payload.recipientScope ?? payload.recipient_scope ?? 'all',
    recipientUserId: payload.recipientUserId ?? payload.recipient_user_id ?? null,
    recipientCompanyId: payload.recipientCompanyId ?? payload.recipient_company_id ?? null,
    type: payload.type ?? 'system',
    title: payload.title ?? '',
    body: payload.body ?? '',
    actionType: payload.actionType ?? payload.action_type ?? 'redirect',
    actionLabel: payload.actionLabel ?? payload.action_label ?? '',
    actionUrl: payload.actionUrl ?? payload.action_url ?? '',
    metadata: payload.metadata ?? payload.metadata_json ?? {}
  };
}

export async function createAdminNotification(payload = {}) {
  await initializeDatabase();
  const notification = normalizeNotificationPayload(payload);
  const result = await query(
    `
      INSERT INTO admin_notifications
        (recipient_scope, recipient_user_id, recipient_company_id, type, title, body, status, action_type, action_label, action_url, metadata_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'unread', $7, $8, $9, $10::jsonb, $11)
      RETURNING id
    `,
    [
      notification.recipientScope,
      notification.recipientUserId ? Number(notification.recipientUserId) : null,
      notification.recipientCompanyId ? Number(notification.recipientCompanyId) : null,
      notification.type,
      notification.title,
      notification.body,
      notification.actionType,
      notification.actionLabel,
      notification.actionUrl,
      JSON.stringify(notification.metadata ?? {}),
      now()
    ]
  );
  return result.rows[0].id;
}

async function getStaffIdsByPermission(permissionCode) {
  const rows = (
    await query(
      `
        SELECT DISTINCT admin_staff.id
        FROM admin_staff
        INNER JOIN role_permissions ON role_permissions.role_id = admin_staff.role_id
        INNER JOIN permissions ON permissions.id = role_permissions.permission_id
        WHERE permissions.code = $1
          AND admin_staff.status != '停用'
          AND admin_staff.delete_status = '正常'
          AND admin_staff.login_scope != 'app'
      `,
      [permissionCode]
    )
  ).rows;
  return rows.map((row) => Number(row.id));
}

async function getStaffIdsByCompany(companyId) {
  const rows = (
    await query(
      `
        SELECT DISTINCT id
        FROM admin_staff
        WHERE company_id = $1
          AND status != '停用'
          AND delete_status = '正常'
          AND login_scope != 'app'
      `,
      [Number(companyId)]
    )
  ).rows;
  return rows.map((row) => Number(row.id));
}

export async function createPermissionNotification(permissionCode, payload = {}) {
  await initializeDatabase();
  const staffIds = await getStaffIdsByPermission(permissionCode);
  const ids = [];
  for (const staffId of staffIds) {
    ids.push(
      await createAdminNotification({
        ...payload,
        recipientScope: 'user',
        recipientUserId: staffId
      })
    );
  }
  return ids;
}

export async function createCompanyNotification(companyId, payload = {}) {
  await initializeDatabase();
  const staffIds = await getStaffIdsByCompany(companyId);
  const ids = [];
  for (const staffId of staffIds) {
    ids.push(
      await createAdminNotification({
        ...payload,
        recipientScope: 'user',
        recipientUserId: staffId,
        recipientCompanyId: companyId
      })
    );
  }
  return ids;
}

function queueNotification(promise) {
  void promise.catch((error) => {
    console.error('创建后台通知失败', error);
  });
}

function adminNotificationVisibility(user, params) {
  const conditions = [`status != 'archived'`];
  const userId = Number(user?.id ?? 0);
  const companyId = getUserCompanyId(user);
  const scopeClauses = [];
  if (userId) {
    params.push(userId);
    scopeClauses.push(`recipient_user_id = $${params.length}`);
  }
  scopeClauses.push(`recipient_scope = 'all'`);
  if (canAccessAllCompanies(user)) {
    scopeClauses.push(`recipient_scope = 'headquarters'`);
  }
  if (companyId) {
    params.push(companyId);
    scopeClauses.push(`(recipient_scope = 'company' AND recipient_company_id = $${params.length})`);
  }
  conditions.push(`(${scopeClauses.join(' OR ')})`);
  return conditions;
}

function mapNotificationRow(row) {
  return {
    id: String(row.id),
    type: row.type,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    actions: row.action_url
      ? [
          {
            id: 'open',
            label: row.action_label || '查看',
            type: row.action_type || 'redirect',
            url: row.action_url
          }
        ]
      : [],
    metadata: row.metadata_json ?? {}
  };
}

export async function listAdminNotifications(user, { status = 'all', page = 1, pageSize = 50 } = {}) {
  await initializeDatabase();
  const params = [];
  const conditions = adminNotificationVisibility(user, params);
  if (['unread', 'read'].includes(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const total = Number(
    (await query(`SELECT COUNT(*)::int AS count FROM admin_notifications ${whereClause}`, params)).rows[0]?.count ?? 0
  );
  const nextPage = normalizePageValue(page);
  const limit = Math.max(1, Math.min(100, Number(pageSize || 50)));
  params.push(limit);
  params.push((nextPage - 1) * limit);
  const rows = (
    await query(
      `
        SELECT id, type, title, body, status, action_type, action_label, action_url, metadata_json, created_at, read_at
        FROM admin_notifications
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    )
  ).rows;
  return buildPaginatedResult(rows.map(mapNotificationRow), total, nextPage, limit);
}

export async function markAdminNotificationRead(id, user) {
  await initializeDatabase();
  const params = [Number(id)];
  const conditions = adminNotificationVisibility(user, params);
  const result = await query(
    `
      UPDATE admin_notifications
      SET status = 'read', read_at = COALESCE(read_at, $${params.length + 1})
      WHERE id = $1 AND ${conditions.join(' AND ')}
      RETURNING id
    `,
    [...params, now()]
  );
  if (result.rowCount === 0) {
    throw new Error('通知不存在或无权操作');
  }
  return { success: true };
}

export async function markAllAdminNotificationsRead(user) {
  await initializeDatabase();
  const params = [];
  const conditions = adminNotificationVisibility(user, params);
  const timestamp = now();
  await query(
    `
      UPDATE admin_notifications
      SET status = 'read', read_at = COALESCE(read_at, $${params.length + 1})
      WHERE ${conditions.join(' AND ')} AND status = 'unread'
    `,
    [...params, timestamp]
  );
  return { success: true };
}

function buildDeleteSummary(entity, row = {}) {
  switch (entity) {
    case 'products':
      return { title: row.name ?? '', code: row.spu_code ?? '', status: row.status ?? '' };
    case 'product-skus':
      return { title: row.name ?? '', code: row.sku_code ?? '', status: row.status ?? '' };
    case 'companies':
      return { title: row.name ?? '', code: row.code ?? '', status: row.status ?? '' };
    case 'stores':
    case 'company-stores':
      return { title: row.name ?? '', code: row.code ?? '', status: row.status ?? '' };
    case 'purchase-orders':
    case 'member-orders':
      return { title: row.order_no ?? '', code: row.order_no ?? '', status: row.status ?? '' };
    case 'categories':
      return { title: row.category_name ?? '', code: row.category_code ?? '', status: row.status ?? '' };
    case 'roles':
      return { title: row.role_name ?? '', code: row.scope ?? '', status: row.status ?? '' };
    case 'permissions':
      return { title: row.permission_name ?? '', code: row.code ?? '', status: row.status ?? '' };
    case 'members':
      return { title: row.name ?? '', code: row.city ?? '', status: row.status ?? '' };
    case 'inventory':
      return { title: row.product_name ?? '', code: row.sku_code ?? '', status: row.status ?? '' };
    case 'staff':
      return { title: row.name ?? '', code: row.account ?? '', status: row.status ?? '' };
    default:
      return row;
  }
}

async function insertDeleteRequest({ entityType, entityId, summary, createdBy, requestNote = '' }) {
  const timestamp = now();
  const result = await query(
    `
      INSERT INTO delete_requests
        (entity_type, entity_id, summary, status, request_note, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, '待审核', $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [entityType, Number(entityId), JSON.stringify(summary ?? {}), requestNote, createdBy, createdBy, timestamp, timestamp]
  );
  await appendApprovalLog({
    entityType: 'delete_request',
    entityId: result.rows[0].id,
    action: '删除申请',
    result: '待审核',
    note: requestNote || '提交删除申请',
    createdBy
  });
  queueNotification(
    createPermissionNotification('delete:approve', {
      type: 'delete_request_pending',
      title: '删除申请待审核',
      body: `${summary?.title || summary?.code || entityType} 提交了删除申请`,
      actionLabel: '查看删除审核',
      actionUrl: '/dashboard/delete-approvals',
      metadata: { entityType, entityId, requestId: result.rows[0].id }
    })
  );
  return result.rows[0].id;
}

export async function createAuditLog(payload) {
  await initializeDatabase();
  await query(
    `
      INSERT INTO admin_audit_logs
        (request_id, operator_id, operator_name, operator_account, operator_role, module, action, method, path, query_json, request_headers_json, request_body_json, response_status, response_body_json, ip, user_agent, duration_ms, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15, $16, $17, $18)
    `,
    [
      payload.requestId ?? randomUUID(),
      payload.operatorId ?? '',
      payload.operatorName ?? '',
      payload.operatorAccount ?? '',
      payload.operatorRole ?? '',
      payload.module ?? '',
      payload.action ?? '',
      payload.method ?? '',
      payload.path ?? '',
      JSON.stringify(payload.query ?? {}),
      JSON.stringify(payload.requestHeaders ?? {}),
      JSON.stringify(payload.requestBody ?? {}),
      Number(payload.responseStatus ?? 0),
      JSON.stringify(payload.responseBody ?? {}),
      payload.ip ?? '',
      payload.userAgent ?? '',
      Number(payload.durationMs ?? 0),
      now()
    ]
  );
}

async function changeCompanyOrderQuota(companyId, delta, reason, createdBy = '系统') {
  const company = await getCompanyById(companyId);
  if (!company) {
    throw new Error('分公司不存在');
  }

  const nextAvailable = toNumber(company.available_order_quota) + Number(delta);
  if (nextAvailable < 0) {
    throw new Error(`分公司 ${company.name} 可用订货额不足`);
  }

  const nextTotal = Number(delta) > 0 ? toNumber(company.total_order_quota) + Number(delta) : toNumber(company.total_order_quota);
  await query(
    `
      UPDATE companies
      SET available_order_quota = $1, total_order_quota = $2, updated_by = $3, updated_at = $4
      WHERE id = $5
    `,
    [nextAvailable, nextTotal, createdBy, now(), Number(companyId)]
  );

  if (reason) {
    await appendApprovalLog({
      entityType: 'points',
      entityId: companyId,
      action: '订货额变更',
      result: delta >= 0 ? '增加' : '扣减',
      note: reason,
      createdBy
    });
  }
}

async function upsertInventory(companyId, skuId, delta, sourceType, sourceId, remark) {
  const existing = (
    await query(
      `
        SELECT id, quantity, safety_stock, status
        FROM company_inventory
        WHERE company_id = $1 AND sku_id = $2
      `,
      [Number(companyId), Number(skuId)]
    )
  ).rows[0];

  const currentQuantity = existing ? toNumber(existing.quantity) : 0;
  const nextQuantity = currentQuantity + Number(delta);

  if (nextQuantity < 0) {
    throw new Error('库存不足，无法完成当前操作');
  }

  const safetyStock = existing ? toNumber(existing.safety_stock) : 10;
  const nextStatus = nextQuantity === 0 ? '缺货' : nextQuantity <= safetyStock ? '低库存' : '充足';

  if (existing) {
    await query(
      `
        UPDATE company_inventory
        SET quantity = $1, status = $2, updated_by = $3, updated_at = $4
        WHERE id = $5
      `,
      [nextQuantity, nextStatus, sourceType || '系统', now(), existing.id]
    );
  } else {
    await query(
      `
        INSERT INTO company_inventory
          (company_id, sku_id, quantity, safety_stock, status, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [Number(companyId), Number(skuId), nextQuantity, safetyStock, nextStatus, sourceType || '系统', now(), now()]
    );
  }

  await query(
    `
      INSERT INTO inventory_logs
        (company_id, sku_id, source_type, source_id, change_type, quantity, balance_after, remark, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      Number(companyId),
      Number(skuId),
      sourceType,
      String(sourceId),
      delta >= 0 ? '入库' : '出库',
      Math.abs(Number(delta)),
      nextQuantity,
      remark ?? '',
      now()
    ]
  );
  if (['低库存', '缺货'].includes(nextStatus) && (!existing || existing.status !== nextStatus)) {
    const sku = (
      await query(
        `
          SELECT product_skus.sku_code, products.name AS product_name
          FROM product_skus
          INNER JOIN products ON products.id = product_skus.product_id
          WHERE product_skus.id = $1
        `,
        [Number(skuId)]
      )
    ).rows[0];
    const body = `${sku?.product_name ?? '商品'} / ${sku?.sku_code ?? skuId} 当前库存 ${nextQuantity}`;
    queueNotification(
      createPermissionNotification('inventory:approve', {
        type: 'inventory_warning',
        title: nextStatus === '缺货' ? '库存缺货预警' : '低库存预警',
        body,
        actionLabel: '查看库存',
        actionUrl: '/dashboard/inventory',
        metadata: { companyId, skuId, quantity: nextQuantity, status: nextStatus }
      })
    );
    queueNotification(
      createCompanyNotification(companyId, {
        type: 'inventory_warning',
        title: nextStatus === '缺货' ? '库存缺货预警' : '低库存预警',
        body,
        actionLabel: '查看库存',
        actionUrl: '/dashboard/inventory',
        metadata: { companyId, skuId, quantity: nextQuantity, status: nextStatus }
      })
    );
  }
}

async function createProductRecord(payload) {
  await assertCategoryExists(payload.category);
  const timestamp = now();
  const values = normalizeProductInput(payload);
  const productResult = await query(
    `
      INSERT INTO products
        (spu_code, name, brand, category, scenario, description, image_url, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [...values, timestamp, timestamp]
  );
  return productResult.rows[0].id;
}

async function createProductRecordInternal(payload, actorName = '后台用户') {
  const id = await createProductRecord(payload);
  await markUpdatedBy('products', id, actorName);
  return id;
}

async function updateProductRecord(id, payload, actorName = '后台用户') {
  await assertCategoryExists(payload.category);
  const timestamp = now();
  const values = normalizeProductInput(payload);
  await query(
    `
      UPDATE products
      SET
        spu_code = $1,
        name = $2,
        brand = $3,
        category = $4,
        scenario = $5,
        description = $6,
        image_url = $7,
        status = $8,
        updated_by = $9,
        updated_at = $10
      WHERE id = $11
    `,
    [...values, actorName, timestamp, Number(id)]
  );
}

async function deleteProductRecordInternal(id, actorName = '后台用户') {
  await assertProductDeletable(id);
  await softDeleteEntity('products', id, actorName);
}

export async function createProductSku(productId, payload) {
  await initializeDatabase();
  const product = await getProductById(productId);
  if (!product) {
    throw new Error('商品不存在，无法新增 SKU');
  }
  validateSkuPayload(payload);
  const timestamp = now();
  const values = normalizeSkuInput(payload);
  const result = await query(
    `
      INSERT INTO product_skus
        (product_id, name, sku_code, spec, packaging, unit, barcode, qr_code, image_url, order_quota_price, redeem_points_price, sale_price, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
    [Number(productId), ...values, timestamp, timestamp]
  );
  return result.rows[0].id;
}

async function createProductSkuInternal(productId, payload, actorName = '后台用户') {
  const id = await createProductSku(productId, payload);
  await markUpdatedBy('product_skus', id, actorName);
  return id;
}

export async function updateProductSku(productId, skuId, payload, actorName = '后台用户') {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);
  validateSkuPayload(payload);
  const timestamp = now();
  const values = normalizeSkuInput(payload);
  await query(
    `
      UPDATE product_skus
      SET
        name = $1,
        sku_code = $2,
        spec = $3,
        packaging = $4,
        unit = $5,
        barcode = $6,
        qr_code = $7,
        image_url = $8,
        order_quota_price = $9,
        redeem_points_price = $10,
        sale_price = $11,
        status = $12,
        updated_by = $13,
        updated_at = $14
      WHERE id = $15
    `,
    [...values, actorName, timestamp, Number(skuId)]
  );
}

async function assertSkuDeletable(skuId) {
  const tables = [
    ['company_inventory', '库存记录'],
    ['inventory_logs', '库存流水'],
    ['purchase_order_items', '订货单明细'],
    ['member_order_items', '会员订单明细'],
    ['writeoff_records', '核销记录'],
    ['inventory_adjustments', '库存调整记录']
  ];

  for (const [table, label] of tables) {
    const result = await query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE sku_id = $1`, [Number(skuId)]);
    if (toNumber(result.rows[0]?.count) > 0) {
      throw new Error(`该 SKU 已被${label}引用，不能删除`);
    }
  }
}

export async function deleteProductSku(productId, skuId, actorName = '后台用户') {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);
  await assertSkuDeletable(skuId);
  await softDeleteEntity('product_skus', skuId, actorName);
}

async function deleteProductSkuInternal(productId, skuId, actorName = '后台用户') {
  await deleteProductSku(productId, skuId, actorName);
}

async function createProductChangeRequest({
  entityType,
  entityId = null,
  productId = null,
  action,
  payload,
  requestNote = '',
  createdBy = '后台用户'
}) {
  const timestamp = now();
  const result = await query(
    `
      INSERT INTO product_change_requests
        (entity_type, entity_id, product_id, action, payload, status, request_note, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, '待审核', $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [
      entityType,
      entityId ? Number(entityId) : null,
      productId ? Number(productId) : null,
      action,
      JSON.stringify(payload ?? {}),
      requestNote,
      createdBy,
      createdBy,
      timestamp,
      timestamp
    ]
  );

  await appendApprovalLog({
    entityType: `product_request:${entityType}`,
    entityId: result.rows[0].id,
    action: `${productChangeEntityLabel(entityType)}${productChangeActionLabel(action)}申请`,
    result: '待审核',
    note: requestNote || '提交商品变更审核',
    createdBy
  });
  queueNotification(
    createPermissionNotification('products:approve', {
      type: 'product_change_pending',
      title: '商品变更待审核',
      body: `${productChangeEntityLabel(entityType)}${productChangeActionLabel(action)}申请已提交`,
      actionLabel: '查看商品审核',
      actionUrl: '/dashboard/product-approvals',
      metadata: { requestId: result.rows[0].id, entityType, entityId, productId, action }
    })
  );

  return result.rows[0].id;
}

async function assertProductDeletable(productId) {
  const skuRows = (
    await query('SELECT id FROM product_skus WHERE product_id = $1 ORDER BY id ASC', [Number(productId)])
  ).rows;
  if (skuRows.length > 0) {
    throw new Error('请先删除该商品下的全部 SKU，再删除 SPU');
  }
}

async function createCompanyRecord(payload) {
  const timestamp = now();
  const { companyLevel, quota } = await getCompanyBaseOrderQuota(payload.company_level);
  const values = [
    payload.name,
    payload.code,
    companyLevel,
    payload.manager_name,
    payload.contact_phone,
    payload.status,
    quota,
    quota,
    payload.notes ?? ''
  ];
  const result = await query(
    `
      INSERT INTO companies
        (name, code, company_level, manager_name, contact_phone, status, available_order_quota, total_order_quota, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `,
    [...values, timestamp, timestamp]
  );
  return result.rows[0].id;
}

async function updateCompanyRecord(id, payload) {
  const timestamp = now();
  const { companyLevel } = await getCompanyBaseOrderQuota(payload.company_level);
  await query(
    `
      UPDATE companies
      SET
        name = $1,
        code = $2,
        company_level = $3,
        manager_name = $4,
        contact_phone = $5,
        status = $6,
        notes = $7,
        updated_at = $8
      WHERE id = $9
    `,
    [
      payload.name,
      payload.code,
      companyLevel,
      payload.manager_name,
      payload.contact_phone,
      payload.status,
      payload.notes ?? '',
      timestamp,
      Number(id)
    ]
  );
  await syncCompanyOrderQuota(id);
}

async function createInventoryRecord(payload) {
  await initializeDatabase();
  const [companyId, skuId, quantity, _safetyStock, _status, remark] = normalizeInventoryInput(payload);
  const timestamp = now();
  const result = await query(
    `
      INSERT INTO inventory_adjustments
        (company_id, sku_id, requested_quantity, reason, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, '待审核', '后台用户', $5, $6)
      RETURNING id
    `,
    [companyId, skuId, quantity, remark || '手工调整库存', timestamp, timestamp]
  );
  await appendApprovalLog({
    entityType: 'inventory_adjustment',
    entityId: result.rows[0].id,
    action: '库存调整',
    result: '已提交',
    note: remark || '新增库存调整申请',
    createdBy: '后台用户'
  });
  queueNotification(
    createPermissionNotification('inventory:approve', {
      type: 'inventory_adjustment_pending',
      title: '库存调整待审核',
      body: remark || '新增库存调整申请',
      actionLabel: '查看库存审核',
      actionUrl: '/dashboard/inventory-approvals',
      metadata: { adjustmentId: result.rows[0].id, companyId, skuId }
    })
  );
  return result.rows[0].id;
}

async function updateInventoryRecord(id, payload, actorName = '后台用户') {
  const [companyId, skuId, quantity, _safetyStock, _status, remark] = normalizeInventoryInput(payload);
  await query(
    `
      UPDATE inventory_adjustments
      SET company_id = $1, sku_id = $2, requested_quantity = $3, reason = $4, updated_by = $5, updated_at = $6
      WHERE id = $7
    `,
    [companyId, skuId, quantity, remark || '更新库存调整申请', actorName, now(), Number(id)]
  );
}

async function createPurchaseOrderRecord(payload, actorName = '后台用户', user = null) {
  const timestamp = now();
  const company = await getCompanyById(payload.company_id);
  if (!company) {
    throw new Error('分公司不存在');
  }
  if (company.delete_status !== '正常') {
    throw new Error('分公司已删除，不能创建订货单');
  }
  assertCanAccessCompany(user, payload.company_id);
  if (payload.store_id && payload.store_id !== 'none') {
    throw new Error('管理后台只支持分公司向总公司订货，门店订货请在 App 发起');
  }

  const normalizedItems = normalizePurchaseOrderItems(payload);
  if (normalizedItems.length === 0) {
    throw new Error('请至少选择一个 SKU，并填写大于 0 的订货数量');
  }
  const skuRows = await getSkusByIds([...new Set(normalizedItems.map((item) => item.skuId))]);
  const skuMap = new Map(skuRows.map((sku) => [Number(sku.id), sku]));
  if (skuMap.size !== new Set(normalizedItems.map((item) => item.skuId)).size) {
    throw new Error('存在不可用或已删除的 SKU');
  }

  const orderItems = normalizedItems.map((item) => {
    const sku = skuMap.get(item.skuId);
    const unitPrice = toNumber(sku.order_quota_price);
    return {
      skuId: item.skuId,
      quantity: item.quantity,
      unitPrice,
      subtotal: purchaseOrderOrderQuotaTotal(item.quantity, unitPrice)
    };
  });
  const orderQuotaTotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
  const availableOrderQuota = toNumber(company.available_order_quota);
  const abnormalFlag = availableOrderQuota < orderQuotaTotal;
  const status = abnormalFlag ? '待审核' : '待入库';
  const approvalStatus = abnormalFlag ? '待审核' : '自动通过';
  const orderQuotaDeducted = !abnormalFlag;
  const stockReceived = false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderNo = await generatePurchaseOrderNo(client, company.code);
    const orderResult = await client.query(
      `
        INSERT INTO purchase_orders
          (order_no, company_id, store_id, status, order_quota_total, remark, abnormal_flag, approval_status, order_quota_deducted, stock_received, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `,
      [orderNo, Number(payload.company_id), null, status, orderQuotaTotal, payload.remark ?? '', abnormalFlag, approvalStatus, orderQuotaDeducted, stockReceived, actorName, timestamp, timestamp]
    );
    const orderId = orderResult.rows[0].id;
    for (const item of orderItems) {
      await client.query(
        `
          INSERT INTO purchase_order_items
            (purchase_order_id, sku_id, quantity, order_quota_unit_price, subtotal_order_quota)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [orderId, item.skuId, item.quantity, item.unitPrice, item.subtotal]
      );
    }
    if (!abnormalFlag) {
      await client.query(
        `
          UPDATE companies
          SET available_order_quota = available_order_quota - $1, updated_by = $2, updated_at = $3
          WHERE id = $4
        `,
        [orderQuotaTotal, actorName, timestamp, Number(payload.company_id)]
      );
    }
    await client.query('COMMIT');

    await appendApprovalLog({
      entityType: 'purchase_order',
      entityId: orderId,
      action: abnormalFlag ? '异常订货' : '订货创建',
      result: approvalStatus,
      note: abnormalFlag ? '分公司订货额不足，等待人工审核' : '订货单已创建',
      createdBy: actorName
    });
    if (abnormalFlag) {
      queueNotification(
        createPermissionNotification('purchase-orders:approve', {
          type: 'purchase_order_pending',
          title: '订货单待审核',
          body: `${company.name} 订货额不足，订货单等待总部审核`,
          actionLabel: '查看订货单',
          actionUrl: `/dashboard/purchase-orders/${orderId}`,
          metadata: { purchaseOrderId: orderId, companyId: payload.company_id }
        })
      );
    } else {
      queueNotification(
        createCompanyNotification(payload.company_id, {
          type: 'purchase_order_pending_receive',
          title: '订货单待入库',
          body: '订货单已自动通过，请确认收货入库',
          actionLabel: '查看订货单',
          actionUrl: `/dashboard/purchase-orders/${orderId}`,
          metadata: { purchaseOrderId: orderId, companyId: payload.company_id }
        })
      );
    }
    return orderId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updatePurchaseOrderRecord(id, payload, actorName = '后台用户') {
  const timestamp = now();
  await query(
    `
      UPDATE purchase_orders
      SET status = $1, remark = $2, updated_by = $3, updated_at = $4
      WHERE id = $5
    `,
    [payload.status, payload.remark ?? '', actorName, timestamp, Number(id)]
  );
}

async function createWriteoffFromMemberOrder(memberOrderId) {
  const order = (
    await query(
      `
        SELECT
          member_orders.id,
          member_orders.order_no,
          member_orders.company_id,
          member_orders.store_id,
          member_orders.sales_staff_name,
          member_orders.total_amount,
          member_orders.stock_deducted,
          member_orders.writeoff_quota_rebated
        FROM member_orders
        WHERE member_orders.id = $1
      `,
      [Number(memberOrderId)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('散客订单不存在');
  }
  if (order.stock_deducted && order.writeoff_quota_rebated) {
    return;
  }

  if (!order.stock_deducted) {
    const items = (
      await query(
      `
        SELECT member_order_items.id, member_order_items.sku_id, member_order_items.quantity, product_skus.qr_code
        FROM member_order_items
        INNER JOIN product_skus ON product_skus.id = member_order_items.sku_id
        WHERE member_order_items.member_order_id = $1
      `,
        [Number(memberOrderId)]
      )
    ).rows;

    for (const item of items) {
      await upsertInventory(order.company_id, item.sku_id, -toNumber(item.quantity), '散客订单核销', memberOrderId, '散客订单核销扣减库存');
      await query(
        `
          INSERT INTO writeoff_records
            (member_order_id, sku_id, store_id, sales_staff_name, product_code, status, writeoff_time, remark)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          Number(memberOrderId),
          item.sku_id,
          order.store_id,
          order.sales_staff_name,
          item.qr_code,
          '成功',
          new Date().toLocaleString('zh-CN', { hour12: false }),
          '散客订单核销完成'
        ]
      );
    }

    await query(
      `
        UPDATE member_order_items
        SET writeoff_status = '已核销'
        WHERE member_order_id = $1
      `,
      [Number(memberOrderId)]
    );

    await query(
      `
      UPDATE member_orders
      SET stock_deducted = TRUE, status = '已核销', updated_by = $1, updated_at = $2
      WHERE id = $3
    `,
      ['系统', now(), Number(memberOrderId)]
    );
  }

  if (!order.writeoff_quota_rebated) {
    const ratio = await getWriteoffOrderQuotaRebateRatio();
    const rebateAmount = Math.max(0, toNumber(order.total_amount) * ratio);
    if (rebateAmount > 0) {
      await changeStoreOrderQuota(order.store_id, rebateAmount, '散客订单核销自动回弹门店订货额度', '系统');
      await changeCompanyOrderQuota(order.company_id, rebateAmount, '散客订单核销自动回弹分公司订货额度', '系统');
      await createAutoReturnOrderQuotaAdjustment({
        companyId: order.company_id,
        amount: rebateAmount,
        adjustmentType: '核销回弹',
        reason: `散客订单核销成功，按基础设置比例 ${ratio} 自动回弹订货额度`,
        createdBy: '系统',
        sourceMemberOrderId: memberOrderId
      });
      queueNotification(
        createCompanyNotification(order.company_id, {
          type: 'order_quota_rebated_by_writeoff',
          title: '核销回弹订货额',
          body: `${order.order_no ?? `散客订单 #${memberOrderId}`} 已核销，门店和分公司订货额回弹 ${rebateAmount}`,
          actionLabel: '查看散客订单',
          actionUrl: `/dashboard/member-orders/${memberOrderId}`,
          metadata: {
            memberOrderId,
            companyId: order.company_id,
            storeId: order.store_id,
            rebateAmount
          }
        })
      );
    }
    await query(
      `UPDATE member_orders SET writeoff_quota_rebated = TRUE, updated_by = $1, updated_at = $2 WHERE id = $3`,
      ['系统', now(), Number(memberOrderId)]
    );
  }
}

async function createAutoReturnOrderQuotaAdjustment({
  companyId,
  amount,
  reason,
  adjustmentType = '退货回补',
  createdBy = '系统',
  sourceMemberOrderId = null,
  sourcePurchaseOrderId = null
}) {
  const timestamp = now();
  const result = await query(
    `
      INSERT INTO order_quota_adjustments
        (company_id, adjustment_type, change_type, order_quota_amount, reason, expires_at, target_company_level, source_member_order_id, source_purchase_order_id, status, created_by, updated_by, created_at, updated_at)
      VALUES ($1, $2, '增加', $3, $4, NULL, '', $5, $6, '已通过', $7, $8, $9, $10)
      RETURNING id
    `,
    [
      Number(companyId),
      adjustmentType,
      Number(amount || 0),
      reason,
      sourceMemberOrderId ? Number(sourceMemberOrderId) : null,
      sourcePurchaseOrderId ? Number(sourcePurchaseOrderId) : null,
      createdBy,
      createdBy,
      timestamp,
      timestamp
    ]
  );
  await appendApprovalLog({
    entityType: 'order_quota_adjustment',
    entityId: result.rows[0].id,
    action: adjustmentType,
    result: '已通过',
    note: reason,
    createdBy
  });
  return result.rows[0].id;
}

async function refundMemberOrder(id, note = '', createdBy = '后台用户') {
  const order = (
    await query(
      `
        SELECT id, order_no, company_id, store_id, sales_staff_name, status, total_amount, order_quota_returned
        FROM member_orders
        WHERE member_orders.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('散客订单不存在');
  }
  if (order.status !== '已核销') {
    throw new Error('仅已核销散客订单允许执行退货');
  }
  if (order.order_quota_returned) {
    throw new Error('该散客订单已完成退货回补');
  }

  const items = (
    await query(
      `
        SELECT sku_id, quantity
        FROM member_order_items
        WHERE member_order_id = $1
      `,
      [Number(id)]
    )
  ).rows;

  for (const item of items) {
    await upsertInventory(order.company_id, item.sku_id, toNumber(item.quantity), '散客订单退货', id, '散客订单退货回库');
  }

  await changeStoreOrderQuota(order.store_id, toNumber(order.total_amount), '散客订单退货自动回补门店订货额度', createdBy);
  await changeCompanyOrderQuota(order.company_id, toNumber(order.total_amount), '散客订单退货自动回补分公司订货额度', createdBy);
  await createAutoReturnOrderQuotaAdjustment({
    companyId: order.company_id,
    amount: toNumber(order.total_amount),
    reason: note || '散客订单完成退货，系统自动回补订货额度',
    createdBy,
    sourceMemberOrderId: id
  });

  await query(
    `
      UPDATE member_order_items
      SET writeoff_status = '已退货'
      WHERE member_order_id = $1
    `,
    [Number(id)]
  );
  await query(
    `
      UPDATE member_orders
      SET status = '已退货', order_quota_returned = TRUE, updated_by = $1, updated_at = $2
      WHERE id = $3
    `,
    [createdBy, now(), Number(id)]
  );
  await appendApprovalLog({
    entityType: 'member_order',
    entityId: id,
    action: '退货完成',
    result: '已退货',
    note: note || '散客订单退货完成并自动回补订货额度',
    createdBy
  });
  queueNotification(
    createCompanyNotification(order.company_id, {
      type: 'walk_in_order_refunded',
      title: '散客订单退货完成',
      body: `${order.order_no ?? `散客订单 #${id}`} 已退货，订货额已回补 ${toNumber(order.total_amount)}`,
      actionLabel: '查看散客订单',
      actionUrl: `/dashboard/member-orders/${id}`,
      metadata: {
        memberOrderId: id,
        companyId: order.company_id,
        storeId: order.store_id,
        rebateAmount: toNumber(order.total_amount)
      }
    })
  );
}

async function refundPurchaseOrder(id, note = '', createdBy = '后台用户') {
  const order = (
    await query(
      `
        SELECT id, company_id, store_id, order_no, status, stock_received, order_quota_total
        FROM purchase_orders
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('订货单不存在');
  }
  if (!order.stock_received) {
    throw new Error('仅已入库订货单允许执行退货');
  }
  if (order.status === '已退货') {
    throw new Error('该订货单已完成退货');
  }

  const items = (
    await query(
      `
        SELECT sku_id, quantity
        FROM purchase_order_items
        WHERE purchase_order_id = $1
      `,
      [Number(id)]
    )
  ).rows;

  for (const item of items) {
    await upsertInventory(order.company_id, item.sku_id, -toNumber(item.quantity), '订货单退货', order.order_no, '订货单退货回总部');
  }

  if (order.store_id) {
    await changeStoreOrderQuota(order.store_id, toNumber(order.order_quota_total), '门店订货单退货自动回补门店订货额度', createdBy);
  } else {
    await changeCompanyOrderQuota(order.company_id, toNumber(order.order_quota_total), '订货单退货自动回补分公司订货额度', createdBy);
  }
  await createAutoReturnOrderQuotaAdjustment({
    companyId: order.company_id,
    amount: toNumber(order.order_quota_total),
    reason: note || '订货单完成退货，系统自动回补订货额度',
    createdBy,
    sourcePurchaseOrderId: id
  });

  await query(
    `
      UPDATE purchase_orders
      SET status = '已退货', updated_by = $1, updated_at = $2
      WHERE id = $3
    `,
    [createdBy, now(), Number(id)]
  );
  await appendApprovalLog({
    entityType: 'purchase_order',
    entityId: id,
    action: '退货完成',
    result: '已退货',
    note: note || '订货单退货完成并自动回补订货额度',
    createdBy
  });
  queueNotification(
    createCompanyNotification(order.company_id, {
      type: 'purchase_order_refunded',
      title: '订货单退货完成',
      body: `${order.order_no} 已退货，订货额已回补 ${toNumber(order.order_quota_total)}`,
      actionLabel: '查看订货单',
      actionUrl: `/dashboard/purchase-orders/${id}`,
      metadata: {
        purchaseOrderId: id,
        companyId: order.company_id,
        storeId: order.store_id,
        rebateAmount: toNumber(order.order_quota_total)
      }
    })
  );
}

async function createMemberOrderRecord(payload) {
  const timestamp = now();
  const sku = await getSkuById(payload.sku_id);
  if (!sku) {
    throw new Error('SKU 不存在');
  }
  const store = (
    await query(
      `
        SELECT id, company_id
        FROM company_stores
        WHERE id = $1 AND delete_status = '正常'
      `,
      [Number(payload.store_id)]
    )
  ).rows[0];
  if (!store || Number(store.company_id) !== Number(payload.company_id)) {
    throw new Error('门店只能在所属分公司下创建散客订单');
  }

  const quantity = Number(payload.quantity || 0);
  const unitPrice = Number(payload.unit_price || 0);
  const totalAmount = quantity * unitPrice;
  const orderNo = payload.order_no || `MO-${Date.now()}`;
  const shouldWriteoff = payload.status === '已核销';
  const stockDeducted = false;
  const customerType = payload.customer_type === 'member' ? 'member' : 'walk_in';
  const memberId = customerType === 'member' && payload.member_id ? Number(payload.member_id) : null;
  const customerName = String(payload.member_name ?? '').trim() || (customerType === 'walk_in' ? '散客' : '');
  const customerPhone = String(payload.member_phone ?? '').trim();
  if (customerType === 'member' && !customerName) {
    throw new Error('请填写会员姓名');
  }
  const purchaseOrderId =
    payload.purchase_order_id && payload.purchase_order_id !== 'none'
      ? Number(payload.purchase_order_id)
      : null;
  const result = await query(
    `
      INSERT INTO member_orders
        (order_no, company_id, store_id, status, customer_type, member_id, sales_staff_name, member_name, member_phone, total_amount, purchase_order_id, stock_deducted, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `,
    [
      orderNo,
      Number(payload.company_id),
      Number(payload.store_id),
      payload.status,
      customerType,
      memberId,
      payload.sales_staff_name,
      customerName,
      customerPhone,
      totalAmount,
      purchaseOrderId,
      stockDeducted,
      timestamp,
      timestamp
    ]
  );
  const orderId = result.rows[0].id;
  await query(
    `
      INSERT INTO member_order_items
        (member_order_id, sku_id, quantity, unit_price, point_rebate_base, writeoff_status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      orderId,
      Number(payload.sku_id),
      quantity,
      unitPrice,
      totalAmount,
      payload.status === '已核销' ? '已核销' : payload.status
    ]
  );
  if (shouldWriteoff) {
    await createWriteoffFromMemberOrder(orderId);
  }
  if (payload.status === '异常') {
    queueNotification(
      createCompanyNotification(payload.company_id, {
        type: 'walk_in_order_abnormal',
        title: '散客订单异常',
        body: `${orderNo} 需要跟进处理`,
        actionLabel: '查看散客订单',
        actionUrl: `/dashboard/member-orders/${orderId}`,
        metadata: { memberOrderId: orderId, companyId: payload.company_id, storeId: payload.store_id }
      })
    );
  }
  return orderId;
}

async function getLatestWriteoffForMemberOrder(memberOrderId, skuId) {
  return (
    await query(
      `
        SELECT id
        FROM writeoff_records
        WHERE member_order_id = $1 AND sku_id = $2
        ORDER BY id DESC
        LIMIT 1
      `,
      [Number(memberOrderId), Number(skuId)]
    )
  ).rows[0];
}

async function createDirectMobileWriteoffOrder(skuRow, user, rawCode) {
  if (!user?.companyId || !user?.storeId) {
    return { ok: false, message: '当前账号未绑定分公司或门店' };
  }
  const inventory = (
    await query(
      `
        SELECT quantity
        FROM company_inventory
        WHERE company_id = $1 AND sku_id = $2 AND delete_status = '正常'
        LIMIT 1
      `,
      [Number(user.companyId), Number(skuRow.id)]
    )
  ).rows[0];
  if (!inventory || toNumber(inventory.quantity) < 1) {
    return { ok: false, message: '库存不足，无法完成扫码核销' };
  }
  const unitPrice = Math.max(
    0,
    toNumber(skuRow.sale_price) || toNumber(skuRow.redeem_points_price) || 0
  );
  const orderId = await createMemberOrderRecord({
    order_no: `MO-SCAN-${Date.now()}`,
    company_id: Number(user.companyId),
    store_id: Number(user.storeId),
    status: '已核销',
    customer_type: 'walk_in',
    member_name: '散客',
    member_phone: '',
    sales_staff_name: user.fullName ?? user.name ?? user.account ?? '移动端用户',
    sku_id: Number(skuRow.id),
    quantity: 1,
    unit_price: unitPrice,
    purchase_order_id: 'none'
  });
  const writeoff = await getLatestWriteoffForMemberOrder(orderId, skuRow.id);
  return {
    ok: true,
    id: writeoff ? String(writeoff.id) : String(orderId),
    skuId: String(skuRow.id),
    product: {
      name: skuRow.product_name,
      sku: skuRow.sku_code,
      points: Number(skuRow.redeem_points_price ?? 0)
    },
    message: `已按散客订单直接核销 ${rawCode}`
  };
}

async function updateMemberOrderRecord(id, payload, actorName = '后台用户') {
  const purchaseOrderId =
    payload.purchase_order_id && payload.purchase_order_id !== 'none'
      ? Number(payload.purchase_order_id)
      : null;
  const quantity = Number(payload.quantity || 0);
  const unitPrice = Number(payload.unit_price || 0);
  const totalAmount = quantity * unitPrice;
  const customerType = payload.customer_type === 'member' ? 'member' : 'walk_in';
  const memberId = customerType === 'member' && payload.member_id ? Number(payload.member_id) : null;
  const customerName = String(payload.member_name ?? '').trim() || (customerType === 'walk_in' ? '散客' : '');
  const customerPhone = String(payload.member_phone ?? '').trim();
  if (customerType === 'member' && !customerName) {
    throw new Error('请填写会员姓名');
  }
  const store = (
    await query(
      `
        SELECT id, company_id
        FROM company_stores
        WHERE id = $1 AND delete_status = '正常'
      `,
      [Number(payload.store_id)]
    )
  ).rows[0];
  if (!store || Number(store.company_id) !== Number(payload.company_id)) {
    throw new Error('门店只能在所属分公司下创建散客订单');
  }
  await query(
    `
      UPDATE member_orders
      SET
        company_id = $1,
        store_id = $2,
        status = $3,
        customer_type = $4,
        member_id = $5,
        sales_staff_name = $6,
        member_name = $7,
        member_phone = $8,
        total_amount = $9,
        purchase_order_id = $10,
        updated_by = $11,
        updated_at = $12
      WHERE id = $13
    `,
    [
      Number(payload.company_id),
      Number(payload.store_id),
      payload.status,
      customerType,
      memberId,
      payload.sales_staff_name,
      customerName,
      customerPhone,
      totalAmount,
      purchaseOrderId,
      actorName,
      now(),
      Number(id)
    ]
  );
  await query(
    `
      UPDATE member_order_items
      SET sku_id = $1, quantity = $2, unit_price = $3, point_rebate_base = $4, writeoff_status = $5
      WHERE member_order_id = $6
    `,
    [
      Number(payload.sku_id),
      quantity,
      unitPrice,
      totalAmount,
      payload.status === '已核销' ? '已核销' : payload.status,
      Number(id)
    ]
  );

  if (payload.status === '已核销') {
    await createWriteoffFromMemberOrder(id);
  }
  if (payload.status === '异常') {
    queueNotification(
      createCompanyNotification(payload.company_id, {
        type: 'walk_in_order_abnormal',
        title: '散客订单异常',
        body: `散客订单 #${id} 需要跟进处理`,
        actionLabel: '查看散客订单',
        actionUrl: `/dashboard/member-orders/${id}`,
        metadata: { memberOrderId: id, companyId: payload.company_id, storeId: payload.store_id }
      })
    );
  }
}

export async function approvePurchaseOrder(id, payload = {}, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT
          purchase_orders.id,
          purchase_orders.order_no,
          purchase_orders.company_id,
          purchase_orders.store_id,
          purchase_orders.status,
          purchase_orders.order_quota_total,
          purchase_orders.order_quota_deducted,
          purchase_orders.stock_received
        FROM purchase_orders
        INNER JOIN companies ON companies.id = purchase_orders.company_id
        LEFT JOIN company_stores ON company_stores.id = purchase_orders.store_id
        WHERE purchase_orders.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('订货单不存在');
  }
  assertCanAccessCompany(user, order.company_id);

  if (payload.result === '驳回') {
    await query(
      `
        UPDATE purchase_orders
        SET status = '已驳回', approval_status = '已驳回', updated_by = $1, updated_at = $2
        WHERE id = $3
      `,
      [actorName, now(), Number(id)]
    );
    await appendApprovalLog({
      entityType: 'purchase_order',
      entityId: id,
      action: '人工审核',
      result: '已驳回',
      note: payload.note ?? '人工驳回异常订货单',
      createdBy: actorName
    });
    queueNotification(
      createCompanyNotification(order.company_id, {
        type: 'purchase_order_rejected',
        title: '订货单已驳回',
        body: `${order.order_no} 已被总部驳回`,
        actionLabel: '查看订货单',
        actionUrl: `/dashboard/purchase-orders/${id}`,
        metadata: { purchaseOrderId: id, companyId: order.company_id }
      })
    );
    return;
  }

  if (!order.order_quota_deducted) {
    if (order.store_id) {
      throw new Error('管理后台不再处理门店订货单审核，请在 App 流程处理');
    }
    await changeCompanyOrderQuota(order.company_id, -toNumber(order.order_quota_total), '订货单审核通过扣减订货额', actorName);
  }

  let finalStatus = payload.final_status ?? '已入库';
  if (finalStatus !== '已入库' && finalStatus !== '待入库') {
    finalStatus = '已入库';
  }

  await query(
    `
      UPDATE purchase_orders
      SET status = $1, approval_status = '已通过', abnormal_flag = FALSE, order_quota_deducted = TRUE, updated_by = $2, updated_at = $3
      WHERE id = $4
    `,
    [finalStatus, actorName, now(), Number(id)]
  );

  if (finalStatus === '已入库' && !order.stock_received) {
    const items = (
      await query(
        `
          SELECT sku_id, quantity
          FROM purchase_order_items
          WHERE purchase_order_id = $1
          ORDER BY id ASC
        `,
        [Number(id)]
      )
    ).rows;
    for (const item of items) {
      await upsertInventory(order.company_id, item.sku_id, item.quantity, '订货入库', id, '审核通过后入库');
    }
    await query('UPDATE purchase_orders SET stock_received = TRUE, updated_by = $1, updated_at = $2 WHERE id = $3', [
      actorName,
      now(),
      Number(id)
    ]);
  }

  await appendApprovalLog({
    entityType: 'purchase_order',
    entityId: id,
    action: '人工审核',
    result: '已通过',
    note: payload.note ?? '总部审核通过',
    createdBy: actorName
  });
  queueNotification(
    createCompanyNotification(order.company_id, {
      type: finalStatus === '已入库' ? 'purchase_order_received' : 'purchase_order_approved',
      title: finalStatus === '已入库' ? '订货单已入库' : '订货单待入库',
      body: `${order.order_no} 已通过审核${finalStatus === '已入库' ? '并完成入库' : '，请确认收货入库'}`,
      actionLabel: '查看订货单',
      actionUrl: `/dashboard/purchase-orders/${id}`,
      metadata: { purchaseOrderId: id, companyId: order.company_id }
    })
  );
}

export async function approveOrderQuotaAdjustment(id, payload = {}, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  const adjustment = (
    await query(
      `
        SELECT id, company_id, adjustment_type, change_type, order_quota_amount, target_company_level, source_member_order_id, source_purchase_order_id, status
        FROM order_quota_adjustments
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!adjustment) {
    throw new Error('订货额调整记录不存在');
  }
  assertCanAccessCompany(user, adjustment.company_id);

  if (payload.result === '驳回') {
    await query(
      `
        UPDATE order_quota_adjustments
        SET status = '已驳回', updated_by = $1, updated_at = $2
        WHERE id = $3
      `,
      [actorName, now(), Number(id)]
    );
    await appendApprovalLog({
      entityType: 'order_quota_adjustment',
      entityId: id,
      action: '订货额审核',
      result: '已驳回',
      note: payload.note ?? '总部审核驳回订货额调整',
      createdBy: actorName
    });
    queueNotification(
      createCompanyNotification(adjustment.company_id, {
        type: 'order_quota_adjustment_rejected',
        title: '订货额调整已驳回',
        body: `${adjustment.adjustment_type} 申请已被总部驳回`,
        actionLabel: '查看分公司',
        actionUrl: `/dashboard/companies/${adjustment.company_id}`,
        metadata: { adjustmentId: id, companyId: adjustment.company_id }
      })
    );
    return;
  }

  if (adjustment.adjustment_type === '等级调整') {
    await query(
      `UPDATE companies SET company_level = $1, updated_by = $2, updated_at = $3 WHERE id = $4`,
      [adjustment.target_company_level, actorName, now(), Number(adjustment.company_id)]
    );
  }

  if (adjustment.adjustment_type === '退货回补' && adjustment.source_member_order_id) {
    await query(
      `UPDATE member_orders SET order_quota_returned = TRUE, updated_by = $1, updated_at = $2 WHERE id = $3`,
      [actorName, now(), Number(adjustment.source_member_order_id)]
    );
  }

  if (adjustment.adjustment_type === '退货回补' && adjustment.source_purchase_order_id) {
    await query(
      `UPDATE purchase_orders SET status = '已退货', updated_by = $1, updated_at = $2 WHERE id = $3`,
      [actorName, now(), Number(adjustment.source_purchase_order_id)]
    );
  }

  const delta =
    adjustment.adjustment_type === '等级调整'
      ? 0
      : adjustment.change_type === '减少'
        ? -toNumber(adjustment.order_quota_amount)
        : toNumber(adjustment.order_quota_amount);

  if (delta !== 0) {
    await changeCompanyOrderQuota(adjustment.company_id, delta, '订货额度调整审核通过', actorName);
  }
  await query(
    `
      UPDATE order_quota_adjustments
      SET status = '已通过', updated_by = $1, updated_at = $2
      WHERE id = $3
    `,
    [actorName, now(), Number(id)]
  );
  await appendApprovalLog({
    entityType: 'order_quota_adjustment',
    entityId: id,
    action: '订货额审核',
    result: '已通过',
    note: payload.note ?? '总部审核通过订货额调整',
    createdBy: actorName
  });
  await syncCompanyOrderQuota(adjustment.company_id);
  queueNotification(
    createCompanyNotification(adjustment.company_id, {
      type: 'order_quota_adjustment_approved',
      title: '订货额调整已通过',
      body: `${adjustment.adjustment_type} 申请已通过`,
      actionLabel: '查看分公司',
      actionUrl: `/dashboard/companies/${adjustment.company_id}`,
      metadata: { adjustmentId: id, companyId: adjustment.company_id }
    })
  );
}

export async function approveInventoryAdjustment(id, payload = {}, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  const adjustment = (
    await query(
      `
        SELECT id, company_id, sku_id, requested_quantity, reason, status
        FROM inventory_adjustments
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!adjustment) {
    throw new Error('库存调整记录不存在');
  }
  assertCanAccessCompany(user, adjustment.company_id);

  if (payload.result === '驳回') {
    await query(
      `
        UPDATE inventory_adjustments
        SET status = '已驳回', updated_by = $1, updated_at = $2
        WHERE id = $3
      `,
      [actorName, now(), Number(id)]
    );
    await appendApprovalLog({
      entityType: 'inventory_adjustment',
      entityId: id,
      action: '库存审核',
      result: '已驳回',
      note: payload.note ?? '总部审核驳回库存调整',
      createdBy: actorName
    });
    queueNotification(
      createCompanyNotification(adjustment.company_id, {
        type: 'inventory_adjustment_rejected',
        title: '库存调整已驳回',
        body: adjustment.reason,
        actionLabel: '查看库存',
        actionUrl: '/dashboard/inventory',
        metadata: { adjustmentId: id, companyId: adjustment.company_id, skuId: adjustment.sku_id }
      })
    );
    return;
  }

  const existing = (
    await query(
      'SELECT quantity FROM company_inventory WHERE company_id = $1 AND sku_id = $2',
      [Number(adjustment.company_id), Number(adjustment.sku_id)]
    )
  ).rows[0];
  const currentQuantity = toNumber(existing?.quantity);
  const delta = toNumber(adjustment.requested_quantity) - currentQuantity;
  await upsertInventory(
    adjustment.company_id,
    adjustment.sku_id,
    delta,
    '库存调整审核',
    id,
    adjustment.reason
  );
  await query(
    `
      UPDATE inventory_adjustments
      SET status = '已通过', updated_by = $1, updated_at = $2
      WHERE id = $3
    `,
    [actorName, now(), Number(id)]
  );
  await appendApprovalLog({
    entityType: 'inventory_adjustment',
    entityId: id,
    action: '库存审核',
    result: '已通过',
    note: payload.note ?? '总部审核通过库存调整',
    createdBy: actorName
  });
  queueNotification(
    createCompanyNotification(adjustment.company_id, {
      type: 'inventory_adjustment_approved',
      title: '库存调整已通过',
      body: adjustment.reason,
      actionLabel: '查看库存',
      actionUrl: '/dashboard/inventory',
      metadata: { adjustmentId: id, companyId: adjustment.company_id, skuId: adjustment.sku_id }
    })
  );
}

async function generateStoreCode(companyId, companyCode) {
  const parts = String(companyCode || '').split('-').filter(Boolean);
  const region = parts.length >= 3 ? parts.slice(1, -1).join('-') : String(companyCode || companyId);
  const prefix = `ST-${region || companyId}`;
  const rows = (
    await query(
      `
        SELECT code
        FROM company_stores
        WHERE company_id = $1 AND code LIKE $2
        ORDER BY code DESC
      `,
      [Number(companyId), `${prefix}-%`]
    )
  ).rows;
  const maxSequence = rows.reduce((max, row) => {
    const sequence = Number(String(row.code).slice(prefix.length + 1));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}-${String(maxSequence + 1).padStart(3, '0')}`;
}

export async function createCompanyStore(companyId, payload, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  assertCanAccessCompany(user, companyId);
  const managerName = String(payload.manager_name ?? '').trim();
  const managerPhone = String(payload.manager_phone ?? '').trim();
  if (!managerName) {
    throw new Error('请填写门店负责人姓名');
  }
  if (!/^1\d{10}$/.test(managerPhone)) {
    throw new Error('请填写 11 位门店负责人手机号');
  }

  const company = (
    await query(
      `
        SELECT id, code
        FROM companies
        WHERE id = $1 AND delete_status = '正常'
      `,
      [Number(companyId)]
    )
  ).rows[0];
  if (!company) {
    throw new Error('分公司不存在或已删除');
  }

  const existingStaff = (
    await query(
      `
        SELECT id
        FROM admin_staff
        WHERE account = $1 OR phone = $1
        LIMIT 1
      `,
      [managerPhone]
    )
  ).rows[0];
  if (existingStaff) {
    throw new Error('该手机号已存在后台员工账号，请更换负责人电话');
  }

  const appRole = (
    await query(`SELECT id FROM roles WHERE role_name = '门店 App 账号' LIMIT 1`)
  ).rows[0];
  if (!appRole) {
    throw new Error('门店 App 账号角色未初始化');
  }

  const timestamp = now();
  const defaultStoreQuota = await getDefaultStoreOrderQuota();
  const storeCode = await generateStoreCode(companyId, company.code);
  const initialPassword = generateAccountPassword();
  const hashedPassword = await hashPassword(initialPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const staffResult = await client.query(
      `
        INSERT INTO admin_staff
          (name, account, password, department, role_id, company_id, status, phone, email, login_scope, last_login, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, '在职', $7, $8, 'app', '', $9, $10, $11)
        RETURNING id
      `,
      [
        managerName,
        managerPhone,
        hashedPassword,
        '门店',
        appRole.id,
        Number(companyId),
        managerPhone,
        `${managerPhone}@store.miliguan.local`,
        actorName,
        timestamp,
        timestamp
      ]
    );
    const managerStaffId = staffResult.rows[0].id;
    const result = await client.query(
      `
        INSERT INTO company_stores
          (company_id, name, code, address, manager_staff_id, manager_name, manager_phone, available_order_quota, total_order_quota, status, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `,
      [
        Number(companyId),
        payload.name,
        storeCode,
        payload.address,
        managerStaffId,
        managerName,
        managerPhone,
        defaultStoreQuota,
        defaultStoreQuota,
        payload.status,
        actorName,
        timestamp,
        timestamp
      ]
    );
    await client.query(
      `
        UPDATE admin_staff
        SET store_id = $1, updated_by = $2, updated_at = $3
        WHERE id = $4
      `,
      [Number(result.rows[0].id), actorName, now(), managerStaffId]
    );
    await client.query('COMMIT');

    // 验证码登录：不再下发密码短信，门店负责人用手机号 + 验证码登录。
    await appendApprovalLog({
      entityType: 'company_store',
      entityId: result.rows[0].id,
      action: '新增门店',
      result: '已创建',
      note: `自动创建门店 App 负责人账号 ${managerPhone}，负责人可使用该手机号 + 短信验证码登录`,
      createdBy: actorName
    });
    return {
      id: result.rows[0].id,
      message: `门店创建成功，负责人账号已自动创建，可使用手机号 ${managerPhone} + 短信验证码登录`
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createOrderQuotaAdjustment(payload, user = {}) {
  await initializeDatabase();
  assertCanAccessCompany(user, payload.company_id);
  const company = await getCompanyById(payload.company_id);
  if (!company) {
    throw new Error('分公司不存在');
  }
  const adjustmentType = payload.adjustment_type ?? '临时额度调整';
  let orderQuotaAmount = Number(payload.order_quota_amount || 0);
  const targetCompanyLevel = payload.target_company_level ?? '';
  const sourceMemberOrderId = null;
  const sourcePurchaseOrderId = null;

  if (adjustmentType === '临时额度调整') {
    if (!(orderQuotaAmount > 0)) {
      throw new Error('临时额度调整的订货额度必须大于 0');
    }
    if (!payload.expires_at) {
      throw new Error('请设置回调日期');
    }
  }

  if (adjustmentType === '等级调整') {
    if (!targetCompanyLevel) {
      throw new Error('请选择目标分公司等级');
    }
    orderQuotaAmount = 0;
  }

  if (adjustmentType === '退货回补') {
    throw new Error('退货回补仅能通过会员订单或订货单完成退货时自动触发');
  }

  if (!String(payload.reason ?? '').trim()) {
    throw new Error('请填写订货额调整原因');
  }
  const result = await query(
    `
      INSERT INTO order_quota_adjustments
        (company_id, adjustment_type, change_type, order_quota_amount, reason, expires_at, target_company_level, source_member_order_id, source_purchase_order_id, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `,
    [
      Number(payload.company_id),
      adjustmentType,
      payload.change_type,
      orderQuotaAmount,
      payload.reason,
      payload.expires_at ? new Date(payload.expires_at).toISOString() : null,
      targetCompanyLevel,
      sourceMemberOrderId,
      sourcePurchaseOrderId,
      payload.status ?? '待审核',
      payload.created_by ?? '后台用户',
      now(),
      now()
    ]
  );
  await appendApprovalLog({
    entityType: 'order_quota_adjustment',
    entityId: result.rows[0].id,
    action: '订货额调整申请',
    result: payload.status ?? '待审核',
    note: payload.reason,
    createdBy: payload.created_by ?? '后台用户'
  });
  if ((payload.status ?? '待审核') === '待审核') {
    queueNotification(
      createPermissionNotification('order-quota:approve', {
        type: 'order_quota_adjustment_pending',
        title: '订货额调整待审核',
        body: `${adjustmentType}：${payload.reason}`,
        actionLabel: '查看订货额审核',
        actionUrl: '/dashboard/order-quota-approvals',
        metadata: { adjustmentId: result.rows[0].id, companyId: payload.company_id, adjustmentType }
      })
    );
  }
  return result.rows[0].id;
}

export async function createInventoryAdjustment(payload, user = {}) {
  await initializeDatabase();
  assertCanAccessCompany(user, payload.company_id);
  const company = await getCompanyById(payload.company_id);
  if (!company) {
    throw new Error('分公司不存在');
  }
  const sku = await getSkuById(payload.sku_id);
  if (!sku) {
    throw new Error('SKU 不存在');
  }
  const requestedQuantity = Number(payload.requested_quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 0) {
    throw new Error('申请库存必须为非负整数');
  }
  if (!String(payload.reason ?? '').trim()) {
    throw new Error('请填写库存调整原因');
  }

  const result = await query(
    `
      INSERT INTO inventory_adjustments
        (company_id, sku_id, requested_quantity, reason, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      Number(payload.company_id),
      Number(payload.sku_id),
      requestedQuantity,
      payload.reason,
      payload.status ?? '待审核',
      payload.created_by ?? '后台用户',
      now(),
      now()
    ]
  );

  await appendApprovalLog({
    entityType: 'inventory_adjustment',
    entityId: result.rows[0].id,
    action: '库存调整申请',
    result: payload.status ?? '待审核',
    note: payload.reason,
    createdBy: payload.created_by ?? '后台用户'
  });
  if ((payload.status ?? '待审核') === '待审核') {
    queueNotification(
      createPermissionNotification('inventory:approve', {
        type: 'inventory_adjustment_pending',
        title: '库存调整待审核',
        body: `${company.name} 提交库存调整：${payload.reason}`,
        actionLabel: '查看库存审核',
        actionUrl: '/dashboard/inventory-approvals',
        metadata: { adjustmentId: result.rows[0].id, companyId: payload.company_id, skuId: payload.sku_id }
      })
    );
  }

  return result.rows[0].id;
}

export async function getReportsData({
  companyRankingPage = 1,
  orderQuotaRankingPage = 1,
  salesTrendPage = 1,
  writeoffTrendPage = 1,
  lowInventoryPage = 1,
  pageSize = 10
} = {}) {
  await initializeDatabase();
  const summary = {
    totalSales: await getCount('SELECT COALESCE(SUM(total_amount), 0)::int AS count FROM member_orders'),
    totalWriteoffs: await getCount(`SELECT COUNT(*)::int AS count FROM writeoff_records WHERE status = '成功'`),
    totalOrderQuotaUsed: await getCount('SELECT COALESCE(SUM(order_quota_total), 0)::int AS count FROM purchase_orders'),
    totalInventory: await getCount('SELECT COALESCE(SUM(quantity), 0)::int AS count FROM company_inventory')
  };

  const companyRanking = await executePaginatedQuery({
    sql: `
      SELECT
        companies.name AS company_name,
        COALESCE(SUM(member_orders.total_amount), 0) AS total_sales,
        COUNT(writeoff_records.id)::int AS writeoff_count,
        (companies.total_order_quota - companies.available_order_quota) AS order_quota_spent
      FROM companies
      LEFT JOIN member_orders ON member_orders.company_id = companies.id
      LEFT JOIN writeoff_records ON writeoff_records.member_order_id = member_orders.id
      GROUP BY companies.id
      ORDER BY total_sales DESC
    `,
    page: companyRankingPage,
    pageSize,
    mapRow: (row) => ({
      company_name: row.company_name,
      total_sales: toNumber(row.total_sales),
      writeoff_count: toNumber(row.writeoff_count),
      order_quota_spent: toNumber(row.order_quota_spent)
    })
  });

  const salesTrend = await executePaginatedQuery({
    sql: `
      SELECT to_char(created_at, 'MM-DD') AS period, COALESCE(SUM(total_amount), 0) AS amount
      FROM member_orders
      GROUP BY to_char(created_at, 'MM-DD')
      ORDER BY MIN(created_at) ASC
    `,
    page: salesTrendPage,
    pageSize,
    mapRow: (row) => ({
      period: row.period,
      amount: toNumber(row.amount)
    })
  });

  const writeoffTrend = await executePaginatedQuery({
    sql: `
      SELECT substr(writeoff_time, 6, 5) AS period, COUNT(*)::int AS count
      FROM writeoff_records
      GROUP BY substr(writeoff_time, 6, 5)
      ORDER BY MIN(writeoff_time) ASC
    `,
    page: writeoffTrendPage,
    pageSize,
    mapRow: (row) => ({
      period: row.period,
      count: toNumber(row.count)
    })
  });

  const orderQuotaRanking = await executePaginatedQuery({
    sql: `
      SELECT name AS company_name, total_order_quota, available_order_quota
      FROM companies
      ORDER BY total_order_quota DESC
    `,
    page: orderQuotaRankingPage,
    pageSize,
    mapRow: (row) => ({
      company_name: row.company_name,
      total_order_quota: toNumber(row.total_order_quota),
      available_order_quota: toNumber(row.available_order_quota)
    })
  });

  const pendingApprovals = {
    orderQuotaAdjustments: await getCount(`SELECT COUNT(*)::int AS count FROM order_quota_adjustments WHERE status = '待审核'`),
    inventoryAdjustments: await getCount(`SELECT COUNT(*)::int AS count FROM inventory_adjustments WHERE status = '待审核'`),
    purchaseOrders: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE approval_status = '待审核'`)
  };

  const lowInventory = await executePaginatedQuery({
    sql: `
      SELECT
        companies.name AS company_name,
        products.name AS product_name,
        product_skus.sku_code,
        company_inventory.quantity,
        company_inventory.safety_stock
      FROM company_inventory
      INNER JOIN companies ON companies.id = company_inventory.company_id
      INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE company_inventory.quantity <= company_inventory.safety_stock
      ORDER BY company_inventory.quantity ASC
    `,
    page: lowInventoryPage,
    pageSize,
    mapRow: (row) => ({
      company_name: row.company_name,
      product_name: row.product_name,
      sku_code: row.sku_code,
      quantity: toNumber(row.quantity),
      safety_stock: toNumber(row.safety_stock)
    })
  });

  return {
    summary,
    companyRanking,
    salesTrend,
    writeoffTrend,
    orderQuotaRanking,
    pendingApprovals,
    lowInventory
  };
}

export async function getProductDetail(id, { skusPage = 1, inventoryPage = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  const product = (
    await query(
      `
        SELECT id, spu_code, name, brand, category, scenario, description, image_url, status, delete_status
        FROM products
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!product) return null;

  const skus = await executePaginatedQuery({
    sql: `
      SELECT
        product_skus.id,
        product_skus.name,
        product_skus.sku_code,
        product_skus.spec,
        product_skus.packaging,
        product_skus.unit,
        product_skus.barcode,
        product_skus.qr_code,
        product_skus.image_url,
        product_skus.order_quota_price,
        product_skus.redeem_points_price,
        product_skus.sale_price,
        product_skus.status,
        product_skus.delete_status
      FROM product_skus
      WHERE product_skus.product_id = $1
      ORDER BY product_skus.id ASC
    `,
    params: [Number(id)],
    page: skusPage,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      name: row.name,
      sku_code: row.sku_code,
      spec: row.spec,
      packaging: row.packaging,
      unit: row.unit,
      barcode: row.barcode,
      qr_code: row.qr_code,
      image_url: row.image_url,
      order_quota_price: toNumber(row.order_quota_price),
      redeem_points_price: toNumber(row.redeem_points_price),
      sale_price: toNumber(row.sale_price),
      status: row.status,
      delete_status: row.delete_status
    })
  });

  const inventory = await executePaginatedQuery({
    sql: `
      SELECT
        companies.name AS company_name,
        product_skus.sku_code,
        company_inventory.quantity,
        company_inventory.status,
        company_inventory.delete_status
      FROM company_inventory
      INNER JOIN companies ON companies.id = company_inventory.company_id
      INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
      WHERE product_skus.product_id = $1
      ORDER BY company_inventory.updated_at DESC, company_inventory.id DESC
    `,
    params: [Number(id)],
    page: inventoryPage,
    pageSize,
    mapRow: (row) => ({
      company_name: row.company_name,
      sku_code: row.sku_code,
      quantity: toNumber(row.quantity),
      status: row.status,
      delete_status: row.delete_status
    })
  });

  return {
    id: String(product.id),
    spu_code: product.spu_code,
    name: product.name,
    brand: product.brand,
    category: product.category,
    scenario: product.scenario,
    description: product.description,
    image_url: product.image_url,
    status: product.status,
    delete_status: product.delete_status,
    skus,
    inventory
  };
}

export async function listProductSkus(productId, { page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  await getProductById(productId);
  return executePaginatedQuery({
    sql: `
      SELECT
        product_skus.id,
        product_skus.name,
        product_skus.sku_code,
        product_skus.spec,
        product_skus.packaging,
        product_skus.unit,
        product_skus.barcode,
        product_skus.qr_code,
        product_skus.image_url,
        product_skus.order_quota_price,
        product_skus.redeem_points_price,
        product_skus.sale_price,
        product_skus.status,
        product_skus.delete_status
      FROM product_skus
      WHERE product_skus.product_id = $1
      ORDER BY product_skus.id ASC
    `,
    params: [Number(productId)],
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      name: row.name,
      sku_code: row.sku_code,
      spec: row.spec,
      packaging: row.packaging,
      unit: row.unit,
      barcode: row.barcode,
      qr_code: row.qr_code,
      image_url: row.image_url,
      order_quota_price: toNumber(row.order_quota_price),
      redeem_points_price: toNumber(row.redeem_points_price),
      sale_price: toNumber(row.sale_price),
      status: row.status,
      delete_status: row.delete_status
    })
  });
}

export async function getSkuDetail(
  productId,
  skuId,
  {
    inventoryPage = 1,
    recentUsagePage = 1,
    writeoffsPage = 1,
    requestsPage = 1,
    pageSize = 10
  } = {}
) {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);

  const sku = await getSkuRecordById(skuId);
  if (!sku) return null;

  const inventory = await executePaginatedQuery({
    sql: `
      SELECT
        companies.name AS company_name,
        company_inventory.quantity,
        company_inventory.safety_stock,
        company_inventory.status
      FROM company_inventory
      INNER JOIN companies ON companies.id = company_inventory.company_id
      WHERE company_inventory.sku_id = $1
      ORDER BY company_inventory.quantity DESC, company_inventory.id ASC
    `,
    params: [Number(skuId)],
    page: inventoryPage,
    pageSize,
    mapRow: (row) => ({
      company_name: row.company_name,
      quantity: toNumber(row.quantity),
      safety_stock: toNumber(row.safety_stock),
      status: row.status
    })
  });

  const recentUsage = await executePaginatedQuery({
    sql: `
      SELECT
        '订货单' AS source_type,
        purchase_orders.order_no AS source_no,
        purchase_order_items.quantity,
        purchase_orders.created_at
      FROM purchase_order_items
      INNER JOIN purchase_orders ON purchase_orders.id = purchase_order_items.purchase_order_id
      WHERE purchase_order_items.sku_id = $1
      UNION ALL
      SELECT
        '会员订单' AS source_type,
        member_orders.order_no AS source_no,
        member_order_items.quantity,
        member_orders.created_at
      FROM member_order_items
      INNER JOIN member_orders ON member_orders.id = member_order_items.member_order_id
      WHERE member_order_items.sku_id = $1
      ORDER BY created_at DESC
    `,
    params: [Number(skuId)],
    page: recentUsagePage,
    pageSize,
    mapRow: (row) => ({
      source_type: row.source_type,
      source_no: row.source_no,
      quantity: toNumber(row.quantity),
      created_at: row.created_at
    })
  });

  const writeoffs = await executePaginatedQuery({
    sql: `
      SELECT status, product_code, sales_staff_name, writeoff_time, remark
      FROM writeoff_records
      WHERE sku_id = $1
      ORDER BY writeoff_time DESC
    `,
    params: [Number(skuId)],
    page: writeoffsPage,
    pageSize,
    mapRow: (row) => ({
      status: row.status,
      product_code: row.product_code,
      sales_staff_name: row.sales_staff_name,
      writeoff_time: row.writeoff_time,
      remark: row.remark
    })
  });

  const pendingRequests = await executePaginatedQuery({
    sql: `
      SELECT id, action, status, created_by, created_at
      FROM product_change_requests
      WHERE entity_type = 'sku' AND entity_id = $1
      ORDER BY updated_at DESC, id DESC
    `,
    params: [Number(skuId)],
    page: requestsPage,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      action: productChangeActionLabel(row.action),
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at
    })
  });

  return {
    id: String(sku.id),
    product_id: String(sku.product_id),
    product_name: sku.product_name,
    spu_code: sku.spu_code,
    name: sku.name,
    sku_code: sku.sku_code,
    spec: sku.spec,
    packaging: sku.packaging,
    unit: sku.unit,
    barcode: sku.barcode,
    qr_code: sku.qr_code,
    image_url: sku.image_url,
    order_quota_price: toNumber(sku.order_quota_price),
    redeem_points_price: toNumber(sku.redeem_points_price),
    sale_price: toNumber(sku.sale_price),
    status: sku.status,
    delete_status: sku.delete_status,
    inventory,
    recentUsage,
    writeoffs,
    pendingRequests
  };
}

export async function getCompanyDetail(
  id,
  {
    storesPage = 1,
    adjustmentsPage = 1,
    inventoryPage = 1,
    purchaseOrdersPage = 1,
    memberOrdersPage = 1,
    pageSize = 10
  } = {},
  user = {}
) {
  await initializeDatabase();
  assertCanAccessCompany(user, id);
  await syncCompanyOrderQuota(id);
  const company = (
    await query(
      `
        SELECT id, name, code, company_level, manager_name, contact_phone, status, available_order_quota, total_order_quota, notes, delete_status
        FROM companies
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!company) return null;

  const stores = await listCompanyStoresByCompany(id, { page: storesPage, pageSize, user });
  const orderQuotaAdjustments = await listOrderQuotaAdjustments({ companyId: id, page: adjustmentsPage, pageSize, user });
  const inventory = await listInventoryForCompany(id, { page: inventoryPage, pageSize });
  const purchaseOrders = await listPurchaseOrdersByCompany(id, { page: purchaseOrdersPage, pageSize });
  const memberOrders = await listMemberOrdersByCompany(id, { page: memberOrdersPage, pageSize });
  const inventorySummary = (
    await query(
      `
        SELECT
          COALESCE(SUM(company_inventory.quantity), 0)::int AS quantity_total,
          COALESCE(SUM(company_inventory.quantity * product_skus.order_quota_price), 0) AS amount_total
        FROM company_inventory
        INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
        WHERE company_inventory.company_id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  return {
    id: String(company.id),
    name: company.name,
    code: company.code,
    company_level: company.company_level,
    manager_name: company.manager_name,
    contact_phone: company.contact_phone,
    status: company.status,
    available_order_quota: toNumber(company.available_order_quota),
    total_order_quota: toNumber(company.total_order_quota),
    used_order_quota: toNumber(company.total_order_quota) - toNumber(company.available_order_quota),
    inventory_quantity_total: toNumber(inventorySummary?.quantity_total),
    inventory_amount_total: toNumber(inventorySummary?.amount_total),
    notes: company.notes,
    delete_status: company.delete_status,
    stores,
    orderQuotaAdjustments,
    inventory,
    purchaseOrders,
    memberOrders
  };
}

export async function listInventoryForCompany(companyId, { page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  return executePaginatedQuery({
    sql: `
      SELECT
        company_inventory.id,
        products.name AS product_name,
        product_skus.sku_code,
        product_skus.spec,
        company_inventory.quantity,
        company_inventory.safety_stock,
        company_inventory.status
      FROM company_inventory
      INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE company_inventory.company_id = $1
      ORDER BY company_inventory.updated_at DESC, company_inventory.id DESC
    `,
    params: [Number(companyId)],
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      product_name: row.product_name,
      sku_code: row.sku_code,
      spec: row.spec,
      quantity: toNumber(row.quantity),
      safety_stock: toNumber(row.safety_stock),
      status: row.status
    })
  });
}

export async function getPurchaseOrderDetail(id, { itemsPage = 1, approvalsPage = 1, pageSize = 10 } = {}, user = {}) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT
          purchase_orders.id,
          purchase_orders.order_no,
          purchase_orders.status,
          purchase_orders.order_quota_total,
          purchase_orders.remark,
          purchase_orders.abnormal_flag,
          purchase_orders.approval_status,
          purchase_orders.order_quota_deducted,
          purchase_orders.stock_received,
          purchase_orders.updated_at,
          purchase_orders.created_at,
          purchase_orders.delete_status,
          purchase_orders.company_id,
          companies.name AS company_name,
          companies.code AS company_code,
          company_stores.name AS store_name
        FROM purchase_orders
        INNER JOIN companies ON companies.id = purchase_orders.company_id
        LEFT JOIN company_stores ON company_stores.id = purchase_orders.store_id
        WHERE purchase_orders.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!order) return null;
  assertCanAccessCompany(user, order.company_id);

  const items = await executePaginatedQuery({
    sql: `
      SELECT
        purchase_order_items.id,
        products.name AS product_name,
        product_skus.sku_code,
        product_skus.spec,
        purchase_order_items.quantity,
        purchase_order_items.order_quota_unit_price,
        purchase_order_items.subtotal_order_quota
      FROM purchase_order_items
      INNER JOIN product_skus ON product_skus.id = purchase_order_items.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE purchase_order_items.purchase_order_id = $1
    `,
    params: [Number(id)],
    page: itemsPage,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      product_name: row.product_name,
      sku_code: row.sku_code,
      spec: row.spec,
      quantity: toNumber(row.quantity),
      order_quota_unit_price: toNumber(row.order_quota_unit_price),
      subtotal_order_quota: toNumber(row.subtotal_order_quota)
    })
  });

  const approvals = await executePaginatedQuery({
    sql: `
      SELECT action, result, note, created_by, created_at
      FROM approval_logs
      WHERE entity_type = 'purchase_order' AND entity_id = $1
      ORDER BY id DESC
    `,
    params: [String(id)],
    page: approvalsPage,
    pageSize,
    mapRow: (row) => ({
      action: row.action,
      result: row.result,
      note: row.note,
      created_by: row.created_by,
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });

  return {
    id: String(order.id),
    order_no: order.order_no,
    company_name: order.company_name,
    company_code: order.company_code,
    store_name: order.store_name ?? '',
    status: order.status,
    order_quota_total: toNumber(order.order_quota_total),
    remark: order.remark,
    abnormal_flag: boolValue(order.abnormal_flag),
    approval_status: order.approval_status,
    order_quota_deducted: boolValue(order.order_quota_deducted),
    stock_received: boolValue(order.stock_received),
    updated_at: new Date(order.updated_at).toLocaleString('zh-CN', { hour12: false }),
    delete_status: order.delete_status,
    created_at: new Date(order.created_at).toLocaleString('zh-CN', { hour12: false }),
    items,
    approvals
  };
}

export async function getMemberOrderDetail(id, { itemsPage = 1, writeoffsPage = 1, logsPage = 1, pageSize = 10 } = {}, user = {}) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT
          member_orders.id,
          member_orders.order_no,
          member_orders.status,
          member_orders.customer_type,
          member_orders.sales_staff_name,
          member_orders.member_name,
          member_orders.member_phone,
          member_orders.total_amount,
          member_orders.stock_deducted,
          member_orders.order_quota_returned,
          member_orders.updated_at,
          member_orders.created_at,
          member_orders.delete_status,
          member_orders.company_id,
          companies.name AS company_name,
          company_stores.name AS store_name,
          purchase_orders.order_no AS purchase_order_no
        FROM member_orders
        INNER JOIN companies ON companies.id = member_orders.company_id
        INNER JOIN company_stores ON company_stores.id = member_orders.store_id
        LEFT JOIN purchase_orders ON purchase_orders.id = member_orders.purchase_order_id
        WHERE member_orders.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!order) return null;
  assertCanAccessCompany(user, order.company_id);

  const items = await executePaginatedQuery({
    sql: `
      SELECT
        member_order_items.id,
        products.name AS product_name,
        product_skus.sku_code,
        product_skus.spec,
        member_order_items.quantity,
        member_order_items.unit_price,
        member_order_items.point_rebate_base,
        member_order_items.writeoff_status
      FROM member_order_items
      INNER JOIN product_skus ON product_skus.id = member_order_items.sku_id
      INNER JOIN products ON products.id = product_skus.product_id
      WHERE member_order_items.member_order_id = $1
    `,
    params: [Number(id)],
    page: itemsPage,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      product_name: row.product_name,
      sku_code: row.sku_code,
      spec: row.spec,
      quantity: toNumber(row.quantity),
      unit_price: toNumber(row.unit_price),
      point_rebate_base: toNumber(row.point_rebate_base),
      writeoff_status: row.writeoff_status
    })
  });

  const writeoffs = await listWriteoffRecords({ memberOrderId: id, page: writeoffsPage, pageSize });
  const logs = await executePaginatedQuery({
    sql: `
      SELECT action, result, note, created_by, created_at
      FROM approval_logs
      WHERE entity_type = 'member_order' AND entity_id = $1
      ORDER BY id DESC
    `,
    params: [String(id)],
    page: logsPage,
    pageSize,
    mapRow: (row) => ({
      action: row.action,
      result: row.result,
      note: row.note,
      created_by: row.created_by,
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });

  return {
    id: String(order.id),
    order_no: order.order_no,
    company_name: order.company_name,
    store_name: order.store_name,
    status: order.status,
    customer_type: order.customer_type === 'member' ? '会员' : '散客',
    sales_staff_name: order.sales_staff_name,
    member_name: order.customer_type === 'member' ? order.member_name : (order.member_name || '散客'),
    member_phone: order.member_phone,
    total_amount: toNumber(order.total_amount),
    stock_deducted: boolValue(order.stock_deducted),
    order_quota_returned: boolValue(order.order_quota_returned),
    purchase_order_no: order.purchase_order_no,
    updated_at: new Date(order.updated_at).toLocaleString('zh-CN', { hour12: false }),
    delete_status: order.delete_status,
    created_at: new Date(order.created_at).toLocaleString('zh-CN', { hour12: false }),
    items,
    writeoffs,
    logs
  };
}

export async function handleMemberOrder(id, payload = {}, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT id, order_no, company_id, status, stock_deducted
        FROM member_orders
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('散客订单不存在');
  }
  assertCanAccessCompany(user, order.company_id);

  if (payload.action === 'writeoff') {
    await createWriteoffFromMemberOrder(id);
    await appendApprovalLog({
      entityType: 'member_order',
      entityId: id,
      action: '人工核销',
      result: '已核销',
      note: payload.note ?? '后台人工确认核销并扣减库存',
      createdBy: actorName
    });
    queueNotification(
      createCompanyNotification(order.company_id, {
        type: 'walk_in_order_writeoff_completed',
        title: '散客订单核销完成',
        body: `${order.order_no ?? `散客订单 #${id}`} 已人工核销完成`,
        actionLabel: '查看散客订单',
        actionUrl: `/dashboard/member-orders/${id}`,
        metadata: { memberOrderId: id, companyId: order.company_id }
      })
    );
    return;
  }

  if (payload.action === 'resolve') {
    await query(
      `
        UPDATE member_orders
        SET status = '已处理', updated_by = $1, updated_at = $2
        WHERE id = $3
      `,
      [actorName, now(), Number(id)]
    );
    await query(
      `
        UPDATE member_order_items
        SET writeoff_status = '已处理'
        WHERE member_order_id = $1
      `,
      [Number(id)]
    );
    await appendApprovalLog({
      entityType: 'member_order',
      entityId: id,
      action: '异常处理',
      result: '已处理',
      note: payload.note ?? '后台人工处理异常散客订单',
      createdBy: actorName
    });
    queueNotification(
      createCompanyNotification(order.company_id, {
        type: 'walk_in_order_resolved',
        title: '散客订单异常已处理',
        body: `${order.order_no ?? `散客订单 #${id}`} 已处理完成`,
        actionLabel: '查看散客订单',
        actionUrl: `/dashboard/member-orders/${id}`,
        metadata: { memberOrderId: id, companyId: order.company_id }
      })
    );
    return;
  }

  if (payload.action === 'refund') {
    await refundMemberOrder(id, payload.note, actorName);
    return;
  }

  throw new Error('不支持的散客订单处理动作');
}

export async function handlePurchaseOrderRefund(id, payload = {}, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  const order = (await query('SELECT company_id FROM purchase_orders WHERE id = $1', [Number(id)])).rows[0];
  if (!order) throw new Error('订货单不存在');
  assertCanAccessCompany(user, order.company_id);
  await refundPurchaseOrder(id, payload.note, actorName);
}

export async function handlePurchaseOrderReceive(id, payload = {}, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  const order = (await query('SELECT company_id FROM purchase_orders WHERE id = $1', [Number(id)])).rows[0];
  if (!order) throw new Error('订货单不存在');
  assertCanAccessCompany(user, order.company_id);
  await approvePurchaseOrder(id, {
    result: '通过',
    note: payload.note ?? '分公司确认收货，库存正式入库',
    final_status: '已入库'
  }, actorName, user);
}

export async function submitProductCreateRequest(payload, actorName) {
  await initializeDatabase();
  await assertCategoryExists(payload.category);
  return createProductChangeRequest({
    entityType: 'product',
    action: 'create',
    payload,
    createdBy: actorName
  });
}

export async function submitProductUpdateRequest(id, payload, actorName) {
  await initializeDatabase();
  const existing = await getProductById(id);
  if (!existing) {
    throw new Error('商品不存在');
  }
  await assertCategoryExists(payload.category);
  return createProductChangeRequest({
    entityType: 'product',
    entityId: id,
    productId: id,
    action: 'update',
    payload,
    createdBy: actorName
  });
}

export async function submitProductDeleteRequest(id, actorName) {
  await initializeDatabase();
  const existing = await getProductById(id);
  if (!existing) {
    throw new Error('商品不存在');
  }
  await assertProductDeletable(id);
  return insertDeleteRequest({
    entityType: 'products',
    entityId: id,
    summary: buildDeleteSummary('products', existing),
    createdBy: actorName,
    requestNote: '提交商品删除申请'
  });
}

export async function submitProductSkuCreateRequest(productId, payload, actorName) {
  await initializeDatabase();
  const product = await getProductById(productId);
  if (!product) {
    throw new Error('商品不存在，无法新增 SKU');
  }
  validateSkuPayload(payload);
  return createProductChangeRequest({
    entityType: 'sku',
    productId,
    action: 'create',
    payload: {
      ...payload,
      product_name: product.name,
      spu_code: product.spu_code
    },
    createdBy: actorName
  });
}

export async function submitProductSkuUpdateRequest(productId, skuId, payload, actorName) {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);
  const existingSku = await getSkuRecordById(skuId);
  if (!existingSku) {
    throw new Error('SKU 不存在');
  }
  validateSkuPayload(payload);
  return createProductChangeRequest({
    entityType: 'sku',
    entityId: skuId,
    productId,
    action: 'update',
    payload: {
      ...payload,
      image_url: payload.image_url ?? existingSku.image_url ?? '',
      product_name: existingSku.product_name,
      spu_code: existingSku.spu_code
    },
    createdBy: actorName
  });
}

export async function submitProductSkuImageUpdateRequest(productId, skuId, imageUrl, actorName) {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);
  const existingSku = await getSkuRecordById(skuId);
  if (!existingSku) {
    throw new Error('SKU 不存在');
  }

  return createProductChangeRequest({
    entityType: 'sku',
    entityId: skuId,
    productId,
    action: 'update',
    payload: {
      name: existingSku.name,
      sku_code: existingSku.sku_code,
      spec: existingSku.spec,
      packaging: existingSku.packaging,
      unit: existingSku.unit,
      barcode: existingSku.barcode,
      qr_code: existingSku.qr_code,
      image_url: imageUrl,
      order_quota_price: toNumber(existingSku.order_quota_price),
      redeem_points_price: toNumber(existingSku.redeem_points_price),
      sale_price: toNumber(existingSku.sale_price),
      status: existingSku.status,
      product_name: existingSku.product_name,
      spu_code: existingSku.spu_code
    },
    requestNote: `更新 SKU 图片：${existingSku.sku_code}`,
    createdBy: actorName
  });
}

export async function submitProductSkuDeleteRequest(productId, skuId, actorName) {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);
  await assertSkuDeletable(skuId);
  const existingSku = await getSkuRecordById(skuId);
  if (!existingSku) {
    throw new Error('SKU 不存在');
  }
  return insertDeleteRequest({
    entityType: 'product-skus',
    entityId: skuId,
    summary: buildDeleteSummary('product-skus', existingSku),
    createdBy: actorName,
    requestNote: '提交 SKU 删除申请'
  });
}

export async function approveProductChangeRequest(id, payload, actorName) {
  await initializeDatabase();
  const requestRow = (
    await query(
      `
        SELECT *
        FROM product_change_requests
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!requestRow) {
    throw new Error('商品审核记录不存在');
  }

  if (requestRow.status !== '待审核') {
    throw new Error('该商品审核记录已处理');
  }

  const decision = payload.result === '驳回' ? '已驳回' : '已通过';
  const note = payload.note ?? '';
  const requestPayload = requestRow.payload ?? {};

  if (decision === '已通过') {
      if (requestRow.entity_type === 'product') {
        if (requestRow.action === 'create') {
        const createdId = await createProductRecordInternal(requestPayload, actorName);
        await query(
          'UPDATE product_change_requests SET entity_id = $1, product_id = $1 WHERE id = $2',
          [Number(createdId), Number(id)]
        );
      } else if (requestRow.action === 'update') {
        await updateProductRecord(requestRow.entity_id, requestPayload, actorName);
      } else if (requestRow.action === 'delete') {
        await query('UPDATE product_change_requests SET product_id = NULL WHERE id = $1', [Number(id)]);
        await deleteProductRecordInternal(requestRow.entity_id, actorName);
      }
    } else if (requestRow.entity_type === 'sku') {
      if (requestRow.action === 'create') {
        const createdSkuId = await createProductSkuInternal(requestRow.product_id, requestPayload, actorName);
        await query(
          'UPDATE product_change_requests SET entity_id = $1 WHERE id = $2',
          [Number(createdSkuId), Number(id)]
        );
      } else if (requestRow.action === 'update') {
        await updateProductSku(requestRow.product_id, requestRow.entity_id, requestPayload, actorName);
      } else if (requestRow.action === 'delete') {
        await deleteProductSkuInternal(requestRow.product_id, requestRow.entity_id, actorName);
      }
    } else {
      throw new Error('不支持的商品变更类型');
    }
  }

  await query(
    `
      UPDATE product_change_requests
      SET status = $1, approved_by = $2, approved_note = $3, approved_at = $4, updated_by = $2, updated_at = $4
      WHERE id = $5
    `,
    [decision, actorName, note, now(), Number(id)]
  );

  await appendApprovalLog({
    entityType: `product_request:${requestRow.entity_type}`,
    entityId: id,
    action: `${productChangeEntityLabel(requestRow.entity_type)}${productChangeActionLabel(requestRow.action)}审核`,
    result: decision,
    note,
    createdBy: actorName
  });
}

export async function listDeleteRequests({ page = 1, pageSize = 10 } = {}) {
  await initializeDatabase();
  return executePaginatedQuery({
    sql: `
      SELECT id, entity_type, entity_id, summary, status, request_note, created_by, approved_by, approved_note, approved_at, created_at
      FROM delete_requests
      ORDER BY
        CASE WHEN status = '待审核' THEN 0 ELSE 1 END,
        updated_at DESC,
        id DESC
    `,
    page,
    pageSize,
    mapRow: (row) => ({
      id: String(row.id),
      entity_type: row.entity_type,
      entity_id: String(row.entity_id),
      summary: row.summary ?? {},
      status: row.status,
      request_note: row.request_note,
      created_by: row.created_by,
      approved_by: row.approved_by,
      approved_note: row.approved_note,
      approved_at: row.approved_at ? new Date(row.approved_at).toLocaleString('zh-CN', { hour12: false }) : '',
      created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
    })
  });
}

export async function approveDeleteRequest(id, payload = {}, actorName = '后台用户') {
  await initializeDatabase();
  const row = (
    await query('SELECT * FROM delete_requests WHERE id = $1', [Number(id)])
  ).rows[0];

  if (!row) {
    throw new Error('删除申请不存在');
  }
  if (row.status !== '待审核') {
    throw new Error('删除申请已处理');
  }

  const decision = payload.result === '驳回' ? '已驳回' : '已通过';
  if (decision === '已通过') {
    switch (row.entity_type) {
      case 'products':
        await softDeleteEntity('products', row.entity_id, actorName);
        break;
      case 'product-skus':
        await softDeleteEntity('product_skus', row.entity_id, actorName);
        break;
      case 'companies':
        await softDeleteEntity('companies', row.entity_id, actorName);
        break;
      case 'inventory':
        await softDeleteEntity('company_inventory', row.entity_id, actorName);
        break;
      case 'purchase-orders':
        await softDeleteEntity('purchase_orders', row.entity_id, actorName);
        break;
      case 'member-orders':
        await softDeleteEntity('member_orders', row.entity_id, actorName);
        break;
      case 'categories':
        await softDeleteEntity('product_categories', row.entity_id, actorName);
        break;
      case 'roles':
        await softDeleteEntity('roles', row.entity_id, actorName);
        break;
      case 'permissions':
        await softDeleteEntity('permissions', row.entity_id, actorName);
        break;
      case 'members':
        await softDeleteEntity('members', row.entity_id, actorName);
        break;
      case 'staff':
        await softDeleteEntity('admin_staff', row.entity_id, actorName, { status: '停用' });
        break;
      case 'stores':
      case 'company-stores':
        await softDeleteEntity('company_stores', row.entity_id, actorName);
        break;
      default:
        throw new Error('不支持的删除类型');
    }
  }

  await query(
    `
      UPDATE delete_requests
      SET status = $1, approved_by = $2, approved_note = $3, approved_at = $4, updated_by = $2, updated_at = $4
      WHERE id = $5
    `,
    [decision, actorName, payload.note ?? '', now(), Number(id)]
  );

  await appendApprovalLog({
    entityType: 'delete_request',
    entityId: id,
    action: '删除审核',
    result: decision,
    note: payload.note ?? '',
    createdBy: actorName
  });
}

const entityConfigs = {
  stores: {
    list: listStores,
    table: 'stores',
    insertColumns:
      '(name, manager_name, city, status, staff_count, monthly_revenue, created_at, updated_at)',
    insertPlaceholders: '($1, $2, $3, $4, $5, $6, $7, $8)',
    updateSet:
      'name = $1, manager_name = $2, city = $3, status = $4, staff_count = $5, monthly_revenue = $6, updated_at = $7',
    normalize: normalizeStoreInput
  },
  staff: {
    list: listAdminStaff,
    table: 'admin_staff',
    insertColumns:
      '(name, account, password, department, role_id, status, phone, email, last_login, created_at, updated_at)',
    insertPlaceholders: '($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    updateSet:
      'name = $1, account = $2, password = $3, department = $4, role_id = $5, status = $6, phone = $7, email = $8, last_login = $9, updated_at = $10',
    normalize: normalizeStaffInput
  },
  members: {
    list: listMembers,
    table: 'members',
    insertColumns: '(name, level, tags, city, status, total_spent, created_at, updated_at)',
    insertPlaceholders: '($1, $2, $3, $4, $5, $6, $7, $8)',
    updateSet:
      'name = $1, level = $2, tags = $3, city = $4, status = $5, total_spent = $6, updated_at = $7',
    normalize: normalizeMemberInput
  },
  roles: {
    list: listRoles,
    table: 'roles',
    insertColumns: '(role_name, scope, status, description, created_at, updated_at)',
    insertPlaceholders: '($1, $2, $3, $4, $5, $6)',
    updateSet: 'role_name = $1, scope = $2, status = $3, description = $4, updated_at = $5',
    normalize: normalizeRoleInput
  },
  permissions: {
    list: listPermissions,
    table: 'permissions',
    insertColumns: '(module, permission_name, code, level, status, created_at, updated_at)',
    insertPlaceholders: '($1, $2, $3, $4, $5, $6, $7)',
    updateSet:
      'module = $1, permission_name = $2, code = $3, level = $4, status = $5, updated_at = $6',
    normalize: normalizePermissionInput
  },
  categories: {
    list: listProductCategories,
    table: 'product_categories',
    insertColumns:
      '(category_name, category_code, description, status, sort_order, created_at, updated_at)',
    insertPlaceholders: '($1, $2, $3, $4, $5, $6, $7)',
    updateSet:
      'category_name = $1, category_code = $2, description = $3, status = $4, sort_order = $5, updated_at = $6',
    normalize: normalizeCategoryInput
  }
};

export async function createRecord(entity, payload, actorName = '后台用户', user = {}) {
  await initializeDatabase();

  switch (entity) {
    case 'products':
      return {
        id: await submitProductCreateRequest(payload, actorName),
        message: '商品新增申请已提交，待审核通过后生效'
      };
    case 'companies':
      {
        const id = await createCompanyRecord(payload);
        await markUpdatedBy('companies', id, actorName);
        return { id, message: '新增成功' };
      }
    case 'inventory':
      {
        assertCanAccessCompany(user, payload.company_id);
        const id = await createInventoryRecord(payload);
        await markUpdatedBy('company_inventory', id, actorName);
        return { id, message: '新增成功' };
      }
    case 'purchase-orders':
      {
        const id = await createPurchaseOrderRecord(payload, actorName, user);
        await markUpdatedBy('purchase_orders', id, actorName);
        return { id, message: '新增成功' };
      }
    case 'member-orders':
      {
        assertCanAccessCompany(user, payload.company_id);
        const id = await createMemberOrderRecord(payload);
        await markUpdatedBy('member_orders', id, actorName);
        return { id, message: '新增成功' };
      }
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      const timestamp = now();
      let normalizedPayload = payload;
      if (entity === 'staff') {
        const phone = String(payload.phone ?? '').trim();
        if (!isMainlandMobile(phone)) {
          throw new Error('请填写 11 位员工手机号，员工将使用该手机号 + 短信验证码登录');
        }
        // 验证码登录：不再下发密码，仅为 NOT NULL 约束生成一个不可用的随机密码占位。
        normalizedPayload = {
          ...payload,
          phone,
          department: await inferStaffDepartmentByRoleId(payload.role_id),
          password: await hashPassword(generateAccountPassword()),
          last_login: '从未登录'
        };
      }
      const values = config.normalize(normalizedPayload);
      const result = await query(
        `INSERT INTO ${config.table} ${config.insertColumns} VALUES ${config.insertPlaceholders} RETURNING id`,
        [...values, timestamp, timestamp]
      );
      await markUpdatedBy(config.table, result.rows[0].id, actorName);
      return {
        id: result.rows[0].id,
        message:
          entity === 'staff'
            ? `员工账号创建成功，可使用手机号 ${normalizedPayload.phone} + 短信验证码登录`
            : '新增成功'
      };
    }
  }
}

export async function updateRecord(entity, id, payload, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  await assertCanAccessEntityRecord(entity, id, user);

  switch (entity) {
    case 'products':
      await submitProductUpdateRequest(id, payload, actorName);
      return { success: true, message: '商品修改申请已提交，待审核通过后生效' };
    case 'companies':
      await updateCompanyRecord(id, payload);
      await markUpdatedBy('companies', id, actorName);
      return { success: true, message: '保存成功' };
    case 'inventory':
      await updateInventoryRecord(id, payload, actorName);
      await markUpdatedBy('company_inventory', id, actorName);
      return { success: true, message: '保存成功' };
    case 'purchase-orders':
      await updatePurchaseOrderRecord(id, payload, actorName);
      await markUpdatedBy('purchase_orders', id, actorName);
      return { success: true, message: '保存成功' };
    case 'member-orders':
      await updateMemberOrderRecord(id, payload, actorName);
      await markUpdatedBy('member_orders', id, actorName);
      return { success: true, message: '保存成功' };
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      const timestamp = now();
      let nextPayload = payload;
      if (entity === 'staff') {
        const currentStaff = (
          await query('SELECT password, last_login FROM admin_staff WHERE id = $1', [Number(id)])
        ).rows[0];
        const phone = String(payload.phone ?? '').trim();
        if (!isMainlandMobile(phone)) {
          throw new Error('请填写 11 位员工手机号，员工将使用该手机号 + 短信验证码登录');
        }
        nextPayload = {
          ...payload,
          phone,
          department: await inferStaffDepartmentByRoleId(payload.role_id),
          password:
            payload.password && String(payload.password).trim().length > 0
              ? await hashPassword(String(payload.password).trim())
              : currentStaff?.password ?? '',
          last_login: currentStaff?.last_login ?? '从未登录'
        };
      }
      const values = config.normalize(nextPayload);
      await query(
        `UPDATE ${config.table} SET ${config.updateSet} WHERE id = $${values.length + 2}`,
        [...values, timestamp, Number(id)]
      );
      await markUpdatedBy(config.table, id, actorName);
      return { success: true, message: '保存成功' };
    }
  }
}

export async function deleteRecord(entity, id, actorName = '后台用户', user = {}) {
  await initializeDatabase();
  await assertCanAccessEntityRecord(entity, id, user);
  switch (entity) {
    case 'products':
      await submitProductDeleteRequest(id, actorName);
      return { success: true, message: '商品删除申请已提交，待审核通过后执行' };
    case 'companies':
      {
        const row = (await query('SELECT id, name, code, status FROM companies WHERE id = $1', [Number(id)])).rows[0];
        if (!row) throw new Error('分公司不存在');
        const requestId = await insertDeleteRequest({
          entityType: 'companies',
          entityId: id,
          summary: buildDeleteSummary('companies', row),
          createdBy: actorName,
          requestNote: '提交分公司删除申请'
        });
        return { success: true, id: requestId, message: '分公司删除申请已提交，待审核通过后执行' };
      }
    case 'inventory':
      {
        const row = (
          await query(
            `
              SELECT company_inventory.id, products.name AS product_name, product_skus.sku_code, company_inventory.status
              FROM company_inventory
              INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
              INNER JOIN products ON products.id = product_skus.product_id
              WHERE company_inventory.id = $1
            `,
            [Number(id)]
          )
        ).rows[0];
        if (!row) throw new Error('库存记录不存在');
        const requestId = await insertDeleteRequest({
          entityType: 'inventory',
          entityId: id,
          summary: buildDeleteSummary('inventory', row),
          createdBy: actorName,
          requestNote: '提交库存记录删除申请'
        });
        return { success: true, id: requestId, message: '库存记录删除申请已提交，待审核通过后执行' };
      }
    case 'purchase-orders': {
      const order = (await query('SELECT order_quota_deducted, stock_received FROM purchase_orders WHERE id = $1', [Number(id)])).rows[0];
      if (order?.order_quota_deducted || order?.stock_received) {
        throw new Error('已扣减订货额度或已入库的订货单不能直接删除');
      }
      const row = (await query('SELECT id, order_no, status FROM purchase_orders WHERE id = $1', [Number(id)])).rows[0];
      const requestId = await insertDeleteRequest({
        entityType: 'purchase-orders',
        entityId: id,
        summary: buildDeleteSummary('purchase-orders', row),
        createdBy: actorName,
        requestNote: '提交订货单删除申请'
      });
      return { success: true, id: requestId, message: '订货单删除申请已提交，待审核通过后执行' };
    }
    case 'member-orders': {
      const order = (await query('SELECT stock_deducted FROM member_orders WHERE id = $1', [Number(id)])).rows[0];
      if (order?.stock_deducted) {
        throw new Error('已核销的散客订单不能直接删除');
      }
      const row = (await query('SELECT id, order_no, status FROM member_orders WHERE id = $1', [Number(id)])).rows[0];
      const requestId = await insertDeleteRequest({
        entityType: 'member-orders',
        entityId: id,
        summary: buildDeleteSummary('member-orders', row),
        createdBy: actorName,
        requestNote: '提交散客订单删除申请'
      });
      return { success: true, id: requestId, message: '散客订单删除申请已提交，待审核通过后执行' };
    }
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      const row = (await query(`SELECT * FROM ${config.table} WHERE id = $1`, [Number(id)])).rows[0];
      if (!row) {
        throw new Error('记录不存在');
      }
      const requestId = await insertDeleteRequest({
        entityType: entity,
        entityId: id,
        summary: buildDeleteSummary(entity, row),
        createdBy: actorName,
        requestNote: '提交删除申请'
      });
      return { success: true, id: requestId, message: '删除申请已提交，待审核通过后执行' };
    }
  }
}

export async function getResourceRows(entity, filters = {}) {
  await initializeDatabase();
  switch (entity) {
    case 'products':
      return listProducts(filters);
    case 'companies':
      return listCompanies(filters);
    case 'inventory':
      return listInventory(filters);
    case 'purchase-orders':
      return listPurchaseOrders(filters);
    case 'member-orders':
      return listMemberOrders(filters);
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      return config.list(filters);
    }
  }
}

export async function updateStaffStatus(id, status, actorName = '后台用户') {
  await initializeDatabase();
  await query('UPDATE admin_staff SET status = $1, updated_by = $2, updated_at = $3 WHERE id = $4', [
    status,
    actorName,
    now(),
    Number(id)
  ]);
}

/**
 * @deprecated 系统已改为手机号 + 短信验证码登录，密码登录已弃用，无需也无法重置密码。
 * 保留导出仅为兼容旧调用点；调用即抛出明确提示。
 */
export async function resetStaffPassword() {
  throw new Error('系统已改为短信验证码登录，密码功能已弃用，无需重置密码');
}

export async function changeAdminPassword(id, currentPassword, nextPassword) {
  await initializeDatabase();
  const row = (
    await query('SELECT password FROM admin_staff WHERE id = $1 AND status != $2', [
      Number(id),
      '停用'
    ])
  ).rows[0];

  if (!row) {
    throw new Error('当前账号不存在或已停用');
  }

  const matched = await verifyPassword(currentPassword, row.password);
  if (!matched) {
    throw new Error('当前密码不正确');
  }

  const hashedPassword = await hashPassword(nextPassword);
  await query('UPDATE admin_staff SET password = $1, updated_by = $2, updated_at = $3 WHERE id = $4', [
    hashedPassword,
    '本人',
    now(),
    Number(id)
  ]);
}

export async function updateSkuImage(skuId, imageUrl, actorName = '后台用户') {
  await initializeDatabase();
  await query('UPDATE product_skus SET image_url = $1, updated_by = $2, updated_at = $3 WHERE id = $4', [
    imageUrl,
    actorName,
    now(),
    Number(skuId)
  ]);
}

export async function createSession(userId) {
  await initializeDatabase();
  const client = await ensureRedis();
  const sessionId = randomUUID();
  await client.set(`admin:session:${sessionId}`, String(userId), {
    EX: SESSION_TTL_SECONDS
  });
  return sessionId;
}

export async function getSessionUserId(sessionId) {
  await initializeDatabase();
  const client = await ensureRedis();
  return client.get(`admin:session:${sessionId}`);
}

export async function touchSession(sessionId) {
  if (!sessionId) return;
  await initializeDatabase();
  const client = await ensureRedis();
  await client.expire(`admin:session:${sessionId}`, SESSION_TTL_SECONDS);
}

export async function deleteSession(sessionId) {
  if (!sessionId) return;
  await initializeDatabase();
  const client = await ensureRedis();
  await client.del(`admin:session:${sessionId}`);
}

/* ============================================================
 * 登录验证码（OTP）
 * ============================================================ */

/**
 * 硬编码（万能）验证码开关。
 *
 * 安全约束：真正的正式环境（NODE_ENV=production 且未显式打开 dev 标记）
 * **永远**不允许万能验证码，确保线上无后门。测试环境若需要，可显式设置
 * OTP_DEV_BYPASS=true 并配置 OTP_DEV_BYPASS_CODE。两个条件缺一不可，
 * 即使在 prod 误设了 CODE 但没设 OTP_DEV_BYPASS 也不会生效。
 */
function getOtpDevBypass() {
  const isProd = process.env.NODE_ENV === 'production';
  const flagged = process.env.OTP_DEV_BYPASS === 'true';
  const code = String(process.env.OTP_DEV_BYPASS_CODE || '').trim();
  const enabled = (!isProd || flagged) && code.length > 0;
  return { enabled, code };
}

function normalizePhone(phone) {
  return String(phone ?? '').trim();
}

/**
 * 发送登录验证码：校验手机号 → 重发限流（60s）→ 生成 6 位码写入 Redis（300s）
 * → 下发短信。正式环境短信发送失败会回滚限流并抛错，便于用户立即重试。
 */
export async function requestLoginOtp(phone) {
  await initializeDatabase();
  const normalizedPhone = normalizePhone(phone);
  if (!isMainlandMobile(normalizedPhone)) {
    throw new Error('请输入有效的 11 位手机号');
  }

  const client = await ensureRedis();
  const resendKey = `otp:resend:${normalizedPhone}`;
  const resendTtl = await client.ttl(resendKey);
  if (resendTtl > 0) {
    throw new Error(`请 ${resendTtl} 秒后再获取验证码`);
  }

  const bypass = getOtpDevBypass();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await client.set(`otp:code:${normalizedPhone}`, code, { EX: OTP_CODE_TTL_SECONDS });
  await client.set(resendKey, '1', { EX: OTP_RESEND_TTL_SECONDS });
  await client.del(`otp:attempt:${normalizedPhone}`);

  const smsResult = await sendLoginCodeSmsSafe(normalizedPhone, code);

  // 正式环境必须真实发送成功；失败则回滚重发锁，允许立即重试。
  if (process.env.NODE_ENV === 'production' && !bypass.enabled && !smsResult.sent) {
    await client.del(resendKey);
    await client.del(`otp:code:${normalizedPhone}`);
    throw new Error(smsResult.message || '验证码短信发送失败，请稍后再试');
  }

  let message;
  if (smsResult.sent) {
    message = '验证码已发送，请注意查收';
  } else if (bypass.enabled) {
    message = `当前为测试/开发环境，可直接使用万能验证码 ${bypass.code} 登录`;
  } else {
    message = smsResult.message || '验证码已生成';
  }

  return {
    sent: Boolean(smsResult.sent),
    resendAfter: OTP_RESEND_TTL_SECONDS,
    devBypass: bypass.enabled,
    message
  };
}

/**
 * 校验登录验证码。开发/测试万能码优先；否则走 Redis：
 * 失败累计达上限锁定 10 分钟，成功后立即清除验证码与失败计数。
 * 校验通过返回 true，否则抛出带提示的错误。
 */
export async function verifyLoginOtp(phone, code) {
  await initializeDatabase();
  const normalizedPhone = normalizePhone(phone);
  const input = String(code ?? '').trim();
  if (!isMainlandMobile(normalizedPhone)) {
    throw new Error('请输入有效的 11 位手机号');
  }
  if (!input) {
    throw new Error('请输入验证码');
  }

  const bypass = getOtpDevBypass();
  if (bypass.enabled && input === bypass.code) {
    return true;
  }

  const client = await ensureRedis();
  const attemptKey = `otp:attempt:${normalizedPhone}`;
  const codeKey = `otp:code:${normalizedPhone}`;

  const attempts = Number((await client.get(attemptKey)) || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw new Error('验证码错误次数过多，请 10 分钟后再试');
  }

  const stored = await client.get(codeKey);
  if (!stored) {
    throw new Error('验证码已失效，请重新获取');
  }

  if (stored !== input) {
    const next = await client.incr(attemptKey);
    if (next === 1) {
      await client.expire(attemptKey, OTP_LOCK_TTL_SECONDS);
    }
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - next);
    throw new Error(
      remaining > 0 ? `验证码不正确，还可尝试 ${remaining} 次` : '验证码错误次数过多，请 10 分钟后再试'
    );
  }

  await client.del(codeKey);
  await client.del(attemptKey);
  return true;
}

export function getDatabaseFilePath() {
  return databaseUrl;
}

export function getRedisUrl() {
  return redisUrl;
}

/* ============================================================
 * Mobile-only extensions (Stage 3)
 * ============================================================ */

let mobileExtrasReady = false;

export async function ensureMobileExtras() {
  if (mobileExtrasReady) return;
  await initializeDatabase();
  await query(`
    CREATE TABLE IF NOT EXISTS mobile_push_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_user ON mobile_push_tokens(user_id);`);
  await query(`ALTER TABLE admin_staff ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';`);
  mobileExtrasReady = true;
}

/**
 * Resolve a scanned barcode (or qr_code) → SKU, find the oldest open
 * member_order_item in the user's store with that SKU, mark it written
 * off, and insert a writeoff_records row inside one transaction.
 */
export async function createMobileWriteoff(rawCode, user) {
  await initializeDatabase();
  const code = (rawCode ?? '').trim();
  if (!code) return { ok: false, message: '条码为空' };
  if (!user?.storeId) return { ok: false, message: '当前账号未绑定门店' };

  const skuRow = (
    await query(
      `
        SELECT product_skus.id, product_skus.sku_code, product_skus.barcode,
               product_skus.qr_code, products.name AS product_name,
               product_skus.redeem_points_price,
               product_skus.sale_price
        FROM product_skus
        INNER JOIN products ON products.id = product_skus.product_id
        WHERE product_skus.barcode = $1 OR product_skus.qr_code = $1 OR product_skus.sku_code = $1
        LIMIT 1
      `,
      [code]
    )
  ).rows[0];
  if (!skuRow) return { ok: false, message: '未识别商品' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemRow = (
      await client.query(
        `
          SELECT moi.id AS item_id, moi.member_order_id, mo.sales_staff_name
          FROM member_order_items moi
          INNER JOIN member_orders mo ON mo.id = moi.member_order_id
          WHERE moi.sku_id = $1
            AND mo.store_id = $2
            AND mo.delete_status = '正常'
            AND moi.writeoff_status = '待核销'
          ORDER BY mo.created_at ASC
          LIMIT 1
        `,
        [skuRow.id, Number(user.storeId)]
      )
    ).rows[0];

    if (!itemRow) {
      await client.query('ROLLBACK');
      return createDirectMobileWriteoffOrder(skuRow, user, code);
    }

    const writeoffTime = new Date().toLocaleString('zh-CN', { hour12: false });
    const insertResult = await client.query(
      `
        INSERT INTO writeoff_records
          (member_order_id, sku_id, store_id, sales_staff_name, product_code, status, writeoff_time, remark)
        VALUES ($1, $2, $3, $4, $5, '成功', $6, '移动端扫码核销')
        RETURNING id
      `,
      [
        itemRow.member_order_id,
        skuRow.id,
        Number(user.storeId),
        user.fullName ?? user.name ?? '移动端用户',
        code,
        writeoffTime
      ]
    );

    await client.query(
      `UPDATE member_order_items SET writeoff_status = '已核销' WHERE id = $1`,
      [itemRow.item_id]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      id: String(insertResult.rows[0].id),
      skuId: String(skuRow.id),
      product: {
        name: skuRow.product_name,
        sku: skuRow.sku_code,
        points: Number(skuRow.redeem_points_price ?? 0)
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getMobileKpiOverview(user) {
  await initializeDatabase();
  const last30 = `created_at >= NOW() - INTERVAL '30 days'`;
  const prev30 = `created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'`;
  const companyParams = user?.companyId ? [Number(user.companyId)] : [];
  const companyClause = user?.companyId ? 'AND company_id = $1' : '';

  const salesNow = Number(
    (
      await query(
        `SELECT COALESCE(SUM(total_amount), 0)::numeric AS s
         FROM member_orders
         WHERE delete_status = '正常' AND ${last30} ${companyClause}`,
        companyParams
      )
    ).rows[0].s
  );
  const salesPrev = Number(
    (
      await query(
        `SELECT COALESCE(SUM(total_amount), 0)::numeric AS s
         FROM member_orders
         WHERE delete_status = '正常' AND ${prev30} ${companyClause}`,
        companyParams
      )
    ).rows[0].s
  );

  const verifyNow = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c
         FROM writeoff_records w
         INNER JOIN member_orders mo ON mo.id = w.member_order_id
         WHERE w.status = '成功'
           AND mo.delete_status = '正常'
           AND mo.created_at >= NOW() - INTERVAL '30 days'
           ${user?.companyId ? 'AND mo.company_id = $1' : ''}`,
        companyParams
      )
    ).rows[0].c
  );
  const verifyPrev = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c
         FROM writeoff_records w
         INNER JOIN member_orders mo ON mo.id = w.member_order_id
         WHERE w.status = '成功'
           AND mo.delete_status = '正常'
           AND mo.created_at >= NOW() - INTERVAL '60 days'
           AND mo.created_at < NOW() - INTERVAL '30 days'
           ${user?.companyId ? 'AND mo.company_id = $1' : ''}`,
        companyParams
      )
    ).rows[0].c
  );

  const totalPoints = Number(
    (
      await query(
        `SELECT COALESCE(SUM(points_cost), 0)::numeric AS s FROM point_redeem_orders`,
        []
      )
    ).rows[0].s
  );

  const totalInventory = Number(
    (
      await query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS s
         FROM company_inventory ${user?.companyId ? 'WHERE company_id = $1' : ''}`,
        companyParams
      )
    ).rows[0].s
  );

  function pct(nowVal, prevVal) {
    if (!prevVal) return nowVal > 0 ? '+100.0%' : '+0.0%';
    const change = ((nowVal - prevVal) / prevVal) * 100;
    return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  return {
    totalSales: fmt(salesNow),
    totalVerify: fmt(verifyNow),
    totalPoints: fmt(totalPoints),
    totalInventory: fmt(totalInventory),
    salesGrowth: pct(salesNow, salesPrev),
    verifyGrowth: pct(verifyNow, verifyPrev)
  };
}

export async function registerMobilePushToken(userId, token, platform = 'unknown') {
  await ensureMobileExtras();
  const timestamp = now();
  await query(
    `
      INSERT INTO mobile_push_tokens (user_id, token, platform, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $4)
      ON CONFLICT (token) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        updated_at = EXCLUDED.updated_at
    `,
    [Number(userId), token, platform, timestamp]
  );
}

export async function unregisterMobilePushToken(token) {
  await ensureMobileExtras();
  await query(`DELETE FROM mobile_push_tokens WHERE token = $1`, [token]);
}

export async function listMobilePushTokens(userId) {
  await ensureMobileExtras();
  const rows = (
    await query(
      `SELECT token, platform FROM mobile_push_tokens WHERE user_id = $1`,
      [Number(userId)]
    )
  ).rows;
  return rows.map((r) => ({ token: r.token, platform: r.platform }));
}

export async function updateAdminAvatar(userId, avatarUrl) {
  await ensureMobileExtras();
  await query(
    `UPDATE admin_staff SET avatar_url = $2, updated_at = $3 WHERE id = $1`,
    [Number(userId), avatarUrl ?? '', now()]
  );
}

/* ---------- Staff lookup helpers (used by events.ts to fan out push) ---------- */

export async function listStaffIdsByStore(storeId) {
  if (!storeId) return [];
  await initializeDatabase();
  const rows = (
    await query(
      `SELECT id, name, account FROM admin_staff
       WHERE store_id = $1 AND delete_status = '正常' AND status = '启用'`,
      [Number(storeId)]
    )
  ).rows;
  return rows.map((r) => ({ id: String(r.id), name: r.name, account: r.account }));
}

export async function listStaffIdsByCompany(companyId) {
  if (!companyId) return [];
  await initializeDatabase();
  const rows = (
    await query(
      `SELECT id, name, account FROM admin_staff
       WHERE company_id = $1 AND delete_status = '正常' AND status = '启用'`,
      [Number(companyId)]
    )
  ).rows;
  return rows.map((r) => ({ id: String(r.id), name: r.name, account: r.account }));
}

/* ---------- Purchase order summary (for event payloads) ---------- */

export async function getPurchaseOrderSummary(id) {
  if (!id) return null;
  await initializeDatabase();
  const row = (
    await query(
      `SELECT id, order_no, company_id, store_id, status
       FROM purchase_orders WHERE id = $1`,
      [Number(id)]
    )
  ).rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    orderNo: row.order_no,
    companyId: row.company_id ? String(row.company_id) : '',
    storeId: row.store_id ? String(row.store_id) : '',
    status: row.status
  };
}

/* ---------- Inventory threshold check helper ---------- */

export async function getCompanyInventoryForSku(companyId, skuId) {
  if (!companyId || !skuId) return null;
  await initializeDatabase();
  const row = (
    await query(
      `SELECT ci.quantity, ci.safety_stock,
              ps.sku_code, p.name AS product_name
       FROM company_inventory ci
       INNER JOIN product_skus ps ON ps.id = ci.sku_id
       INNER JOIN products p ON p.id = ps.product_id
       WHERE ci.company_id = $1 AND ci.sku_id = $2`,
      [Number(companyId), Number(skuId)]
    )
  ).rows[0];
  if (!row) return null;
  return {
    quantity: Number(row.quantity ?? 0),
    safety_stock: Number(row.safety_stock ?? 0),
    sku_code: row.sku_code,
    product_name: row.product_name
  };
}

/* ============================================================
 * Stage 5: Store inventory + two-tier replenishment
 * ============================================================ */

let storeInventoryReady = false;

export async function ensureStoreInventoryTables() {
  if (storeInventoryReady) return;
  await initializeDatabase();
  await query(`
    CREATE TABLE IF NOT EXISTS store_inventory (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES company_stores(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      safety_stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (store_id, sku_id)
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON store_inventory(store_id);`);
  await query(`ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL;`);
  storeInventoryReady = true;
}

export async function getStoreInventory(storeId) {
  if (!storeId) return [];
  await ensureStoreInventoryTables();
  const rows = (
    await query(
      `
        SELECT si.id, si.sku_id, si.quantity, si.safety_stock,
               ps.sku_code, ps.barcode, ps.image_url,
               p.name AS product_name, ps.spec, ps.unit
        FROM store_inventory si
        INNER JOIN product_skus ps ON ps.id = si.sku_id
        INNER JOIN products p ON p.id = ps.product_id
        WHERE si.store_id = $1
        ORDER BY (si.quantity <= si.safety_stock) DESC, p.name
      `,
      [Number(storeId)]
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    skuId: String(r.sku_id),
    skuCode: r.sku_code,
    barcode: r.barcode,
    imageUrl: r.image_url,
    productName: r.product_name,
    spec: r.spec,
    unit: r.unit,
    quantity: Number(r.quantity ?? 0),
    safetyStock: Number(r.safety_stock ?? 0),
    warn: Number(r.quantity ?? 0) <= Number(r.safety_stock ?? 0)
  }));
}

export async function createReplenishment(user, items, remark = '') {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('请至少选择一个商品');
  }
  if (!user?.companyId) {
    throw new Error('当前账号未绑定分公司');
  }
  await ensureStoreInventoryTables();
  const isStoreLevel = Boolean(user.storeId);

  const companyRow = (
    await query(`SELECT code FROM companies WHERE id = $1`, [Number(user.companyId)])
  ).rows[0];
  if (!companyRow) throw new Error('分公司不存在');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const skuIds = items.map((it) => Number(it.sku_id)).filter(Boolean);
    const skuRows = (
      await client.query(
        `SELECT id, order_quota_price FROM product_skus WHERE id = ANY($1::int[])`,
        [skuIds]
      )
    ).rows;
    const priceBySku = new Map(
      skuRows.map((r) => [String(r.id), Number(r.order_quota_price ?? 0)])
    );

    const total = items.reduce((sum, it) => {
      const price = priceBySku.get(String(it.sku_id)) ?? 0;
      return sum + price * Number(it.quantity || 0);
    }, 0);

    const orderNo = await generatePurchaseOrderNo(client, companyRow.code);
    const ts = now();
    const orderResult = await client.query(
      `
        INSERT INTO purchase_orders
          (order_no, company_id, status, order_quota_total, store_id,
           remark, abnormal_flag, approval_status,
           order_quota_deducted, stock_received, updated_by, created_at, updated_at)
        VALUES ($1, $2, '待审核', $3, $4, $5, FALSE, '待审核', FALSE, FALSE, $6, $7, $7)
        RETURNING id
      `,
      [
        orderNo,
        Number(user.companyId),
        total,
        isStoreLevel ? Number(user.storeId) : null,
        String(remark ?? ''),
        user.fullName ?? user.account ?? '移动端用户',
        ts
      ]
    );
    const orderId = orderResult.rows[0].id;

    for (const it of items) {
      const skuId = Number(it.sku_id);
      const qty = Number(it.quantity);
      const price = priceBySku.get(String(skuId)) ?? 0;
      await client.query(
        `
          INSERT INTO purchase_order_items
            (purchase_order_id, sku_id, quantity, order_quota_unit_price, subtotal_order_quota)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [orderId, skuId, qty, price, price * qty]
      );
    }

    await client.query('COMMIT');
    return { id: String(orderId), orderNo, isStoreLevel };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function approveReplenishment(orderId, decision, actor) {
  await ensureStoreInventoryTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = (
      await client.query(
        `SELECT id, order_no, company_id, store_id, status
         FROM purchase_orders WHERE id = $1 FOR UPDATE`,
        [Number(orderId)]
      )
    ).rows[0];

    if (!order) throw new Error('补货请求不存在');
    if (!order.store_id) throw new Error('该订单不是门店补货请求');
    if (order.status !== '待审核') {
      throw new Error(`订单状态为 ${order.status}，不能审核`);
    }

    if (decision === '驳回') {
      await client.query(
        `UPDATE purchase_orders SET status = '已驳回', approval_status = '已驳回', updated_by = $2, updated_at = NOW() WHERE id = $1`,
        [order.id, actor ?? '后台用户']
      );
      await client.query('COMMIT');
      return { id: String(order.id), orderNo: order.order_no, status: '已驳回' };
    }

    // Approve: transfer stock from company_inventory to store_inventory.
    const items = (
      await client.query(
        `SELECT sku_id, quantity FROM purchase_order_items WHERE purchase_order_id = $1`,
        [order.id]
      )
    ).rows;

    for (const it of items) {
      const skuId = Number(it.sku_id);
      const qty = Number(it.quantity);

      const ci = (
        await client.query(
          `SELECT id, quantity FROM company_inventory
           WHERE company_id = $1 AND sku_id = $2 AND delete_status = '正常'
           FOR UPDATE`,
          [order.company_id, skuId]
        )
      ).rows[0];
      if (!ci || Number(ci.quantity) < qty) {
        throw new Error(`SKU ${skuId} 分公司库存不足`);
      }
      const newCompanyQty = Number(ci.quantity) - qty;
      await client.query(
        `UPDATE company_inventory SET quantity = $1, updated_by = $3, updated_at = NOW() WHERE id = $2`,
        [newCompanyQty, ci.id, actor ?? '后台用户']
      );
      await client.query(
        `INSERT INTO inventory_logs (company_id, sku_id, source_type, source_id, change_type, quantity, balance_after, remark, created_at, store_id)
         VALUES ($1, $2, 'replenishment', $3, '调出', $4, $5, '调拨给门店', NOW(), NULL)`,
        [order.company_id, skuId, String(order.id), -qty, newCompanyQty]
      );

      const ts = now();
      const existing = (
        await client.query(
          `SELECT id, quantity FROM store_inventory WHERE store_id = $1 AND sku_id = $2 FOR UPDATE`,
          [order.store_id, skuId]
        )
      ).rows[0];
      let newStoreQty;
      if (existing) {
        newStoreQty = Number(existing.quantity) + qty;
        await client.query(
          `UPDATE store_inventory SET quantity = $1, updated_at = $3 WHERE id = $2`,
          [newStoreQty, existing.id, ts]
        );
      } else {
        newStoreQty = qty;
        await client.query(
          `INSERT INTO store_inventory (company_id, store_id, sku_id, quantity, safety_stock, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 0, $5, $5)`,
          [order.company_id, order.store_id, skuId, qty, ts]
        );
      }
      await client.query(
        `INSERT INTO inventory_logs (company_id, sku_id, source_type, source_id, change_type, quantity, balance_after, remark, created_at, store_id)
         VALUES ($1, $2, 'replenishment', $3, '调入', $4, $5, '门店补货入库', NOW(), $6)`,
        [order.company_id, skuId, String(order.id), qty, newStoreQty, order.store_id]
      );
    }

    await client.query(
      `UPDATE purchase_orders
         SET status = '已入库', approval_status = '已通过',
             order_quota_deducted = TRUE, stock_received = TRUE,
             updated_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [order.id, actor ?? '后台用户']
    );
    await client.query('COMMIT');
    return { id: String(order.id), orderNo: order.order_no, status: '已入库' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listReplenishmentsForUser(user) {
  await ensureStoreInventoryTables();
  if (!user?.companyId) return [];
  const params = [Number(user.companyId)];
  let scope = 'po.company_id = $1';
  if (user.storeId) {
    params.push(Number(user.storeId));
    scope += ' AND po.store_id = $2';
  } else {
    scope += ' AND po.store_id IS NULL';
  }
  const rows = (
    await query(
      `
        SELECT po.id, po.order_no, po.status, po.created_at, po.order_quota_total,
               COALESCE(SUM(poi.quantity), 0)::int AS total_qty
        FROM purchase_orders po
        LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.delete_status = '正常' AND ${scope}
        GROUP BY po.id
        ORDER BY po.created_at DESC
        LIMIT 100
      `,
      params
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    orderNo: r.order_no,
    status: r.status,
    totalAmount: Number(r.order_quota_total ?? 0),
    totalQty: Number(r.total_qty ?? 0),
    createdAt: r.created_at
  }));
}

export async function listPendingReplenishmentsForBranch(user) {
  await ensureStoreInventoryTables();
  if (!user?.companyId) return [];
  const rows = (
    await query(
      `
        SELECT po.id, po.order_no, po.status, po.created_at, po.store_id,
               cs.name AS store_name,
               COALESCE(SUM(poi.quantity), 0)::int AS total_qty,
               po.order_quota_total
        FROM purchase_orders po
        LEFT JOIN company_stores cs ON cs.id = po.store_id
        LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
        WHERE po.company_id = $1
          AND po.store_id IS NOT NULL
          AND po.status = '待审核'
          AND po.delete_status = '正常'
        GROUP BY po.id, cs.name
        ORDER BY po.created_at ASC
      `,
      [Number(user.companyId)]
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    orderNo: r.order_no,
    storeId: String(r.store_id),
    storeName: r.store_name,
    totalQty: Number(r.total_qty ?? 0),
    totalAmount: Number(r.order_quota_total ?? 0),
    createdAt: r.created_at
  }));
}

/* ============================================================
 * Stage 6: Points history + branch / store summaries for mobile
 * ============================================================ */

/**
 * Returns a unified, time-sorted list of point-affecting events for the
 * caller's scope. Right now it sources from writeoff_records (positive
 * credits). When a future "points spent" stream is added, append it here.
 */
export async function getPointsHistoryForUser(user, { limit = 50 } = {}) {
  await initializeDatabase();
  const params = [];
  let where = `w.status = '成功'`;
  if (user?.storeId) {
    params.push(Number(user.storeId));
    where += ` AND w.store_id = $${params.length}`;
  } else if (user?.companyId) {
    params.push(Number(user.companyId));
    where += ` AND mo.company_id = $${params.length}`;
  }
  params.push(Math.max(1, Math.min(200, Number(limit) || 50)));
  const rows = (
    await query(
      `
        SELECT w.id, w.writeoff_time AS time, w.product_code,
               w.sales_staff_name, w.remark, w.store_id,
               cs.name AS store_name,
               ps.sku_code, ps.redeem_points_price,
               p.name AS product_name
        FROM writeoff_records w
        LEFT JOIN member_orders mo ON mo.id = w.member_order_id
        LEFT JOIN company_stores cs ON cs.id = w.store_id
        LEFT JOIN product_skus ps ON ps.id = w.sku_id
        LEFT JOIN products p ON p.id = ps.product_id
        WHERE ${where}
        ORDER BY w.id DESC
        LIMIT $${params.length}
      `,
      params
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    time: r.time ?? '',
    direction: 'in',
    amount: Number(r.redeem_points_price ?? 0),
    productName: r.product_name ?? r.sku_code ?? '商品',
    storeName: r.store_name ?? '',
    operator: r.sales_staff_name ?? '',
    source: '核销回积分',
    note: r.remark ?? ''
  }));
}

export async function getBranchSummary(companyId) {
  if (!companyId) return null;
  await initializeDatabase();
  const company = (
    await query(
      `SELECT id, name, code, available_order_quota, total_order_quota
       FROM companies WHERE id = $1`,
      [Number(companyId)]
    )
  ).rows[0];
  if (!company) return null;

  const storeCount = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c FROM company_stores
         WHERE company_id = $1 AND delete_status = '正常'`,
        [Number(companyId)]
      )
    ).rows[0].c
  );
  const orderTotal = Number(
    (
      await query(
        `SELECT COALESCE(SUM(total_amount), 0)::numeric AS s
         FROM member_orders
         WHERE company_id = $1 AND delete_status = '正常'
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [Number(companyId)]
      )
    ).rows[0].s
  );
  const inventoryQty = Number(
    (
      await query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS s
         FROM company_inventory WHERE company_id = $1`,
        [Number(companyId)]
      )
    ).rows[0].s
  );
  const lowStock = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c
         FROM company_inventory
         WHERE company_id = $1 AND safety_stock > 0
           AND quantity <= safety_stock`,
        [Number(companyId)]
      )
    ).rows[0].c
  );

  return {
    id: String(company.id),
    name: company.name,
    code: company.code,
    availableQuota: Number(company.available_order_quota ?? 0),
    totalQuota: Number(company.total_order_quota ?? 0),
    storeCount,
    salesLast30: orderTotal,
    inventoryQty,
    lowStockCount: lowStock
  };
}

export async function getStoreSummary(storeId) {
  if (!storeId) return null;
  await ensureStoreInventoryTables();
  const store = (
    await query(
      `SELECT id, company_id, name, manager_name, manager_phone, address
       FROM company_stores WHERE id = $1`,
      [Number(storeId)]
    )
  ).rows[0];
  if (!store) return null;

  const todayVerify = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c FROM writeoff_records
         WHERE store_id = $1 AND status = '成功'
           AND writeoff_time::text LIKE TO_CHAR(NOW(), 'YYYY/MM/DD') || '%'`,
        [Number(storeId)]
      )
    ).rows[0].c
  );
  const skuCount = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c FROM store_inventory WHERE store_id = $1`,
        [Number(storeId)]
      )
    ).rows[0].c
  );
  const lowStock = Number(
    (
      await query(
        `SELECT COUNT(*)::int AS c FROM store_inventory
         WHERE store_id = $1 AND safety_stock > 0
           AND quantity <= safety_stock`,
        [Number(storeId)]
      )
    ).rows[0].c
  );

  return {
    id: String(store.id),
    companyId: String(store.company_id ?? ''),
    name: store.name,
    managerName: store.manager_name ?? '',
    managerPhone: store.manager_phone ?? '',
    address: store.address ?? '',
    todayVerifyCount: todayVerify,
    skuCount,
    lowStockCount: lowStock
  };
}

export async function getStoreTodayStats(storeId, staffName) {
  if (!storeId) return { storeVerifyCount: 0, myVerifyCount: 0, todayPoints: 0 };
  await initializeDatabase();
  const today = `TO_CHAR(NOW(), 'YYYY/MM/DD')`;
  const storeRow = (
    await query(
      `SELECT COUNT(*)::int AS c,
              COALESCE(SUM(ps.redeem_points_price), 0)::numeric AS pts
       FROM writeoff_records w
       LEFT JOIN product_skus ps ON ps.id = w.sku_id
       WHERE w.store_id = $1 AND w.status = '成功'
         AND w.writeoff_time::text LIKE ${today} || '%'`,
      [Number(storeId)]
    )
  ).rows[0];
  let myCount = 0;
  if (staffName) {
    myCount = Number(
      (
        await query(
          `SELECT COUNT(*)::int AS c
           FROM writeoff_records
           WHERE store_id = $1 AND status = '成功'
             AND sales_staff_name = $2
             AND writeoff_time::text LIKE ${today} || '%'`,
          [Number(storeId), staffName]
        )
      ).rows[0].c
    );
  }
  return {
    storeVerifyCount: Number(storeRow?.c ?? 0),
    myVerifyCount: myCount,
    todayPoints: Number(storeRow?.pts ?? 0)
  };
}

/* ============================================================
 * Stage 7: Self-service password change + order detail + warnings
 * ============================================================ */

export async function changeMobilePassword(userId, currentPlain, newPlain) {
  if (!userId) throw new Error('未登录');
  if (!newPlain || newPlain.length < 6) {
    throw new Error('新密码长度至少 6 位');
  }
  await initializeDatabase();
  const row = (
    await query(`SELECT password FROM admin_staff WHERE id = $1`, [Number(userId)])
  ).rows[0];
  if (!row) throw new Error('账号不存在');
  const ok = await verifyPassword(currentPlain ?? '', row.password);
  if (!ok) throw new Error('当前密码不正确');
  const hashed = await hashPassword(newPlain);
  await query(
    `UPDATE admin_staff SET password = $2, updated_at = $3 WHERE id = $1`,
    [Number(userId), hashed, now()]
  );
  return { ok: true };
}

export async function getMobileOrderDetail(id, user) {
  if (!id) return null;
  await initializeDatabase();
  // Accept either numeric id or order_no string (mobile list returns order_no as id).
  const lookup = String(id);
  const isNumeric = /^\d+$/.test(lookup);
  const order = (
    await query(
      `
        SELECT mo.id, mo.order_no, mo.status, mo.customer_type,
               mo.member_name, mo.member_phone, mo.sales_staff_name,
               mo.total_amount, mo.created_at, mo.company_id, mo.store_id,
               c.name AS company_name, cs.name AS store_name
        FROM member_orders mo
        INNER JOIN companies c ON c.id = mo.company_id
        LEFT JOIN company_stores cs ON cs.id = mo.store_id
        WHERE ${isNumeric ? 'mo.id = $1' : 'mo.order_no = $1'}
      `,
      [isNumeric ? Number(lookup) : lookup]
    )
  ).rows[0];
  if (!order) return null;
  if (user?.companyId && String(order.company_id) !== String(user.companyId)) {
    throw new Error('无权查看该订单');
  }
  const items = (
    await query(
      `
        SELECT moi.id, moi.quantity, moi.unit_price, moi.point_rebate_base,
               moi.writeoff_status,
               ps.sku_code, ps.spec, ps.unit, p.name AS product_name
        FROM member_order_items moi
        INNER JOIN product_skus ps ON ps.id = moi.sku_id
        INNER JOIN products p ON p.id = ps.product_id
        WHERE moi.member_order_id = $1
        ORDER BY moi.id
      `,
      [Number(id)]
    )
  ).rows;
  return {
    id: String(order.id),
    orderNo: order.order_no,
    status: order.status,
    customerType: order.customer_type,
    memberName: order.member_name,
    memberPhone: order.member_phone,
    salesStaffName: order.sales_staff_name,
    totalAmount: Number(order.total_amount ?? 0),
    createdAt:
      order.created_at instanceof Date
        ? order.created_at.toISOString()
        : String(order.created_at ?? ''),
    companyName: order.company_name,
    storeName: order.store_name ?? '',
    items: items.map((it) => ({
      id: String(it.id),
      productName: it.product_name,
      skuCode: it.sku_code,
      spec: it.spec,
      unit: it.unit,
      quantity: Number(it.quantity ?? 0),
      unitPrice: Number(it.unit_price ?? 0),
      pointsRebate: Number(it.point_rebate_base ?? 0),
      writeoffStatus: it.writeoff_status
    }))
  };
}

export async function getInventoryWarnings(companyId) {
  await initializeDatabase();
  const params = [];
  let scope = 'ci.safety_stock > 0 AND ci.quantity <= ci.safety_stock AND ci.delete_status = \'正常\'';
  if (companyId) {
    params.push(Number(companyId));
    scope += ` AND ci.company_id = $${params.length}`;
  }
  const rows = (
    await query(
      `
        SELECT ci.id, ci.company_id, ci.sku_id, ci.quantity, ci.safety_stock,
               c.name AS company_name,
               ps.sku_code, ps.spec, p.name AS product_name
        FROM company_inventory ci
        INNER JOIN companies c ON c.id = ci.company_id
        INNER JOIN product_skus ps ON ps.id = ci.sku_id
        INNER JOIN products p ON p.id = ps.product_id
        WHERE ${scope}
        ORDER BY (ci.quantity::float / NULLIF(ci.safety_stock, 0)::float) ASC, ci.company_id
        LIMIT 20
      `,
      params
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    companyId: String(r.company_id),
    companyName: r.company_name,
    productName: r.product_name,
    skuCode: r.sku_code,
    spec: r.spec ?? '',
    quantity: Number(r.quantity ?? 0),
    safetyStock: Number(r.safety_stock ?? 0)
  }));
}

/* ============================================================
 * Stage 8: 收钱吧 payment + 空中分账 (Phase 8.1 — schema + helpers)
 * ============================================================ */

let paymentTablesReady = false;

export async function ensurePaymentTables() {
  if (paymentTablesReady) return;
  await initializeDatabase();

  await query(`
    CREATE TABLE IF NOT EXISTS settlement_accounts (
      id SERIAL PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      account_type TEXT NOT NULL DEFAULT 'sqb_subacct',
      sqb_member_id TEXT NOT NULL DEFAULT '',
      real_name TEXT NOT NULL DEFAULT '',
      id_card_no_encrypted TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      account_no_encrypted TEXT NOT NULL DEFAULT '',
      kyc_status TEXT NOT NULL DEFAULT '待审核',
      kyc_notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '启用',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (owner_type, owner_id, account_type)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_split_rules (
      id SERIAL PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'global',
      scope_id TEXT NOT NULL DEFAULT '',
      recipient_type TEXT NOT NULL,
      recipient_account_id INTEGER REFERENCES settlement_accounts(id) ON DELETE SET NULL,
      rate_type TEXT NOT NULL,
      rate_value NUMERIC(12, 4) NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT '启用',
      remark TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_split_rules_scope ON payment_split_rules(scope, scope_id);`);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL DEFAULT 'writeoff',
      source_id INTEGER,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      store_id INTEGER REFERENCES company_stores(id) ON DELETE SET NULL,
      sales_staff_name TEXT NOT NULL DEFAULT '',
      amount NUMERIC(12, 2) NOT NULL,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '待支付',
      pay_way TEXT NOT NULL DEFAULT '',
      sqb_terminal_sn TEXT NOT NULL DEFAULT '',
      sqb_client_sn TEXT NOT NULL DEFAULT '',
      sqb_sn TEXT NOT NULL DEFAULT '',
      sqb_qr_code TEXT NOT NULL DEFAULT '',
      paid_at TIMESTAMPTZ,
      settled_at TIMESTAMPTZ,
      refunded_at TIMESTAMPTZ,
      refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      payer_uid TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_company ON payment_orders(company_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_store ON payment_orders(store_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_sqb_sn ON payment_orders(sqb_sn);`);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_splits (
      id SERIAL PRIMARY KEY,
      payment_order_id INTEGER NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
      rule_id INTEGER REFERENCES payment_split_rules(id) ON DELETE SET NULL,
      recipient_type TEXT NOT NULL,
      recipient_account_id INTEGER REFERENCES settlement_accounts(id) ON DELETE SET NULL,
      amount NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL DEFAULT '待分账',
      sqb_split_sn TEXT NOT NULL DEFAULT '',
      splitted_at TIMESTAMPTZ,
      error_msg TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_splits_order ON payment_splits(payment_order_id);`);

  await query(`
    CREATE TABLE IF NOT EXISTS payment_webhooks (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'shouqianba',
      event_type TEXT NOT NULL DEFAULT '',
      sqb_sn TEXT NOT NULL DEFAULT '',
      raw_body JSONB NOT NULL DEFAULT '{}'::jsonb,
      signature TEXT NOT NULL DEFAULT '',
      signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
      processed BOOLEAN NOT NULL DEFAULT FALSE,
      processed_at TIMESTAMPTZ,
      error_msg TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_payment_webhooks_sn ON payment_webhooks(sqb_sn);`);

  // Per-store terminal credentials (returned by SQB /terminal/activate, rotated via /terminal/checkin).
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS sqb_terminal_sn TEXT NOT NULL DEFAULT '';`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS sqb_terminal_key TEXT NOT NULL DEFAULT '';`);
  await query(`ALTER TABLE company_stores ADD COLUMN IF NOT EXISTS sqb_device_id TEXT NOT NULL DEFAULT '';`);

  paymentTablesReady = true;
}

/* ---------- order_no generator ---------- */

async function generatePaymentOrderNo(client, companyCode) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PAY-${companyCode || 'HQ'}-${today}-`;
  const res = await client.query(
    `SELECT order_no FROM payment_orders WHERE order_no LIKE $1 ORDER BY order_no DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const last = res.rows[0]?.order_no ?? '';
  let next = Number(last.slice(prefix.length)) + 1;
  if (!Number.isFinite(next) || next <= 0) next = 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/* ---------- payment_orders CRUD ---------- */

export async function createPaymentOrder(input) {
  await ensurePaymentTables();
  const ts = now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let companyCode = 'HQ';
    if (input.companyId) {
      const cRow = (
        await client.query(`SELECT code FROM companies WHERE id = $1`, [
          Number(input.companyId)
        ])
      ).rows[0];
      if (cRow?.code) companyCode = cRow.code;
    }
    const orderNo = await generatePaymentOrderNo(client, companyCode);
    const result = await client.query(
      `
        INSERT INTO payment_orders
          (order_no, source_type, source_id, company_id, store_id, sales_staff_name,
           amount, status, sqb_terminal_sn, sqb_client_sn, remark, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, '待支付', $8, $9, $10, $11, $11)
        RETURNING id, order_no
      `,
      [
        orderNo,
        input.sourceType ?? 'writeoff',
        input.sourceId ? Number(input.sourceId) : null,
        input.companyId ? Number(input.companyId) : null,
        input.storeId ? Number(input.storeId) : null,
        input.salesStaffName ?? '',
        Number(input.amount),
        input.sqbTerminalSn ?? '',
        orderNo, // use our order_no as client_sn for SQB (must be globally unique per merchant)
        input.remark ?? '',
        ts
      ]
    );
    await client.query('COMMIT');
    return { id: String(result.rows[0].id), orderNo: result.rows[0].order_no, clientSn: orderNo };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPaymentOrderById(id) {
  await ensurePaymentTables();
  const row = (
    await query(`SELECT * FROM payment_orders WHERE id = $1`, [Number(id)])
  ).rows[0];
  return row ?? null;
}

export async function getPaymentOrderBySqbSn(sn) {
  await ensurePaymentTables();
  const row = (
    await query(`SELECT * FROM payment_orders WHERE sqb_sn = $1 LIMIT 1`, [sn])
  ).rows[0];
  return row ?? null;
}

export async function getPaymentOrderByClientSn(clientSn) {
  await ensurePaymentTables();
  const row = (
    await query(`SELECT * FROM payment_orders WHERE sqb_client_sn = $1 LIMIT 1`, [clientSn])
  ).rows[0];
  return row ?? null;
}

export async function updatePaymentOrderAfterPrecreate(id, sqbSn, qrCode) {
  await query(
    `UPDATE payment_orders SET sqb_sn = $2, sqb_qr_code = $3, updated_at = $4 WHERE id = $1`,
    [Number(id), sqbSn, qrCode ?? '', now()]
  );
}

export async function markPaymentOrderPaid(id, paidAmount, payerUid, payWay, sqbSn) {
  await query(
    `
      UPDATE payment_orders
         SET status = '已支付',
             paid_amount = $2,
             payer_uid = $3,
             pay_way = $4,
             sqb_sn = COALESCE(NULLIF($5, ''), sqb_sn),
             paid_at = COALESCE(paid_at, NOW()),
             updated_at = NOW()
       WHERE id = $1 AND status IN ('待支付', '支付中')
    `,
    [Number(id), Number(paidAmount), payerUid ?? '', payWay ?? '', sqbSn ?? '']
  );
}

export async function markPaymentOrderRefunded(id, refundAmount) {
  const order = await getPaymentOrderById(id);
  if (!order) return;
  const newRefund = Number(order.refund_amount ?? 0) + Number(refundAmount);
  const fully = newRefund >= Number(order.paid_amount ?? 0);
  await query(
    `
      UPDATE payment_orders
         SET status = $2,
             refund_amount = $3,
             refunded_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
    `,
    [Number(id), fully ? '已退款' : '部分退款', newRefund]
  );
}

/* ---------- terminal credentials per store ---------- */

export async function getStoreTerminal(storeId) {
  await ensurePaymentTables();
  if (!storeId) return null;
  const row = (
    await query(
      `SELECT sqb_terminal_sn, sqb_terminal_key, sqb_device_id FROM company_stores WHERE id = $1`,
      [Number(storeId)]
    )
  ).rows[0];
  if (!row || !row.sqb_terminal_sn) return null;
  return {
    terminalSn: row.sqb_terminal_sn,
    terminalKey: row.sqb_terminal_key,
    deviceId: row.sqb_device_id
  };
}

export async function saveStoreTerminal(storeId, terminalSn, terminalKey, deviceId) {
  await ensurePaymentTables();
  await query(
    `UPDATE company_stores
        SET sqb_terminal_sn = $2,
            sqb_terminal_key = $3,
            sqb_device_id = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [Number(storeId), terminalSn ?? '', terminalKey ?? '', deviceId ?? '']
  );
}

/* ---------- split rules + execution log ---------- */

export async function listSplitRulesForContext({ companyId, storeId } = {}) {
  await ensurePaymentTables();
  const params = [];
  const orClauses = [`scope = 'global'`];
  if (companyId) {
    params.push(String(companyId));
    orClauses.push(`(scope = 'company' AND scope_id = $${params.length})`);
  }
  if (storeId) {
    params.push(String(storeId));
    orClauses.push(`(scope = 'store' AND scope_id = $${params.length})`);
  }
  const sql = `
    SELECT * FROM payment_split_rules
    WHERE status = '启用' AND (${orClauses.join(' OR ')})
    ORDER BY priority ASC, id ASC
  `;
  return (await query(sql, params)).rows;
}

/**
 * Seed default 4-way split rules (HQ 5% / branch 15% / store residual /
 * sales_staff 10% of store). Runs once; subsequent inserts are skipped if
 * any rule already exists. Idempotent.
 */
export async function seedDefaultSplitRules() {
  await ensurePaymentTables();
  const existing = Number(
    (await query(`SELECT COUNT(*)::int AS c FROM payment_split_rules`)).rows[0]
      .c
  );
  if (existing > 0) return;
  const ts = now();
  const seeds = [
    { scope: 'global', recipient_type: 'hq', rate_type: 'percent', rate_value: 0.05, priority: 10, remark: '总部技术服务费 5%' },
    { scope: 'global', recipient_type: 'company', rate_type: 'percent', rate_value: 0.15, priority: 50, remark: '分公司毛利 15%（默认）' },
    { scope: 'global', recipient_type: 'store', rate_type: 'residual', rate_value: 1.0, priority: 100, remark: '门店净收入（剩余）' },
    { scope: 'global', recipient_type: 'sales_staff', rate_type: 'percent_of_store', rate_value: 0.10, priority: 200, remark: '销售员提成（门店内部记账）' }
  ];
  for (const s of seeds) {
    await query(
      `INSERT INTO payment_split_rules
        (scope, scope_id, recipient_type, rate_type, rate_value, priority, status, remark, created_at, updated_at)
       VALUES ($1, '', $2, $3, $4, $5, '启用', $6, $7, $7)`,
      [s.scope, s.recipient_type, s.rate_type, s.rate_value, s.priority, s.remark, ts]
    );
  }
}

/**
 * Compute split amounts for a payment order using applicable rules.
 * Returns an array of { recipientType, recipientAccountId, amount, ruleId }.
 * Rule semantics:
 *   - 'percent'           : rate × paidAmount
 *   - 'fixed'             : rate (in yuan)
 *   - 'percent_of_store'  : rate × store residual (computed after store rule)
 *   - 'residual'          : whatever is left after percent/fixed rules
 *
 * Math is in yuan, rounded down to 分 (2 decimals). The residual rule
 * (priority 100, store) absorbs rounding so totals always reconcile.
 */
export async function computeSplitsForPayment(paymentOrderId) {
  await ensurePaymentTables();
  const order = await getPaymentOrderById(paymentOrderId);
  if (!order) throw new Error('支付订单不存在');
  const paidAmount = Number(order.paid_amount ?? 0);
  if (paidAmount <= 0) return [];

  const rules = await listSplitRulesForContext({
    companyId: order.company_id,
    storeId: order.store_id
  });

  const accounts = await listSettlementAccountsByContext({
    companyId: order.company_id,
    storeId: order.store_id
  });
  const accountByType = new Map();
  for (const a of accounts) {
    if (!accountByType.has(a.owner_type)) accountByType.set(a.owner_type, a);
  }

  let storeAmount = 0;
  const splits = [];

  // Pass 1: percent + fixed (excluding residual + percent_of_store)
  for (const r of rules) {
    if (r.rate_type === 'residual' || r.rate_type === 'percent_of_store') continue;
    let amount = 0;
    if (r.rate_type === 'percent') amount = paidAmount * Number(r.rate_value);
    else if (r.rate_type === 'fixed') amount = Number(r.rate_value);
    amount = Math.floor(amount * 100) / 100;
    if (amount <= 0) continue;
    splits.push({
      ruleId: r.id,
      recipientType: r.recipient_type,
      recipientAccountId: accountByType.get(r.recipient_type)?.id ?? null,
      amount
    });
  }

  // Pass 2: residual goes to store; rounding absorbed here
  const allocated = splits.reduce((sum, s) => sum + s.amount, 0);
  const residual = Math.max(0, Math.floor((paidAmount - allocated) * 100) / 100);
  for (const r of rules) {
    if (r.rate_type !== 'residual') continue;
    storeAmount = residual;
    if (storeAmount <= 0) continue;
    splits.push({
      ruleId: r.id,
      recipientType: r.recipient_type,
      recipientAccountId: accountByType.get(r.recipient_type)?.id ?? null,
      amount: storeAmount
    });
    break;
  }

  // Pass 3: percent_of_store (sales staff commission — internal accounting,
  // does NOT add to total payout; we record it but route to store account)
  for (const r of rules) {
    if (r.rate_type !== 'percent_of_store') continue;
    let amount = storeAmount * Number(r.rate_value);
    amount = Math.floor(amount * 100) / 100;
    if (amount <= 0) continue;
    splits.push({
      ruleId: r.id,
      recipientType: r.recipient_type,
      // Sales_staff commission lands in store account; flag via account id.
      recipientAccountId: accountByType.get('store')?.id ?? null,
      amount
    });
  }

  return splits;
}

export async function listSettlementAccountsByContext({ companyId, storeId } = {}) {
  await ensurePaymentTables();
  // Match by owner_type chain — hq applies always; company matches its id;
  // store matches its id; sales_staff is store-scoped but settled to store.
  const params = [];
  const conds = [`status = '启用'`];
  const orClauses = [`owner_type = 'hq'`];
  if (companyId) {
    params.push(String(companyId));
    orClauses.push(`(owner_type = 'company' AND owner_id = $${params.length})`);
  }
  if (storeId) {
    params.push(String(storeId));
    orClauses.push(`(owner_type = 'store' AND owner_id = $${params.length})`);
  }
  conds.push(`(${orClauses.join(' OR ')})`);
  return (
    await query(
      `SELECT * FROM settlement_accounts WHERE ${conds.join(' AND ')}`,
      params
    )
  ).rows;
}

/**
 * Look up the sale_price for a writeoff (via member_order_items → product_skus).
 * Falls back to redeem_points_price/100 when sale_price is 0 (so mock data
 * with no real prices still produces a non-zero amount).
 */
export async function getWriteoffPayableAmount(writeoffId) {
  if (!writeoffId) return null;
  await initializeDatabase();
  const row = (
    await query(
      `
        SELECT w.id, w.sku_id, w.member_order_id, w.store_id,
               ps.sale_price, ps.redeem_points_price,
               moi.unit_price, moi.quantity
        FROM writeoff_records w
        LEFT JOIN product_skus ps ON ps.id = w.sku_id
        LEFT JOIN member_order_items moi
               ON moi.member_order_id = w.member_order_id
              AND moi.sku_id = w.sku_id
        WHERE w.id = $1
        LIMIT 1
      `,
      [Number(writeoffId)]
    )
  ).rows[0];
  if (!row) return null;
  const unit = Number(row.unit_price ?? row.sale_price ?? 0);
  const qty = Number(row.quantity ?? 1);
  let amount = unit * qty;
  if (amount <= 0) {
    // Mock-data fallback: 1 redeem_points_price unit ≈ 1 yuan
    amount = Number(row.redeem_points_price ?? 0) / 10;
  }
  return Math.max(0, Math.floor(amount * 100) / 100);
}

/**
 * Reverse a writeoff: flip status, restore inventory, mark items as 待核销
 * again. Wrapped in a transaction so a partial refund + restore can't
 * leave the system inconsistent.
 */
export async function revertWriteoff(writeoffId, actor) {
  if (!writeoffId) return;
  await initializeDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const w = (
      await client.query(
        `SELECT id, member_order_id, sku_id, store_id, status FROM writeoff_records WHERE id = $1 FOR UPDATE`,
        [Number(writeoffId)]
      )
    ).rows[0];
    if (!w) {
      await client.query('ROLLBACK');
      return;
    }
    if (w.status === '已撤销') {
      await client.query('COMMIT');
      return;
    }
    await client.query(
      `UPDATE writeoff_records SET status = '已撤销', remark = COALESCE(remark, '') || ' [撤销:' || $2 || ']' WHERE id = $1`,
      [Number(w.id), String(actor ?? '系统').slice(0, 64)]
    );
    if (w.member_order_id) {
      await client.query(
        `UPDATE member_order_items SET writeoff_status = '待核销'
         WHERE member_order_id = $1 AND sku_id = $2`,
        [Number(w.member_order_id), Number(w.sku_id)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function recordPaymentSplit({
  paymentOrderId,
  ruleId,
  recipientType,
  recipientAccountId,
  amount
}) {
  await ensurePaymentTables();
  const ts = now();
  const result = await query(
    `
      INSERT INTO payment_splits
        (payment_order_id, rule_id, recipient_type, recipient_account_id, amount, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, '待分账', $6, $6)
      RETURNING id
    `,
    [
      Number(paymentOrderId),
      ruleId ? Number(ruleId) : null,
      recipientType,
      recipientAccountId ? Number(recipientAccountId) : null,
      Number(amount),
      ts
    ]
  );
  return String(result.rows[0].id);
}

export async function markPaymentSplitDone(id, sqbSplitSn) {
  await query(
    `UPDATE payment_splits SET status = '已分账', sqb_split_sn = $2, splitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [Number(id), sqbSplitSn ?? '']
  );
}

export async function markPaymentSplitFailed(id, errorMsg) {
  await query(
    `UPDATE payment_splits SET status = '失败', error_msg = $2, updated_at = NOW() WHERE id = $1`,
    [Number(id), String(errorMsg ?? '').slice(0, 500)]
  );
}

export async function listPaymentSplits(paymentOrderId) {
  await ensurePaymentTables();
  const rows = (
    await query(
      `SELECT * FROM payment_splits WHERE payment_order_id = $1 ORDER BY id`,
      [Number(paymentOrderId)]
    )
  ).rows;
  return rows;
}

/* ---------- webhook log ---------- */

export async function recordPaymentWebhook({
  eventType,
  sqbSn,
  rawBody,
  signature,
  signatureValid
}) {
  await ensurePaymentTables();
  const result = await query(
    `
      INSERT INTO payment_webhooks
        (event_type, sqb_sn, raw_body, signature, signature_valid, created_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
      RETURNING id
    `,
    [
      eventType ?? '',
      sqbSn ?? '',
      JSON.stringify(rawBody ?? {}),
      signature ?? '',
      Boolean(signatureValid)
    ]
  );
  return String(result.rows[0].id);
}

export async function markWebhookProcessed(id, errorMsg) {
  await query(
    `UPDATE payment_webhooks SET processed = TRUE, processed_at = NOW(), error_msg = $2 WHERE id = $1`,
    [Number(id), String(errorMsg ?? '').slice(0, 500)]
  );
}

/* ---------- settlement_accounts CRUD ---------- */

export async function listSettlementAccounts({ ownerType, ownerId } = {}) {
  await ensurePaymentTables();
  const params = [];
  const conds = [`status = '启用'`];
  if (ownerType) {
    params.push(ownerType);
    conds.push(`owner_type = $${params.length}`);
  }
  if (ownerId) {
    params.push(String(ownerId));
    conds.push(`owner_id = $${params.length}`);
  }
  const rows = (
    await query(
      `SELECT * FROM settlement_accounts WHERE ${conds.join(' AND ')} ORDER BY id`,
      params
    )
  ).rows;
  return rows;
}

export async function upsertSettlementAccount(input) {
  await ensurePaymentTables();
  const ts = now();
  const result = await query(
    `
      INSERT INTO settlement_accounts
        (owner_type, owner_id, account_type, sqb_member_id, real_name,
         id_card_no_encrypted, phone, account_no_encrypted, kyc_status, kyc_notes,
         status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '启用', $11, $11)
      ON CONFLICT (owner_type, owner_id, account_type) DO UPDATE SET
        sqb_member_id = EXCLUDED.sqb_member_id,
        real_name = EXCLUDED.real_name,
        id_card_no_encrypted = EXCLUDED.id_card_no_encrypted,
        phone = EXCLUDED.phone,
        account_no_encrypted = EXCLUDED.account_no_encrypted,
        kyc_status = EXCLUDED.kyc_status,
        kyc_notes = EXCLUDED.kyc_notes,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [
      input.ownerType,
      String(input.ownerId),
      input.accountType ?? 'sqb_subacct',
      input.sqbMemberId ?? '',
      input.realName ?? '',
      input.idCardNoEncrypted ?? '',
      input.phone ?? '',
      input.accountNoEncrypted ?? '',
      input.kycStatus ?? '待审核',
      input.kycNotes ?? '',
      ts
    ]
  );
  return String(result.rows[0].id);
}

/* ============================================================
 * Stage 8 Phase 8.8: 对账 cron + 漂移检测
 * ============================================================ */

let reconciliationTableReady = false;

export async function ensureReconciliationTable() {
  if (reconciliationTableReady) return;
  await ensurePaymentTables();
  await query(`
    CREATE TABLE IF NOT EXISTS payment_reconciliation_log (
      id SERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      run_date DATE NOT NULL,
      payment_order_id INTEGER REFERENCES payment_orders(id) ON DELETE SET NULL,
      order_no TEXT NOT NULL DEFAULT '',
      sqb_sn TEXT NOT NULL DEFAULT '',
      our_status TEXT NOT NULL DEFAULT '',
      sqb_status TEXT NOT NULL DEFAULT '',
      drift_type TEXT NOT NULL,
      action_taken TEXT NOT NULL DEFAULT '',
      raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_log_run ON payment_reconciliation_log(run_id);`
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_log_date ON payment_reconciliation_log(run_date);`
  );
  reconciliationTableReady = true;
}

export async function listPaymentsForReconciliation(date) {
  await ensurePaymentTables();
  // Paid + already-split orders settled on the target date are the
  // candidates we want SQB to confirm. We also include 已退款/部分退款
  // so refund drift gets caught.
  const rows = (
    await query(
      `
        SELECT po.id, po.order_no, po.status, po.sqb_sn, po.sqb_client_sn,
               po.amount, po.paid_amount, po.refund_amount, po.store_id,
               po.paid_at, po.refunded_at
        FROM payment_orders po
        WHERE (
          (po.paid_at IS NOT NULL AND po.paid_at::date = $1::date)
          OR (po.refunded_at IS NOT NULL AND po.refunded_at::date = $1::date)
        )
        AND po.sqb_sn NOT LIKE 'MOCK-%'
        ORDER BY po.id
      `,
      [date]
    )
  ).rows;
  return rows;
}

export async function recordReconciliationDrift({
  runId,
  runDate,
  paymentOrderId,
  orderNo,
  sqbSn,
  ourStatus,
  sqbStatus,
  driftType,
  actionTaken,
  rawResponse
}) {
  await ensureReconciliationTable();
  await query(
    `
      INSERT INTO payment_reconciliation_log
        (run_id, run_date, payment_order_id, order_no, sqb_sn,
         our_status, sqb_status, drift_type, action_taken, raw_response, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
    `,
    [
      runId,
      runDate,
      paymentOrderId ? Number(paymentOrderId) : null,
      orderNo ?? '',
      sqbSn ?? '',
      ourStatus ?? '',
      sqbStatus ?? '',
      driftType,
      actionTaken ?? '',
      JSON.stringify(rawResponse ?? {})
    ]
  );
}

export async function getLatestReconciliationRun() {
  await ensureReconciliationTable();
  const row = (
    await query(
      `SELECT run_id, run_date, COUNT(*)::int AS drift_count, MAX(created_at) AS finished_at
       FROM payment_reconciliation_log
       GROUP BY run_id, run_date
       ORDER BY MAX(created_at) DESC
       LIMIT 1`
    )
  ).rows[0];
  return row ?? null;
}

export async function listReconciliationDriftsByRun(runId) {
  await ensureReconciliationTable();
  const rows = (
    await query(
      `SELECT * FROM payment_reconciliation_log WHERE run_id = $1 ORDER BY id`,
      [runId]
    )
  ).rows;
  return rows;
}

/* ============================================================
 * Stage 8: store terminal listing for admin UI
 * ============================================================ */

export async function listAllSplitRules({ scope } = {}) {
  await ensurePaymentTables();
  const params = [];
  const conds = [];
  if (scope) {
    params.push(scope);
    conds.push(`scope = $${params.length}`);
  }
  const sql = `
    SELECT psr.id, psr.scope, psr.scope_id, psr.recipient_type,
           psr.recipient_account_id, psr.rate_type, psr.rate_value,
           psr.priority, psr.status, psr.remark,
           psr.created_at, psr.updated_at,
           sa.real_name AS recipient_real_name,
           sa.owner_type AS recipient_owner_type
    FROM payment_split_rules psr
    LEFT JOIN settlement_accounts sa ON sa.id = psr.recipient_account_id
    ${conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : ''}
    ORDER BY psr.priority ASC, psr.id ASC
  `;
  const rows = (await query(sql, params)).rows;
  return rows.map((r) => ({
    id: String(r.id),
    scope: r.scope,
    scopeId: r.scope_id ?? '',
    recipientType: r.recipient_type,
    recipientAccountId: r.recipient_account_id ? String(r.recipient_account_id) : '',
    recipientName: r.recipient_real_name ?? '',
    rateType: r.rate_type,
    rateValue: Number(r.rate_value ?? 0),
    priority: Number(r.priority ?? 100),
    status: r.status,
    remark: r.remark ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export async function createSplitRule(input) {
  await ensurePaymentTables();
  const ts = now();
  const result = await query(
    `
      INSERT INTO payment_split_rules
        (scope, scope_id, recipient_type, recipient_account_id, rate_type,
         rate_value, priority, status, remark, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      RETURNING id
    `,
    [
      input.scope ?? 'global',
      input.scopeId ?? '',
      input.recipientType,
      input.recipientAccountId ? Number(input.recipientAccountId) : null,
      input.rateType,
      Number(input.rateValue ?? 0),
      Number(input.priority ?? 100),
      input.status ?? '启用',
      input.remark ?? '',
      ts
    ]
  );
  return String(result.rows[0].id);
}

export async function updateSplitRule(id, input) {
  await ensurePaymentTables();
  const updates = [];
  const params = [Number(id)];
  if (input.scope !== undefined) {
    params.push(input.scope);
    updates.push(`scope = $${params.length}`);
  }
  if (input.scopeId !== undefined) {
    params.push(input.scopeId);
    updates.push(`scope_id = $${params.length}`);
  }
  if (input.recipientType !== undefined) {
    params.push(input.recipientType);
    updates.push(`recipient_type = $${params.length}`);
  }
  if (input.recipientAccountId !== undefined) {
    params.push(input.recipientAccountId ? Number(input.recipientAccountId) : null);
    updates.push(`recipient_account_id = $${params.length}`);
  }
  if (input.rateType !== undefined) {
    params.push(input.rateType);
    updates.push(`rate_type = $${params.length}`);
  }
  if (input.rateValue !== undefined) {
    params.push(Number(input.rateValue));
    updates.push(`rate_value = $${params.length}`);
  }
  if (input.priority !== undefined) {
    params.push(Number(input.priority));
    updates.push(`priority = $${params.length}`);
  }
  if (input.status !== undefined) {
    params.push(input.status);
    updates.push(`status = $${params.length}`);
  }
  if (input.remark !== undefined) {
    params.push(input.remark);
    updates.push(`remark = $${params.length}`);
  }
  if (updates.length === 0) return;
  params.push(now());
  updates.push(`updated_at = $${params.length}`);
  await query(
    `UPDATE payment_split_rules SET ${updates.join(', ')} WHERE id = $1`,
    params
  );
}

export async function deleteSplitRule(id) {
  await ensurePaymentTables();
  // Soft-delete via status flip — preserves audit trail in payment_splits.
  await query(
    `UPDATE payment_split_rules SET status = '停用', updated_at = $2 WHERE id = $1`,
    [Number(id), now()]
  );
}

export async function getSplitRuleById(id) {
  await ensurePaymentTables();
  const row = (
    await query(`SELECT * FROM payment_split_rules WHERE id = $1`, [Number(id)])
  ).rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    scope: row.scope,
    scopeId: row.scope_id ?? '',
    recipientType: row.recipient_type,
    recipientAccountId: row.recipient_account_id ? String(row.recipient_account_id) : '',
    rateType: row.rate_type,
    rateValue: Number(row.rate_value ?? 0),
    priority: Number(row.priority ?? 100),
    status: row.status,
    remark: row.remark ?? ''
  };
}

export async function listStoresWithSqbTerminal({ search = '' } = {}) {
  await ensurePaymentTables();
  const params = [];
  const conds = [`company_stores.delete_status = '正常'`];
  if (search) {
    params.push(`%${search}%`);
    conds.push(
      `(company_stores.name ILIKE $${params.length} OR companies.name ILIKE $${params.length} OR company_stores.manager_phone ILIKE $${params.length})`
    );
  }
  const rows = (
    await query(
      `
        SELECT company_stores.id, company_stores.name AS store_name,
               company_stores.manager_name, company_stores.manager_phone,
               company_stores.sqb_terminal_sn, company_stores.sqb_device_id,
               companies.id AS company_id, companies.name AS company_name
        FROM company_stores
        INNER JOIN companies ON companies.id = company_stores.company_id
        WHERE ${conds.join(' AND ')}
        ORDER BY companies.name, company_stores.id
        LIMIT 500
      `,
      params
    )
  ).rows;
  return rows.map((r) => ({
    id: String(r.id),
    storeName: r.store_name ?? '',
    companyId: String(r.company_id ?? ''),
    companyName: r.company_name ?? '',
    managerName: r.manager_name ?? '',
    managerPhone: r.manager_phone ?? '',
    sqbTerminalSn: r.sqb_terminal_sn ?? '',
    sqbDeviceId: r.sqb_device_id ?? '',
    activated: Boolean(r.sqb_terminal_sn)
  }));
}

// ===== 应用发布（APK 下载分发）=====
let appReleasesReady;
async function ensureAppReleasesTable() {
  if (appReleasesReady) return appReleasesReady;
  appReleasesReady = query(`
    CREATE TABLE IF NOT EXISTS app_releases (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL DEFAULT 'android',
      version TEXT NOT NULL,
      version_code INTEGER NOT NULL DEFAULT 0,
      file_key TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      file_size BIGINT NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
  await appReleasesReady;
  return appReleasesReady;
}

function mapAppRelease(r) {
  return {
    id: String(r.id),
    platform: r.platform,
    version: r.version,
    versionCode: Number(r.version_code ?? 0),
    fileKey: r.file_key,
    fileName: r.file_name ?? '',
    fileSize: Number(r.file_size ?? 0),
    notes: r.notes ?? '',
    isActive: Boolean(r.is_active),
    createdBy: r.created_by ?? '',
    createdAt: r.created_at
  };
}

export async function listAppReleases(platform = 'android') {
  await ensureAppReleasesTable();
  const rows = (
    await query(`SELECT * FROM app_releases WHERE platform = $1 ORDER BY id DESC`, [platform])
  ).rows;
  return rows.map(mapAppRelease);
}

export async function createAppRelease(input) {
  await ensureAppReleasesTable();
  const platform = input.platform || 'android';
  // 同平台旧版本全部置为非当前
  await query(`UPDATE app_releases SET is_active = FALSE WHERE platform = $1`, [platform]);
  const row = (
    await query(
      `
        INSERT INTO app_releases
          (platform, version, version_code, file_key, file_name, file_size, notes, is_active, created_by, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9)
        RETURNING *
      `,
      [
        platform,
        String(input.version ?? '').trim(),
        Number(input.versionCode ?? 0),
        String(input.fileKey ?? '').trim(),
        String(input.fileName ?? '').trim(),
        Number(input.fileSize ?? 0),
        String(input.notes ?? ''),
        String(input.createdBy ?? ''),
        now()
      ]
    )
  ).rows[0];
  return mapAppRelease(row);
}

export async function getLatestAppRelease(platform = 'android') {
  await ensureAppReleasesTable();
  const row = (
    await query(
      `SELECT * FROM app_releases WHERE platform = $1 AND is_active = TRUE ORDER BY id DESC LIMIT 1`,
      [platform]
    )
  ).rows[0];
  return row ? mapAppRelease(row) : null;
}

export async function setAppReleaseActive(id) {
  await ensureAppReleasesTable();
  const target = (await query(`SELECT * FROM app_releases WHERE id = $1`, [Number(id)])).rows[0];
  if (!target) return null;
  await query(`UPDATE app_releases SET is_active = FALSE WHERE platform = $1`, [target.platform]);
  const row = (
    await query(`UPDATE app_releases SET is_active = TRUE WHERE id = $1 RETURNING *`, [Number(id)])
  ).rows[0];
  return mapAppRelease(row);
}

export async function deleteAppRelease(id) {
  await ensureAppReleasesTable();
  await query(`DELETE FROM app_releases WHERE id = $1`, [Number(id)]);
  return { ok: true };
}
