import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { hashPassword, isPasswordHash, verifyPassword } from './auth/password.js';

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

function now() {
  return new Date().toISOString();
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

async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      role_name TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
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
      manager_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      status TEXT NOT NULL,
      available_points NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_points NUMERIC(12, 2) NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
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
      status TEXT NOT NULL,
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
      points_price NUMERIC(12, 2) NOT NULL,
      redeem_points_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_adjustments (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      change_type TEXT NOT NULL,
      points_amount NUMERIC(12, 2) NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      points_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      remark TEXT NOT NULL DEFAULT '',
      abnormal_flag BOOLEAN NOT NULL DEFAULT FALSE,
      approval_status TEXT NOT NULL,
      points_deducted BOOLEAN NOT NULL DEFAULT FALSE,
      stock_received BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      points_unit_price NUMERIC(12, 2) NOT NULL,
      subtotal_points NUMERIC(12, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member_orders (
      id SERIAL PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id INTEGER NOT NULL REFERENCES company_stores(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      sales_staff_name TEXT NOT NULL,
      member_name TEXT NOT NULL,
      member_phone TEXT NOT NULL,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
      stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
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
      last_login TEXT NOT NULL,
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
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
}

async function migrateTables() {
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS redeem_points_price NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await query(`
    UPDATE product_skus
    SET
      name = CASE WHEN name = '' THEN sku_code ELSE name END,
      redeem_points_price = CASE WHEN redeem_points_price = 0 THEN points_price ELSE redeem_points_price END,
      sale_price = CASE WHEN sale_price = 0 THEN points_price ELSE sale_price END
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
}

async function seedRoles() {
  const timestamp = now();
  const roles = [
    ['超级管理员', '平台', '启用', '拥有全部后台菜单、数据与配置权限。'],
    ['总部运营', '平台', '启用', '负责商品、分公司、订货单、会员订单日常管理。'],
    ['总部审核员', '平台', '启用', '负责积分调整、库存调整和异常订货单审核。'],
    ['商品管理员', '平台', '启用', '负责商品主数据与 SKU 维护。'],
    ['分公司管理员', '分公司', '启用', '负责所属分公司门店、库存和会员订单管理。'],
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
    ['积分管理', '查看积分调整记录', 'points:view', '页面', '启用'],
    ['积分管理', '编辑积分调整记录', 'points:edit', '按钮', '启用'],
    ['积分管理', '审核积分调整', 'points:approve', '按钮', '启用'],
    ['后台员工', '查看员工列表', 'staff:view', '页面', '启用'],
    ['后台员工', '编辑员工账号', 'staff:edit', '按钮', '启用'],
    ['角色管理', '查看角色列表', 'roles:view', '页面', '启用'],
    ['角色管理', '编辑角色信息', 'roles:edit', '按钮', '启用'],
    ['角色管理', '配置角色权限', 'roles:grant', '按钮', '启用'],
    ['权限管理', '查看权限列表', 'permissions:view', '页面', '启用'],
    ['权限管理', '编辑权限点', 'permissions:edit', '按钮', '启用'],
    ['会员管理', '查看会员列表', 'members:view', '页面', '启用'],
    ['会员管理', '编辑会员档案', 'members:edit', '按钮', '启用'],
    ['数据报表', '查看数据报表', 'reports:view', '页面', '启用'],
    ['协同看板', '查看协同看板', 'kanban:view', '页面', '启用'],
    ['通知中心', '查看通知中心', 'notifications:view', '页面', '启用'],
    ['系统设置', '查看系统设置', 'settings:view', '页面', '启用']
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
      'points:view',
      'staff:view',
      'roles:view',
      'permissions:view',
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
      'points:view',
      'points:approve',
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
      'points:view',
      'notifications:view'
    ],
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
          (name, code, manager_name, contact_phone, status, available_points, total_points, notes, created_at, updated_at)
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
  const stores = [
    [companyMap['BR-EAST-001'], '静安寺社区门店', 'ST-EAST-001', '上海市静安区南京西路 1888 号', '陈雪', '营业中'],
    [companyMap['BR-EAST-001'], '陆家嘴社区门店', 'ST-EAST-002', '上海市浦东新区银城中路 66 号', '李韬', '营业中'],
    [companyMap['BR-EAST-001'], '万象城社区门店', 'ST-EAST-003', '杭州市拱墅区丰潭路 380 号', '宋宁', '营业中'],
    [companyMap['BR-SOUTH-001'], '天河城社区门店', 'ST-SOUTH-001', '广州市天河区天河路 208 号', '周敏', '筹备中'],
    [companyMap['BR-WEST-001'], 'IFS 社区门店', 'ST-WEST-001', '成都市锦江区红星路三段 1 号', '吴哲', '营业中']
  ];

  for (const store of stores) {
    await query(
      `
        INSERT INTO company_stores
          (company_id, name, code, address, manager_name, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
          (product_id, name, sku_code, spec, packaging, unit, barcode, qr_code, image_url, points_price, redeem_points_price, sale_price, status, created_at, updated_at)
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
  const staff = [
    ['林可', 'admin', 'admin123', '产品技术中心', roleMap['超级管理员'], null, null, '在职', '13800122233', 'linke@miliguan.local', '今天 09:21'],
    ['赵晴', 'operator', 'operator123', '总部运营部', roleMap['总部运营'], companyMap['BR-EAST-001'], null, '在职', '13911232211', 'zhaoqing@miliguan.local', '今天 10:05'],
    ['周筱', 'auditor', 'auditor123', '总部审核组', roleMap['总部审核员'], null, null, '在职', '13722090021', 'zhouxiao@miliguan.local', '昨天 18:42'],
    ['郑南', 'product', 'product123', '商品中心', roleMap['商品管理员'], null, null, '在职', '13688912032', 'zhengnan@miliguan.local', '昨天 14:16'],
    ['陈卓', 'branch', 'branch123', '华东分公司', roleMap['分公司管理员'], companyMap['BR-EAST-001'], storeMap['ST-EAST-001'], '在职', '13577881209', 'chenzhuo@miliguan.local', '今天 08:48'],
    ['吴敏', 'boss', 'boss123', '经营管理中心', roleMap['老板视图账号'], null, null, '在职', '13677701120', 'wumin@miliguan.local', '2026-04-03 09:12']
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
    await query('UPDATE admin_staff SET password = $1, updated_at = $2 WHERE id = $3', [
      hashed,
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
  const count = Number((await query('SELECT COUNT(*)::int AS count FROM point_adjustments')).rows[0].count);
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
        INSERT INTO point_adjustments
          (company_id, change_type, points_amount, reason, status, created_by, created_at, updated_at)
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
  const skus = (await query('SELECT id, sku_code, points_price FROM product_skus')).rows;
  const skuMap = Object.fromEntries(skus.map((item) => [item.sku_code, item]));
  const timestamp = now();
  const orders = [
    ['PO-202604-001', companyMap['BR-EAST-001'], '已入库', 540, '为会员活动备货', false, '已通过', true, true, 'SKU-COFFEE-BOX-01', 3],
    ['PO-202604-002', companyMap['BR-SOUTH-001'], '待审核', 1320, '新店开业首批订货', true, '待审核', false, false, 'SKU-TEA-BOX-01', 6],
    ['PO-202604-003', companyMap['BR-WEST-001'], '待入库', 192, '早餐组合补货', false, '自动通过', true, false, 'SKU-SNACK-BOX-01', 2]
  ];

  for (const order of orders) {
    const [orderNo, companyId, status, pointsTotal, remark, abnormalFlag, approvalStatus, pointsDeducted, stockReceived, skuCode, quantity] = order;
    const result = await query(
      `
        INSERT INTO purchase_orders
          (order_no, company_id, status, points_total, remark, abnormal_flag, approval_status, points_deducted, stock_received, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (order_no) DO NOTHING
        RETURNING id
      `,
      [orderNo, companyId, status, pointsTotal, remark, abnormalFlag, approvalStatus, pointsDeducted, stockReceived, timestamp, timestamp]
    );

    const purchaseOrderId =
      result.rows[0]?.id ??
      (await query('SELECT id FROM purchase_orders WHERE order_no = $1', [orderNo])).rows[0].id;
    const sku = skuMap[skuCode];
    await query(
      `
        INSERT INTO purchase_order_items
          (purchase_order_id, sku_id, quantity, points_unit_price, subtotal_points)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [purchaseOrderId, sku.id, quantity, sku.points_price, toNumber(sku.points_price) * quantity]
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
  const pointAdjustments = (await query('SELECT id FROM point_adjustments ORDER BY id ASC')).rows;
  const timestamp = now();

  await query(
    `
      INSERT INTO approval_logs (entity_type, entity_id, action, result, note, created_by, created_at)
      VALUES
        ('purchase_order', $1, '自动审核', '已通过', '系统自动扣减积分并进入待入库', '系统', $3),
        ('purchase_order', $2, '人工审核', '待审核', '分公司积分不足，等待总部审核', '周筱', $3),
        ('point_adjustment', $4, '积分调整', '待审核', '等待总部审核员确认', '周筱', $3)
    `,
    [String(purchaseOrders[0].id), String(purchaseOrders[1].id), timestamp, String(pointAdjustments[1].id)]
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
    ['points.rebate_ratio', '积分规则', '核销积分回调比例', '0.08', '核销成功后按订单金额的 8% 回调积分', '林可'],
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
      await seedRedeemItems();
      await seedRedeemOrders();
    })().catch((error) => {
      initializedPromise = undefined;
      throw error;
    });
  }

  await initializedPromise;
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

export async function listStores({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  if (search) {
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword);
    where.push(
      '(company_stores.name ILIKE $1 OR company_stores.manager_name ILIKE $2 OR companies.name ILIKE $3)'
    );
  }
  if (status !== 'all') {
    params.push(status);
    where.push(`company_stores.status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = (
    await query(
      `
        SELECT
          company_stores.id,
          company_stores.name,
          company_stores.manager_name,
          companies.name AS city,
          company_stores.status,
          COUNT(DISTINCT admin_staff.id)::int AS staff_count,
          COALESCE(SUM(member_orders.total_amount), 0) AS monthly_revenue
        FROM company_stores
        INNER JOIN companies ON companies.id = company_stores.company_id
        LEFT JOIN admin_staff ON admin_staff.store_id = company_stores.id
        LEFT JOIN member_orders ON member_orders.store_id = company_stores.id
        ${whereClause}
        GROUP BY company_stores.id, companies.name
        ORDER BY company_stores.id DESC
      `,
      params
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    manager_name: row.manager_name,
    city: row.city,
    status: row.status,
    staff_count: toNumber(row.staff_count),
    monthly_revenue: toNumber(row.monthly_revenue)
  }));
}

export async function listAdminStaff({ search = '', role = 'all' } = {}) {
  await initializeDatabase();
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
    filterValue: role,
    orderBy: 'admin_staff.id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
  return rows.map((row) => ({
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
  }));
}

export async function listMembers({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const queryData = buildListQuery({
    baseQuery: 'SELECT id, name, level, tags, city, status, total_spent FROM members',
    searchColumns: ['name', 'tags', 'city'],
    search,
    filterColumn: 'status',
    filterValue: status,
    orderBy: 'id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    level: row.level,
    tags: row.tags,
    city: row.city,
    status: row.status,
    total_spent: toNumber(row.total_spent)
  }));
}

export async function listRoles({ search = '', scope = 'all' } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];

  if (search) {
    const value = `%${search}%`;
    params.push(value, value, value);
    where.push('(roles.role_name ILIKE $1 OR roles.description ILIKE $2 OR roles.scope ILIKE $3)');
  }

  if (scope && scope !== 'all') {
    params.push(scope);
    where.push(`roles.scope = $${params.length}`);
  }

  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const rows = (
    await query(
      `
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
        ORDER BY roles.id DESC
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    role_name: row.role_name,
    scope: row.scope,
    status: row.status,
    description: row.description,
    member_count: toNumber(row.member_count)
  }));
}

export async function listPermissions({ search = '', level = 'all' } = {}) {
  await initializeDatabase();
  const queryData = buildListQuery({
    baseQuery: 'SELECT id, module, permission_name, code, level, status FROM permissions',
    searchColumns: ['module', 'permission_name', 'code', 'level'],
    search,
    filterColumn: 'level',
    filterValue: level,
    orderBy: 'id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
  return rows.map((row) => ({
    id: String(row.id),
    module: row.module,
    permission_name: row.permission_name,
    code: row.code,
    level: row.level,
    status: row.status
  }));
}

export async function listProducts({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  if (search) {
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
    where.push(
      '(products.spu_code ILIKE $1 OR products.name ILIKE $2 OR products.brand ILIKE $3 OR products.category ILIKE $4)'
    );
  }
  if (status !== 'all') {
    params.push(status);
    where.push(`products.status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = (
    await query(
      `
        SELECT
          products.id,
          products.spu_code,
          products.name,
          products.brand,
          products.category,
          products.scenario,
          products.status,
          COUNT(product_skus.id)::int AS sku_count,
          COALESCE(MIN(product_skus.points_price), 0) AS points_price
        FROM products
        LEFT JOIN product_skus ON product_skus.product_id = products.id
        ${whereClause}
        GROUP BY products.id
        ORDER BY products.id DESC
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    spu_code: row.spu_code,
    name: row.name,
    brand: row.brand,
    category: row.category,
    scenario: row.scenario,
    status: row.status,
    sku_count: toNumber(row.sku_count),
    points_price: toNumber(row.points_price)
  }));
}

export async function listCompanies({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  if (search) {
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword);
    where.push('(companies.name ILIKE $1 OR companies.code ILIKE $2 OR companies.manager_name ILIKE $3)');
  }
  if (status !== 'all') {
    params.push(status);
    where.push(`companies.status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = (
    await query(
      `
        SELECT
          companies.id,
          companies.name,
          companies.code,
          companies.manager_name,
          companies.contact_phone,
          companies.status,
          companies.available_points,
          companies.total_points,
          COUNT(company_stores.id)::int AS store_count
        FROM companies
        LEFT JOIN company_stores ON company_stores.company_id = companies.id
        ${whereClause}
        GROUP BY companies.id
        ORDER BY companies.id DESC
      `,
      params
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    code: row.code,
    manager_name: row.manager_name,
    contact_phone: row.contact_phone,
    status: row.status,
    available_points: toNumber(row.available_points),
    total_points: toNumber(row.total_points),
    store_count: toNumber(row.store_count)
  }));
}

export async function listInventory({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
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
    filterValue: status,
    orderBy: 'company_inventory.id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
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

export async function listPurchaseOrders({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const queryData = buildListQuery({
    baseQuery: `
      SELECT
        purchase_orders.id,
        purchase_orders.order_no,
        companies.name AS company_name,
        purchase_orders.status,
        purchase_orders.approval_status,
        purchase_orders.points_total,
        purchase_orders.abnormal_flag,
        purchase_orders.created_at
      FROM purchase_orders
      INNER JOIN companies ON companies.id = purchase_orders.company_id
    `,
    searchColumns: ['purchase_orders.order_no', 'companies.name'],
    search,
    filterColumn: 'purchase_orders.status',
    filterValue: status,
    orderBy: 'purchase_orders.id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
  return rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    company_name: row.company_name,
    status: row.status,
    approval_status: row.approval_status,
    points_total: toNumber(row.points_total),
    abnormal_flag: boolValue(row.abnormal_flag) ? '异常' : '正常',
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));
}

export async function listMemberOrders({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const queryData = buildListQuery({
    baseQuery: `
      SELECT
        member_orders.id,
        member_orders.order_no,
        companies.name AS company_name,
        company_stores.name AS store_name,
        member_orders.status,
        member_orders.member_name,
        member_orders.sales_staff_name,
        member_orders.total_amount,
        member_orders.created_at
      FROM member_orders
      INNER JOIN companies ON companies.id = member_orders.company_id
      INNER JOIN company_stores ON company_stores.id = member_orders.store_id
    `,
    searchColumns: ['member_orders.order_no', 'companies.name', 'company_stores.name', 'member_orders.member_name', 'member_orders.sales_staff_name'],
    search,
    filterColumn: 'member_orders.status',
    filterValue: status,
    orderBy: 'member_orders.id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
  return rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    company_name: row.company_name,
    store_name: row.store_name,
    status: row.status,
    member_name: row.member_name,
    sales_staff_name: row.sales_staff_name,
    total_amount: toNumber(row.total_amount),
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));
}

export async function listCompanyStoresByCompany(companyId) {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT id, name, code, address, manager_name, status
        FROM company_stores
        WHERE company_id = $1
        ORDER BY id DESC
      `,
      [Number(companyId)]
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    code: row.code,
    address: row.address,
    manager_name: row.manager_name,
    status: row.status
  }));
}

export async function listPointAdjustments({ companyId } = {}) {
  await initializeDatabase();
  const params = [];
  let whereClause = '';
  if (companyId) {
    params.push(Number(companyId));
    whereClause = 'WHERE point_adjustments.company_id = $1';
  }

  const rows = (
    await query(
      `
        SELECT
          point_adjustments.id,
          companies.name AS company_name,
          point_adjustments.change_type,
          point_adjustments.points_amount,
          point_adjustments.reason,
          point_adjustments.status,
          point_adjustments.created_by,
          point_adjustments.created_at
        FROM point_adjustments
        INNER JOIN companies ON companies.id = point_adjustments.company_id
        ${whereClause}
        ORDER BY point_adjustments.id DESC
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    company_name: row.company_name,
    change_type: row.change_type,
    points_amount: toNumber(row.points_amount),
    reason: row.reason,
    status: row.status,
    created_by: row.created_by,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));
}

export async function listInventoryLogs({ companyId } = {}) {
  await initializeDatabase();
  const params = [];
  let whereClause = '';
  if (companyId) {
    params.push(Number(companyId));
    whereClause = 'WHERE inventory_logs.company_id = $1';
  }

  const rows = (
    await query(
      `
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
      params
    )
  ).rows;

  return rows.map((row) => ({
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
  }));
}

export async function listInventoryAdjustments({ status = 'all' } = {}) {
  await initializeDatabase();
  const params = [];
  const where = [];
  if (status !== 'all') {
    params.push(status);
    where.push(`inventory_adjustments.status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const rows = (
    await query(
      `
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
        ORDER BY inventory_adjustments.id DESC
      `,
      params
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    company_name: row.company_name,
    product_name: row.product_name,
    sku_code: row.sku_code,
    requested_quantity: toNumber(row.requested_quantity),
    reason: row.reason,
    status: row.status,
    created_by: row.created_by,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));
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

export async function updateSystemSetting(id, payload) {
  await initializeDatabase();
  await query(
    `
      UPDATE system_settings
      SET setting_value = $1, description = $2, updated_by = $3, updated_at = $4
      WHERE id = $5
    `,
    [payload.setting_value, payload.description ?? '', payload.updated_by ?? '后台用户', now(), Number(id)]
  );
}

export async function listRedeemItems() {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT id, item_name, item_code, points_cost, stock, status, description
        FROM point_redeem_items
        ORDER BY id DESC
      `
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    item_name: row.item_name,
    item_code: row.item_code,
    points_cost: toNumber(row.points_cost),
    stock: toNumber(row.stock),
    status: row.status,
    description: row.description
  }));
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

export async function listRedeemOrders() {
  await initializeDatabase();
  const rows = (
    await query(
      `
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
        ORDER BY point_redeem_orders.id DESC
      `
    )
  ).rows;
  return rows.map((row) => ({
    id: String(row.id),
    order_no: row.order_no,
    item_name: row.item_name,
    member_name: row.member_name,
    member_phone: row.member_phone,
    points_cost: toNumber(row.points_cost),
    status: row.status,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));
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
    permissions
  };
}

export async function getAdminByAccount(account, password) {
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
        roles.id AS role_id,
        roles.role_name
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
      WHERE admin_staff.account = $1 AND admin_staff.status != '停用'
    `,
    [account]
  );

  const row = result.rows[0];
  if (!row) return null;
  const matched = await verifyPassword(password, row.password);
  if (!matched) return null;
  if (!isPasswordHash(row.password)) {
    const hashed = await hashPassword(password);
    await query('UPDATE admin_staff SET password = $1, updated_at = $2 WHERE id = $3', [
      hashed,
      now(),
      row.id
    ]);
  }
  const permissions = await getPermissionsByRoleId(row.role_id);
  return mapAdminUser(row, permissions);
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
        admin_staff.phone,
        admin_staff.email,
        admin_staff.last_login,
        roles.id AS role_id,
        roles.role_name
      FROM admin_staff
      LEFT JOIN roles ON roles.id = admin_staff.role_id
      WHERE admin_staff.id = $1 AND admin_staff.status != '停用'
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
      WHERE admin_staff.id = $1
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

export async function updateStaffOrganization(id, payload) {
  await initializeDatabase();
  await query(
    `
      UPDATE admin_staff
      SET company_id = $1, store_id = $2, updated_at = $3
      WHERE id = $4
    `,
    [
      payload.company_id && payload.company_id !== 'none' ? Number(payload.company_id) : null,
      payload.store_id && payload.store_id !== 'none' ? Number(payload.store_id) : null,
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

export async function getRolePermissionMatrix(roleId) {
  await initializeDatabase();
  const rows = (
    await query(
      `
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
      [Number(roleId)]
    )
  ).rows;

  return rows.map((row) => ({
    id: String(row.id),
    module: row.module,
    permission_name: row.permission_name,
    code: row.code,
    level: row.level,
    status: row.status,
    assigned: row.assigned
  }));
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
  const rows = (await query('SELECT id, role_name FROM roles ORDER BY id ASC')).rows;
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
        WHERE status = '启用'
        ORDER BY sort_order ASC, id ASC
      `
    )
  ).rows;
  return rows.map((row) => ({
    value: row.category_name,
    label: `${row.category_name} (${row.category_code})`
  }));
}

export async function getCompanyOptions() {
  await initializeDatabase();
  const rows = (
    await query('SELECT id, name, code FROM companies WHERE status != $1 ORDER BY id ASC', ['停用'])
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.name} (${row.code})`
  }));
}

export async function getStoreOptions(companyId) {
  await initializeDatabase();
  const params = [];
  let whereClause = '';
  if (companyId && companyId !== 'all') {
    params.push(Number(companyId));
    whereClause = 'WHERE company_id = $1';
  }

  const rows = (
    await query(
      `SELECT id, name, code FROM company_stores ${whereClause} ORDER BY id ASC`,
      params
    )
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.name} (${row.code})`
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
          products.name AS product_name
        FROM product_skus
        INNER JOIN products ON products.id = product_skus.product_id
        WHERE product_skus.status = '启用'
        ORDER BY product_skus.id ASC
      `
    )
  ).rows;
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.product_name} / ${row.spec} / ${row.sku_code}`
  }));
}

export async function getPurchaseOrderOptions() {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT purchase_orders.id, purchase_orders.order_no, companies.name AS company_name
        FROM purchase_orders
        INNER JOIN companies ON companies.id = purchase_orders.company_id
        WHERE purchase_orders.status != '已驳回'
        ORDER BY purchase_orders.id DESC
      `
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

export async function getStoreStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM company_stores'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM company_stores WHERE status = '营业中'`),
    pending: await getCount(`SELECT COUNT(*)::int AS count FROM company_stores WHERE status = '筹备中'`)
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

export async function listProductChangeRequests() {
  await initializeDatabase();
  return (
    await query(
      `
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
          product_change_requests.id DESC
      `
    )
  ).rows.map((row) => {
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
  });
}

export async function listProductCategories({ search = '', status = 'all' } = {}) {
  await initializeDatabase();
  const queryData = buildListQuery({
    baseQuery:
      'SELECT id, category_name, category_code, description, status, sort_order FROM product_categories',
    searchColumns: ['category_name', 'category_code', 'description'],
    search,
    filterColumn: 'status',
    filterValue: status,
    orderBy: 'sort_order ASC, id DESC'
  });

  const rows = (await query(queryData.sql, queryData.params)).rows;
  return rows.map((row) => ({
    id: String(row.id),
    category_name: row.category_name,
    category_code: row.category_code,
    description: row.description,
    status: row.status,
    sort_order: Number(row.sort_order)
  }));
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

export async function getCompanyStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM companies'),
    active: await getCount(`SELECT COUNT(*)::int AS count FROM companies WHERE status = '启用'`),
    storeCount: await getCount('SELECT COUNT(*)::int AS count FROM company_stores')
  };
}

export async function getInventoryStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM company_inventory'),
    warning: await getCount(`SELECT COUNT(*)::int AS count FROM company_inventory WHERE quantity <= safety_stock`),
    low: await getCount(`SELECT COUNT(*)::int AS count FROM company_inventory WHERE status = '低库存'`)
  };
}

export async function getPurchaseOrderStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM purchase_orders'),
    pending: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE approval_status = '待审核'`),
    received: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE stock_received = TRUE`)
  };
}

export async function getMemberOrderStats() {
  await initializeDatabase();
  return {
    total: await getCount('SELECT COUNT(*)::int AS count FROM member_orders'),
    writeoff: await getCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE status = '已核销'`),
    abnormal: await getCount(`SELECT COUNT(*)::int AS count FROM member_orders WHERE status = '异常'`)
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
    input.department,
    Number(input.role_id),
    input.status,
    input.phone,
    input.email,
    input.last_login
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
    Number(input.points_price || 0),
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
    ['points_price', '订货积分价'],
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
    input.manager_name,
    input.contact_phone,
    input.status,
    Number(input.available_points || 0),
    Number(input.total_points || 0),
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

function purchaseOrderPointsTotal(quantity, pointsPrice) {
  return Number(quantity || 0) * Number(pointsPrice || 0);
}

async function getCompanyById(companyId) {
  const result = await query(
    `
      SELECT id, name, available_points, total_points
      FROM companies
      WHERE id = $1
    `,
    [Number(companyId)]
  );
  return result.rows[0] ?? null;
}

async function getSkuById(skuId) {
  const result = await query(
    `
      SELECT
        product_skus.id,
        product_skus.name,
        product_skus.sku_code,
        product_skus.spec,
        product_skus.points_price,
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
        product_skus.points_price,
        product_skus.redeem_points_price,
        product_skus.sale_price,
        product_skus.status,
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

async function changeCompanyPoints(companyId, delta, reason, createdBy = '系统') {
  const company = await getCompanyById(companyId);
  if (!company) {
    throw new Error('分公司不存在');
  }

  const nextAvailable = toNumber(company.available_points) + Number(delta);
  if (nextAvailable < 0) {
    throw new Error(`分公司 ${company.name} 可用积分不足`);
  }

  const nextTotal = Number(delta) > 0 ? toNumber(company.total_points) + Number(delta) : toNumber(company.total_points);
  await query(
    `
      UPDATE companies
      SET available_points = $1, total_points = $2, updated_at = $3
      WHERE id = $4
    `,
    [nextAvailable, nextTotal, now(), Number(companyId)]
  );

  if (reason) {
    await appendApprovalLog({
      entityType: 'points',
      entityId: companyId,
      action: '积分变更',
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
        SELECT id, quantity, safety_stock
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
        SET quantity = $1, status = $2, updated_at = $3
        WHERE id = $4
      `,
      [nextQuantity, nextStatus, now(), existing.id]
    );
  } else {
    await query(
      `
        INSERT INTO company_inventory
          (company_id, sku_id, quantity, safety_stock, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [Number(companyId), Number(skuId), nextQuantity, safetyStock, nextStatus, now(), now()]
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

async function createProductRecordInternal(payload) {
  return createProductRecord(payload);
}

async function updateProductRecord(id, payload) {
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
        updated_at = $9
      WHERE id = $10
    `,
    [...values, timestamp, Number(id)]
  );
}

async function deleteProductRecordInternal(id) {
  await assertProductDeletable(id);
  await query('DELETE FROM products WHERE id = $1', [Number(id)]);
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
        (product_id, name, sku_code, spec, packaging, unit, barcode, qr_code, image_url, points_price, redeem_points_price, sale_price, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
    [Number(productId), ...values, timestamp, timestamp]
  );
  return result.rows[0].id;
}

async function createProductSkuInternal(productId, payload) {
  return createProductSku(productId, payload);
}

export async function updateProductSku(productId, skuId, payload) {
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
        points_price = $9,
        redeem_points_price = $10,
        sale_price = $11,
        status = $12,
        updated_at = $13
      WHERE id = $14
    `,
    [...values, timestamp, Number(skuId)]
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

export async function deleteProductSku(productId, skuId) {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);
  await assertSkuDeletable(skuId);
  await query('DELETE FROM product_skus WHERE id = $1 AND product_id = $2', [Number(skuId), Number(productId)]);
}

async function deleteProductSkuInternal(productId, skuId) {
  await deleteProductSku(productId, skuId);
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
        (entity_type, entity_id, product_id, action, payload, status, request_note, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, '待审核', $6, $7, $8, $9)
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
  const values = normalizeCompanyInput(payload);
  const result = await query(
    `
      INSERT INTO companies
        (name, code, manager_name, contact_phone, status, available_points, total_points, notes, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [...values, timestamp, timestamp]
  );
  return result.rows[0].id;
}

async function updateCompanyRecord(id, payload) {
  const timestamp = now();
  const values = normalizeCompanyInput(payload);
  await query(
    `
      UPDATE companies
      SET
        name = $1,
        code = $2,
        manager_name = $3,
        contact_phone = $4,
        status = $5,
        available_points = $6,
        total_points = $7,
        notes = $8,
        updated_at = $9
      WHERE id = $10
    `,
    [...values, timestamp, Number(id)]
  );
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
  return result.rows[0].id;
}

async function updateInventoryRecord(id, payload) {
  const [companyId, skuId, quantity, _safetyStock, _status, remark] = normalizeInventoryInput(payload);
  await query(
    `
      UPDATE inventory_adjustments
      SET company_id = $1, sku_id = $2, requested_quantity = $3, reason = $4, updated_at = $5
      WHERE id = $6
    `,
    [companyId, skuId, quantity, remark || '更新库存调整申请', now(), Number(id)]
  );
}

async function createPurchaseOrderRecord(payload) {
  const timestamp = now();
  const company = await getCompanyById(payload.company_id);
  const sku = await getSkuById(payload.sku_id);
  if (!company || !sku) {
    throw new Error('分公司或 SKU 不存在');
  }

  const quantity = Number(payload.quantity || 0);
  const pointsTotal = purchaseOrderPointsTotal(quantity, sku.points_price);
  const abnormalFlag = toNumber(company.available_points) < pointsTotal;
  const status = abnormalFlag ? '待审核' : payload.status ?? '待入库';
  const approvalStatus = abnormalFlag ? '待审核' : status === '已入库' ? '已通过' : '自动通过';
  const pointsDeducted = !abnormalFlag;
  const stockReceived = !abnormalFlag && status === '已入库';
  const orderNo = payload.order_no || `PO-${Date.now()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `
        INSERT INTO purchase_orders
          (order_no, company_id, status, points_total, remark, abnormal_flag, approval_status, points_deducted, stock_received, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `,
      [orderNo, Number(payload.company_id), status, pointsTotal, payload.remark ?? '', abnormalFlag, approvalStatus, pointsDeducted, stockReceived, timestamp, timestamp]
    );
    const orderId = orderResult.rows[0].id;
    await client.query(
      `
        INSERT INTO purchase_order_items
          (purchase_order_id, sku_id, quantity, points_unit_price, subtotal_points)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [orderId, Number(payload.sku_id), quantity, toNumber(sku.points_price), pointsTotal]
    );
    if (!abnormalFlag) {
      await client.query(
        `
          UPDATE companies
          SET available_points = available_points - $1, updated_at = $2
          WHERE id = $3
        `,
        [pointsTotal, timestamp, Number(payload.company_id)]
      );
    }
    await client.query('COMMIT');

    if (stockReceived) {
      await upsertInventory(payload.company_id, payload.sku_id, quantity, '订货入库', orderId, '订货单入库');
    }
    await appendApprovalLog({
      entityType: 'purchase_order',
      entityId: orderId,
      action: abnormalFlag ? '异常订货' : '订货创建',
      result: approvalStatus,
      note: abnormalFlag ? '分公司积分不足，等待人工审核' : '订货单已创建',
      createdBy: '后台用户'
    });
    return orderId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updatePurchaseOrderRecord(id, payload) {
  const timestamp = now();
  await query(
    `
      UPDATE purchase_orders
      SET status = $1, remark = $2, updated_at = $3
      WHERE id = $4
    `,
    [payload.status, payload.remark ?? '', timestamp, Number(id)]
  );
}

async function createWriteoffFromMemberOrder(memberOrderId) {
  const order = (
    await query(
      `
        SELECT
          member_orders.id,
          member_orders.company_id,
          member_orders.store_id,
          member_orders.sales_staff_name,
          member_orders.stock_deducted
        FROM member_orders
        WHERE member_orders.id = $1
      `,
      [Number(memberOrderId)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('会员订单不存在');
  }
  if (order.stock_deducted) {
    return;
  }

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
    await upsertInventory(order.company_id, item.sku_id, -toNumber(item.quantity), '会员订单核销', memberOrderId, '会员订单核销扣减库存');
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
        '会员订单核销完成'
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
      SET stock_deducted = TRUE, status = '已核销', updated_at = $1
      WHERE id = $2
    `,
    [now(), Number(memberOrderId)]
  );
}

async function createMemberOrderRecord(payload) {
  const timestamp = now();
  const sku = await getSkuById(payload.sku_id);
  if (!sku) {
    throw new Error('SKU 不存在');
  }

  const quantity = Number(payload.quantity || 0);
  const unitPrice = Number(payload.unit_price || 0);
  const totalAmount = quantity * unitPrice;
  const orderNo = payload.order_no || `MO-${Date.now()}`;
  const stockDeducted = payload.status === '已核销';
  const purchaseOrderId =
    payload.purchase_order_id && payload.purchase_order_id !== 'none'
      ? Number(payload.purchase_order_id)
      : null;
  const result = await query(
    `
      INSERT INTO member_orders
        (order_no, company_id, store_id, status, sales_staff_name, member_name, member_phone, total_amount, purchase_order_id, stock_deducted, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `,
    [
      orderNo,
      Number(payload.company_id),
      Number(payload.store_id),
      payload.status,
      payload.sales_staff_name,
      payload.member_name,
      payload.member_phone,
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
  if (stockDeducted) {
    await createWriteoffFromMemberOrder(orderId);
  }
  return orderId;
}

async function updateMemberOrderRecord(id, payload) {
  const purchaseOrderId =
    payload.purchase_order_id && payload.purchase_order_id !== 'none'
      ? Number(payload.purchase_order_id)
      : null;
  const quantity = Number(payload.quantity || 0);
  const unitPrice = Number(payload.unit_price || 0);
  const totalAmount = quantity * unitPrice;
  await query(
    `
      UPDATE member_orders
      SET
        company_id = $1,
        store_id = $2,
        status = $3,
        sales_staff_name = $4,
        member_name = $5,
        member_phone = $6,
        total_amount = $7,
        purchase_order_id = $8,
        updated_at = $9
      WHERE id = $10
    `,
    [
      Number(payload.company_id),
      Number(payload.store_id),
      payload.status,
      payload.sales_staff_name,
      payload.member_name,
      payload.member_phone,
      totalAmount,
      purchaseOrderId,
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
}

export async function approvePurchaseOrder(id, payload = {}) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT
          purchase_orders.id,
          purchase_orders.company_id,
          purchase_orders.status,
          purchase_orders.points_total,
          purchase_orders.points_deducted,
          purchase_orders.stock_received
        FROM purchase_orders
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('订货单不存在');
  }

  if (payload.result === '驳回') {
    await query(
      `
        UPDATE purchase_orders
        SET status = '已驳回', approval_status = '已驳回', updated_at = $1
        WHERE id = $2
      `,
      [now(), Number(id)]
    );
    await appendApprovalLog({
      entityType: 'purchase_order',
      entityId: id,
      action: '人工审核',
      result: '已驳回',
      note: payload.note ?? '人工驳回异常订货单',
      createdBy: '后台用户'
    });
    return;
  }

  if (!order.points_deducted) {
    await changeCompanyPoints(order.company_id, -toNumber(order.points_total), '订货单审核通过扣减积分', '后台用户');
  }

  let finalStatus = payload.final_status ?? '已入库';
  if (finalStatus !== '已入库' && finalStatus !== '待入库') {
    finalStatus = '已入库';
  }

  await query(
    `
      UPDATE purchase_orders
      SET status = $1, approval_status = '已通过', abnormal_flag = FALSE, points_deducted = TRUE, updated_at = $2
      WHERE id = $3
    `,
    [finalStatus, now(), Number(id)]
  );

  if (finalStatus === '已入库' && !order.stock_received) {
    const item = (
      await query(
        `
          SELECT sku_id, quantity
          FROM purchase_order_items
          WHERE purchase_order_id = $1
          ORDER BY id ASC
          LIMIT 1
        `,
        [Number(id)]
      )
    ).rows[0];
    await upsertInventory(order.company_id, item.sku_id, item.quantity, '订货入库', id, '审核通过后入库');
    await query('UPDATE purchase_orders SET stock_received = TRUE WHERE id = $1', [Number(id)]);
  }

  await appendApprovalLog({
    entityType: 'purchase_order',
    entityId: id,
    action: '人工审核',
    result: '已通过',
    note: payload.note ?? '总部审核通过',
    createdBy: '后台用户'
  });
}

export async function approvePointAdjustment(id, payload = {}) {
  await initializeDatabase();
  const adjustment = (
    await query(
      `
        SELECT id, company_id, change_type, points_amount, status
        FROM point_adjustments
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!adjustment) {
    throw new Error('积分调整记录不存在');
  }

  if (payload.result === '驳回') {
    await query(
      `
        UPDATE point_adjustments
        SET status = '已驳回', updated_at = $1
        WHERE id = $2
      `,
      [now(), Number(id)]
    );
    await appendApprovalLog({
      entityType: 'point_adjustment',
      entityId: id,
      action: '积分审核',
      result: '已驳回',
      note: payload.note ?? '总部审核驳回积分调整',
      createdBy: '后台用户'
    });
    return;
  }

  const delta = adjustment.change_type === '减少' ? -toNumber(adjustment.points_amount) : toNumber(adjustment.points_amount);
  await changeCompanyPoints(adjustment.company_id, delta, '积分调整审核通过', '后台用户');
  await query(
    `
      UPDATE point_adjustments
      SET status = '已通过', updated_at = $1
      WHERE id = $2
    `,
    [now(), Number(id)]
  );
  await appendApprovalLog({
    entityType: 'point_adjustment',
    entityId: id,
    action: '积分审核',
    result: '已通过',
    note: payload.note ?? '总部审核通过积分调整',
    createdBy: '后台用户'
  });
}

export async function approveInventoryAdjustment(id, payload = {}) {
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

  if (payload.result === '驳回') {
    await query(
      `
        UPDATE inventory_adjustments
        SET status = '已驳回', updated_at = $1
        WHERE id = $2
      `,
      [now(), Number(id)]
    );
    await appendApprovalLog({
      entityType: 'inventory_adjustment',
      entityId: id,
      action: '库存审核',
      result: '已驳回',
      note: payload.note ?? '总部审核驳回库存调整',
      createdBy: '后台用户'
    });
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
      SET status = '已通过', updated_at = $1
      WHERE id = $2
    `,
    [now(), Number(id)]
  );
  await appendApprovalLog({
    entityType: 'inventory_adjustment',
    entityId: id,
    action: '库存审核',
    result: '已通过',
    note: payload.note ?? '总部审核通过库存调整',
    createdBy: '后台用户'
  });
}

export async function createCompanyStore(companyId, payload) {
  await initializeDatabase();
  const result = await query(
    `
      INSERT INTO company_stores
        (company_id, name, code, address, manager_name, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      Number(companyId),
      payload.name,
      payload.code,
      payload.address,
      payload.manager_name,
      payload.status,
      now(),
      now()
    ]
  );
  return result.rows[0].id;
}

export async function createPointAdjustment(payload) {
  await initializeDatabase();
  const result = await query(
    `
      INSERT INTO point_adjustments
        (company_id, change_type, points_amount, reason, status, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      Number(payload.company_id),
      payload.change_type,
      Number(payload.points_amount || 0),
      payload.reason,
      payload.status ?? '待审核',
      payload.created_by ?? '后台用户',
      now(),
      now()
    ]
  );
  await appendApprovalLog({
    entityType: 'point_adjustment',
    entityId: result.rows[0].id,
    action: '积分调整申请',
    result: payload.status ?? '待审核',
    note: payload.reason,
    createdBy: payload.created_by ?? '后台用户'
  });
  return result.rows[0].id;
}

export async function getReportsData() {
  await initializeDatabase();
  const summary = {
    totalSales: await getCount('SELECT COALESCE(SUM(total_amount), 0)::int AS count FROM member_orders'),
    totalWriteoffs: await getCount(`SELECT COUNT(*)::int AS count FROM writeoff_records WHERE status = '成功'`),
    totalPointsUsed: await getCount('SELECT COALESCE(SUM(points_total), 0)::int AS count FROM purchase_orders'),
    totalInventory: await getCount('SELECT COALESCE(SUM(quantity), 0)::int AS count FROM company_inventory')
  };

  const companyRanking = (
    await query(
      `
        SELECT
          companies.name AS company_name,
          COALESCE(SUM(member_orders.total_amount), 0) AS total_sales,
          COUNT(writeoff_records.id)::int AS writeoff_count,
          (companies.total_points - companies.available_points) AS points_spent
        FROM companies
        LEFT JOIN member_orders ON member_orders.company_id = companies.id
        LEFT JOIN writeoff_records ON writeoff_records.member_order_id = member_orders.id
        GROUP BY companies.id
        ORDER BY total_sales DESC
      `
    )
  ).rows.map((row) => ({
    company_name: row.company_name,
    total_sales: toNumber(row.total_sales),
    writeoff_count: toNumber(row.writeoff_count),
    points_spent: toNumber(row.points_spent)
  }));

  const salesTrend = (
    await query(
      `
        SELECT to_char(created_at, 'MM-DD') AS period, COALESCE(SUM(total_amount), 0) AS amount
        FROM member_orders
        GROUP BY to_char(created_at, 'MM-DD')
        ORDER BY MIN(created_at) ASC
      `
    )
  ).rows.map((row) => ({
    period: row.period,
    amount: toNumber(row.amount)
  }));

  const writeoffTrend = (
    await query(
      `
        SELECT substr(writeoff_time, 6, 5) AS period, COUNT(*)::int AS count
        FROM writeoff_records
        GROUP BY substr(writeoff_time, 6, 5)
        ORDER BY MIN(writeoff_time) ASC
      `
    )
  ).rows.map((row) => ({
    period: row.period,
    count: toNumber(row.count)
  }));

  const pointsRanking = (
    await query(
      `
        SELECT name AS company_name, total_points, available_points
        FROM companies
        ORDER BY total_points DESC
      `
    )
  ).rows.map((row) => ({
    company_name: row.company_name,
    total_points: toNumber(row.total_points),
    available_points: toNumber(row.available_points)
  }));

  const pendingApprovals = {
    pointAdjustments: await getCount(`SELECT COUNT(*)::int AS count FROM point_adjustments WHERE status = '待审核'`),
    inventoryAdjustments: await getCount(`SELECT COUNT(*)::int AS count FROM inventory_adjustments WHERE status = '待审核'`),
    purchaseOrders: await getCount(`SELECT COUNT(*)::int AS count FROM purchase_orders WHERE approval_status = '待审核'`)
  };

  const lowInventory = (
    await query(
      `
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
      `
    )
  ).rows.map((row) => ({
    company_name: row.company_name,
    product_name: row.product_name,
    sku_code: row.sku_code,
    quantity: toNumber(row.quantity),
    safety_stock: toNumber(row.safety_stock)
  }));

  return {
    summary,
    companyRanking,
    salesTrend,
    writeoffTrend,
    pointsRanking,
    pendingApprovals,
    lowInventory
  };
}

export async function getProductDetail(id) {
  await initializeDatabase();
  const product = (
    await query(
      `
        SELECT id, spu_code, name, brand, category, scenario, description, image_url, status
        FROM products
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!product) return null;

  const skus = (
    await query(
      `
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
          product_skus.points_price,
          product_skus.redeem_points_price,
          product_skus.sale_price,
          product_skus.status
        FROM product_skus
        WHERE product_skus.product_id = $1
        ORDER BY product_skus.id ASC
      `,
      [Number(id)]
    )
  ).rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    sku_code: row.sku_code,
    spec: row.spec,
    packaging: row.packaging,
    unit: row.unit,
    barcode: row.barcode,
    qr_code: row.qr_code,
    image_url: row.image_url,
    points_price: toNumber(row.points_price),
    redeem_points_price: toNumber(row.redeem_points_price),
    sale_price: toNumber(row.sale_price),
    status: row.status
  }));

  const inventory = (
    await query(
      `
        SELECT
          companies.name AS company_name,
          product_skus.sku_code,
          company_inventory.quantity,
          company_inventory.status
        FROM company_inventory
        INNER JOIN companies ON companies.id = company_inventory.company_id
        INNER JOIN product_skus ON product_skus.id = company_inventory.sku_id
        WHERE product_skus.product_id = $1
        ORDER BY company_inventory.id DESC
      `,
      [Number(id)]
    )
  ).rows.map((row) => ({
    company_name: row.company_name,
    sku_code: row.sku_code,
    quantity: toNumber(row.quantity),
    status: row.status
  }));

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
    skus,
    inventory
  };
}

export async function getSkuDetail(productId, skuId) {
  await initializeDatabase();
  await assertSkuBelongsToProduct(productId, skuId);

  const sku = await getSkuRecordById(skuId);
  if (!sku) return null;

  const inventory = (
    await query(
      `
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
      [Number(skuId)]
    )
  ).rows.map((row) => ({
    company_name: row.company_name,
    quantity: toNumber(row.quantity),
    safety_stock: toNumber(row.safety_stock),
    status: row.status
  }));

  const recentUsage = (
    await query(
      `
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
        LIMIT 8
      `,
      [Number(skuId)]
    )
  ).rows.map((row) => ({
    source_type: row.source_type,
    source_no: row.source_no,
    quantity: toNumber(row.quantity),
    created_at: row.created_at
  }));

  const writeoffs = (
    await query(
      `
        SELECT status, product_code, sales_staff_name, writeoff_time, remark
        FROM writeoff_records
        WHERE sku_id = $1
        ORDER BY writeoff_time DESC
        LIMIT 8
      `,
      [Number(skuId)]
    )
  ).rows;

  const pendingRequests = (
    await query(
      `
        SELECT id, action, status, created_by, created_at
        FROM product_change_requests
        WHERE entity_type = 'sku' AND entity_id = $1
        ORDER BY id DESC
        LIMIT 8
      `,
      [Number(skuId)]
    )
  ).rows.map((row) => ({
    id: String(row.id),
    action: productChangeActionLabel(row.action),
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at
  }));

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
    points_price: toNumber(sku.points_price),
    redeem_points_price: toNumber(sku.redeem_points_price),
    sale_price: toNumber(sku.sale_price),
    status: sku.status,
    inventory,
    recentUsage,
    writeoffs,
    pendingRequests
  };
}

export async function getCompanyDetail(id) {
  await initializeDatabase();
  const company = (
    await query(
      `
        SELECT id, name, code, manager_name, contact_phone, status, available_points, total_points, notes
        FROM companies
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!company) return null;

  const stores = await listCompanyStoresByCompany(id);
  const pointAdjustments = await listPointAdjustments({ companyId: id });
  const inventory = await listInventoryForCompany(id);
  const purchaseOrders = (
    await query(
      `
        SELECT order_no, status, points_total, approval_status
        FROM purchase_orders
        WHERE company_id = $1
        ORDER BY id DESC
        LIMIT 5
      `,
      [Number(id)]
    )
  ).rows.map((row) => ({
    order_no: row.order_no,
    status: row.status,
    points_total: toNumber(row.points_total),
    approval_status: row.approval_status
  }));
  const memberOrders = (
    await query(
      `
        SELECT order_no, status, member_name, total_amount
        FROM member_orders
        WHERE company_id = $1
        ORDER BY id DESC
        LIMIT 5
      `,
      [Number(id)]
    )
  ).rows.map((row) => ({
    order_no: row.order_no,
    status: row.status,
    member_name: row.member_name,
    total_amount: toNumber(row.total_amount)
  }));

  return {
    id: String(company.id),
    name: company.name,
    code: company.code,
    manager_name: company.manager_name,
    contact_phone: company.contact_phone,
    status: company.status,
    available_points: toNumber(company.available_points),
    total_points: toNumber(company.total_points),
    notes: company.notes,
    stores,
    pointAdjustments,
    inventory,
    purchaseOrders,
    memberOrders
  };
}

export async function listInventoryForCompany(companyId) {
  await initializeDatabase();
  const rows = (
    await query(
      `
        SELECT
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
        ORDER BY company_inventory.id DESC
      `,
      [Number(companyId)]
    )
  ).rows;

  return rows.map((row) => ({
    product_name: row.product_name,
    sku_code: row.sku_code,
    spec: row.spec,
    quantity: toNumber(row.quantity),
    safety_stock: toNumber(row.safety_stock),
    status: row.status
  }));
}

export async function getPurchaseOrderDetail(id) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT
          purchase_orders.id,
          purchase_orders.order_no,
          purchase_orders.status,
          purchase_orders.points_total,
          purchase_orders.remark,
          purchase_orders.abnormal_flag,
          purchase_orders.approval_status,
          purchase_orders.points_deducted,
          purchase_orders.stock_received,
          purchase_orders.created_at,
          companies.name AS company_name,
          companies.code AS company_code
        FROM purchase_orders
        INNER JOIN companies ON companies.id = purchase_orders.company_id
        WHERE purchase_orders.id = $1
      `,
      [Number(id)]
    )
  ).rows[0];
  if (!order) return null;

  const items = (
    await query(
      `
        SELECT
          products.name AS product_name,
          product_skus.sku_code,
          product_skus.spec,
          purchase_order_items.quantity,
          purchase_order_items.points_unit_price,
          purchase_order_items.subtotal_points
        FROM purchase_order_items
        INNER JOIN product_skus ON product_skus.id = purchase_order_items.sku_id
        INNER JOIN products ON products.id = product_skus.product_id
        WHERE purchase_order_items.purchase_order_id = $1
      `,
      [Number(id)]
    )
  ).rows.map((row) => ({
    product_name: row.product_name,
    sku_code: row.sku_code,
    spec: row.spec,
    quantity: toNumber(row.quantity),
    points_unit_price: toNumber(row.points_unit_price),
    subtotal_points: toNumber(row.subtotal_points)
  }));

  const approvals = (
    await query(
      `
        SELECT action, result, note, created_by, created_at
        FROM approval_logs
        WHERE entity_type = 'purchase_order' AND entity_id = $1
        ORDER BY id DESC
      `,
      [String(id)]
    )
  ).rows.map((row) => ({
    action: row.action,
    result: row.result,
    note: row.note,
    created_by: row.created_by,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));

  return {
    id: String(order.id),
    order_no: order.order_no,
    company_name: order.company_name,
    company_code: order.company_code,
    status: order.status,
    points_total: toNumber(order.points_total),
    remark: order.remark,
    abnormal_flag: boolValue(order.abnormal_flag),
    approval_status: order.approval_status,
    points_deducted: boolValue(order.points_deducted),
    stock_received: boolValue(order.stock_received),
    created_at: new Date(order.created_at).toLocaleString('zh-CN', { hour12: false }),
    items,
    approvals
  };
}

export async function getMemberOrderDetail(id) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT
          member_orders.id,
          member_orders.order_no,
          member_orders.status,
          member_orders.sales_staff_name,
          member_orders.member_name,
          member_orders.member_phone,
          member_orders.total_amount,
          member_orders.stock_deducted,
          member_orders.created_at,
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

  const items = (
    await query(
      `
        SELECT
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
      [Number(id)]
    )
  ).rows.map((row) => ({
    product_name: row.product_name,
    sku_code: row.sku_code,
    spec: row.spec,
    quantity: toNumber(row.quantity),
    unit_price: toNumber(row.unit_price),
    point_rebate_base: toNumber(row.point_rebate_base),
    writeoff_status: row.writeoff_status
  }));

  const writeoffs = await listWriteoffRecords({ memberOrderId: id });
  const logs = (
    await query(
      `
        SELECT action, result, note, created_by, created_at
        FROM approval_logs
        WHERE entity_type = 'member_order' AND entity_id = $1
        ORDER BY id DESC
      `,
      [String(id)]
    )
  ).rows.map((row) => ({
    action: row.action,
    result: row.result,
    note: row.note,
    created_by: row.created_by,
    created_at: new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
  }));

  return {
    id: String(order.id),
    order_no: order.order_no,
    company_name: order.company_name,
    store_name: order.store_name,
    status: order.status,
    sales_staff_name: order.sales_staff_name,
    member_name: order.member_name,
    member_phone: order.member_phone,
    total_amount: toNumber(order.total_amount),
    stock_deducted: boolValue(order.stock_deducted),
    purchase_order_no: order.purchase_order_no,
    created_at: new Date(order.created_at).toLocaleString('zh-CN', { hour12: false }),
    items,
    writeoffs,
    logs
  };
}

export async function handleMemberOrder(id, payload = {}) {
  await initializeDatabase();
  const order = (
    await query(
      `
        SELECT id, status, stock_deducted
        FROM member_orders
        WHERE id = $1
      `,
      [Number(id)]
    )
  ).rows[0];

  if (!order) {
    throw new Error('会员订单不存在');
  }

  if (payload.action === 'writeoff') {
    await createWriteoffFromMemberOrder(id);
    await appendApprovalLog({
      entityType: 'member_order',
      entityId: id,
      action: '人工核销',
      result: '已核销',
      note: payload.note ?? '后台人工确认核销并扣减库存',
      createdBy: '后台用户'
    });
    return;
  }

  if (payload.action === 'resolve') {
    await query(
      `
        UPDATE member_orders
        SET status = '已处理', updated_at = $1
        WHERE id = $2
      `,
      [now(), Number(id)]
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
      note: payload.note ?? '后台人工处理异常会员订单',
      createdBy: '后台用户'
    });
    return;
  }

  throw new Error('不支持的会员订单处理动作');
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
  return createProductChangeRequest({
    entityType: 'product',
    entityId: id,
    productId: id,
    action: 'delete',
    payload: {
      spu_code: existing.spu_code,
      name: existing.name,
      brand: existing.brand,
      category: existing.category,
      status: existing.status
    },
    createdBy: actorName
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
      points_price: toNumber(existingSku.points_price),
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
  return createProductChangeRequest({
    entityType: 'sku',
    entityId: skuId,
    productId,
    action: 'delete',
    payload: {
      name: existingSku.name,
      sku_code: existingSku.sku_code,
      spec: existingSku.spec,
      packaging: existingSku.packaging,
      unit: existingSku.unit,
      barcode: existingSku.barcode,
      qr_code: existingSku.qr_code,
      image_url: existingSku.image_url,
      points_price: toNumber(existingSku.points_price),
      redeem_points_price: toNumber(existingSku.redeem_points_price),
      sale_price: toNumber(existingSku.sale_price),
      status: existingSku.status,
      product_name: existingSku.product_name,
      spu_code: existingSku.spu_code
    },
    createdBy: actorName
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
        const createdId = await createProductRecordInternal(requestPayload);
        await query(
          'UPDATE product_change_requests SET entity_id = $1, product_id = $1 WHERE id = $2',
          [Number(createdId), Number(id)]
        );
      } else if (requestRow.action === 'update') {
        await updateProductRecord(requestRow.entity_id, requestPayload);
      } else if (requestRow.action === 'delete') {
        await query('UPDATE product_change_requests SET product_id = NULL WHERE id = $1', [Number(id)]);
        await deleteProductRecordInternal(requestRow.entity_id);
      }
    } else if (requestRow.entity_type === 'sku') {
      if (requestRow.action === 'create') {
        const createdSkuId = await createProductSkuInternal(requestRow.product_id, requestPayload);
        await query(
          'UPDATE product_change_requests SET entity_id = $1 WHERE id = $2',
          [Number(createdSkuId), Number(id)]
        );
      } else if (requestRow.action === 'update') {
        await updateProductSku(requestRow.product_id, requestRow.entity_id, requestPayload);
      } else if (requestRow.action === 'delete') {
        await deleteProductSkuInternal(requestRow.product_id, requestRow.entity_id);
      }
    } else {
      throw new Error('不支持的商品变更类型');
    }
  }

  await query(
    `
      UPDATE product_change_requests
      SET status = $1, approved_by = $2, approved_note = $3, approved_at = $4, updated_at = $4
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

export async function createRecord(entity, payload, actorName = '后台用户') {
  await initializeDatabase();

  switch (entity) {
    case 'products':
      return {
        id: await submitProductCreateRequest(payload, actorName),
        message: '商品新增申请已提交，待审核通过后生效'
      };
    case 'companies':
      return { id: await createCompanyRecord(payload), message: '新增成功' };
    case 'inventory':
      return { id: await createInventoryRecord(payload), message: '新增成功' };
    case 'purchase-orders':
      return { id: await createPurchaseOrderRecord(payload), message: '新增成功' };
    case 'member-orders':
      return { id: await createMemberOrderRecord(payload), message: '新增成功' };
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      const timestamp = now();
      const normalizedPayload =
        entity === 'staff'
          ? { ...payload, password: await hashPassword(String(payload.password ?? '').trim()) }
          : payload;
      const values = config.normalize(normalizedPayload);
      const result = await query(
        `INSERT INTO ${config.table} ${config.insertColumns} VALUES ${config.insertPlaceholders} RETURNING id`,
        [...values, timestamp, timestamp]
      );
      return { id: result.rows[0].id, message: '新增成功' };
    }
  }
}

export async function updateRecord(entity, id, payload, actorName = '后台用户') {
  await initializeDatabase();

  switch (entity) {
    case 'products':
      await submitProductUpdateRequest(id, payload, actorName);
      return { success: true, message: '商品修改申请已提交，待审核通过后生效' };
    case 'companies':
      await updateCompanyRecord(id, payload);
      return { success: true, message: '保存成功' };
    case 'inventory':
      await updateInventoryRecord(id, payload);
      return { success: true, message: '保存成功' };
    case 'purchase-orders':
      await updatePurchaseOrderRecord(id, payload);
      return { success: true, message: '保存成功' };
    case 'member-orders':
      await updateMemberOrderRecord(id, payload);
      return { success: true, message: '保存成功' };
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      const timestamp = now();
      const nextPayload =
        entity === 'staff'
          ? {
              ...payload,
              password:
                payload.password && String(payload.password).trim().length > 0
                  ? await hashPassword(String(payload.password).trim())
                  : (
                      await query('SELECT password FROM admin_staff WHERE id = $1', [Number(id)])
                    ).rows[0]?.password ?? ''
            }
          : payload;
      const values = config.normalize(nextPayload);
      await query(
        `UPDATE ${config.table} SET ${config.updateSet} WHERE id = $${values.length + 2}`,
        [...values, timestamp, Number(id)]
      );
      return { success: true, message: '保存成功' };
    }
  }
}

export async function deleteRecord(entity, id, actorName = '后台用户') {
  await initializeDatabase();
  switch (entity) {
    case 'products':
      await submitProductDeleteRequest(id, actorName);
      return { success: true, message: '商品删除申请已提交，待审核通过后执行' };
    case 'companies':
      await query('DELETE FROM companies WHERE id = $1', [Number(id)]);
      return { success: true, message: '删除成功' };
    case 'inventory':
      await query('DELETE FROM company_inventory WHERE id = $1', [Number(id)]);
      return { success: true, message: '删除成功' };
    case 'purchase-orders': {
      const order = (await query('SELECT points_deducted, stock_received FROM purchase_orders WHERE id = $1', [Number(id)])).rows[0];
      if (order?.points_deducted || order?.stock_received) {
        throw new Error('已扣减积分或已入库的订货单不能直接删除');
      }
      await query('DELETE FROM purchase_orders WHERE id = $1', [Number(id)]);
      return { success: true, message: '删除成功' };
    }
    case 'member-orders': {
      const order = (await query('SELECT stock_deducted FROM member_orders WHERE id = $1', [Number(id)])).rows[0];
      if (order?.stock_deducted) {
        throw new Error('已核销的会员订单不能直接删除');
      }
      await query('DELETE FROM member_orders WHERE id = $1', [Number(id)]);
      return { success: true, message: '删除成功' };
    }
    default: {
      const config = entityConfigs[entity];
      if (!config) {
        throw new Error('不支持的资源类型');
      }
      await query(`DELETE FROM ${config.table} WHERE id = $1`, [Number(id)]);
      return { success: true, message: '删除成功' };
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

export async function updateStaffStatus(id, status) {
  await initializeDatabase();
  await query('UPDATE admin_staff SET status = $1, updated_at = $2 WHERE id = $3', [
    status,
    now(),
    Number(id)
  ]);
}

export async function resetStaffPassword(id, password) {
  await initializeDatabase();
  const hashedPassword = await hashPassword(password);
  await query('UPDATE admin_staff SET password = $1, updated_at = $2 WHERE id = $3', [
    hashedPassword,
    now(),
    Number(id)
  ]);
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
  await query('UPDATE admin_staff SET password = $1, updated_at = $2 WHERE id = $3', [
    hashedPassword,
    now(),
    Number(id)
  ]);
}

export async function updateSkuImage(skuId, imageUrl) {
  await initializeDatabase();
  await query('UPDATE product_skus SET image_url = $1, updated_at = $2 WHERE id = $3', [
    imageUrl,
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

export function getDatabaseFilePath() {
  return databaseUrl;
}

export function getRedisUrl() {
  return redisUrl;
}
