export type MetricCard = {
  label: string;
  value: string;
  hint: string;
};

export type FilterOption = {
  label: string;
  value: string;
};

export type SelectOption = {
  label: string;
  value: string;
  companyId?: string;
  code?: string;
  availableOrderQuota?: number;
  skuCode?: string;
  productName?: string;
  spec?: string;
  orderQuotaPrice?: number;
};

export type FieldConfig = {
  name: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  required?: boolean;
  options?: SelectOption[];
  defaultValue?: string;
};

export type ColumnConfig = {
  key: string;
  title: string;
  type?: 'text' | 'badge' | 'currency' | 'code';
  className?: string;
};

export type ManagementEntity =
  | 'stores'
  | 'staff'
  | 'members'
  | 'roles'
  | 'permissions'
  | 'categories'
  | 'products'
  | 'companies'
  | 'inventory'
  | 'purchase-orders'
  | 'member-orders';

export type ManagementConfig = {
  entity: ManagementEntity;
  title: string;
  description: string;
  viewPermission: string;
  writePermission?: string;
  searchPlaceholder: string;
  filterLabel: string;
  filterKey: string;
  filterOptions: FilterOption[];
  columns: ColumnConfig[];
  fields: FieldConfig[];
  purchaseSkuOptions?: SelectOption[];
  detailBasePath?: string;
};

export const storesConfig: ManagementConfig = {
  entity: 'stores',
  title: '门店管理',
  description: '兼容旧版门店数据的查询入口。',
  viewPermission: 'company-stores:view',
  writePermission: 'company-stores:edit',
  searchPlaceholder: '搜索门店名称、负责人或归属分公司',
  filterLabel: '门店状态',
  filterKey: 'status',
  filterOptions: [
    { label: '全部状态', value: 'all' },
    { label: '营业中', value: '营业中' },
    { label: '筹备中', value: '筹备中' },
    { label: '已删除', value: '__deleted__' },
    { label: '包含已删除', value: '__with_deleted__' }
  ],
  columns: [
    { key: 'name', title: '门店名称' },
    { key: 'manager_name', title: '负责人' },
    { key: 'manager_phone', title: '负责人电话' },
    { key: 'city', title: '归属分公司' },
    { key: 'available_order_quota', title: '可用订货额', type: 'currency' },
    { key: 'total_order_quota', title: '累计订货额度', type: 'currency' },
    { key: 'staff_count', title: '店员数' },
    { key: 'monthly_revenue', title: '会员订单金额', type: 'currency' },
    { key: 'status', title: '状态', type: 'badge' }
  ],
  fields: [
    { name: 'name', label: '门店名称', type: 'text', required: true },
    { name: 'manager_name', label: '负责人', type: 'text', required: true },
    { name: 'city', label: '归属分公司', type: 'text', required: true },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      options: [
        { label: '营业中', value: '营业中' },
        { label: '筹备中', value: '筹备中' }
      ]
    },
    { name: 'staff_count', label: '店员数', type: 'number', required: true },
    { name: 'monthly_revenue', label: '会员订单金额', type: 'number', required: true }
  ]
};

export const membersConfig: ManagementConfig = {
  entity: 'members',
  title: '会员管理',
  description: '保留一期会员档案查询能力，后续如需 CRM 再扩展。',
  viewPermission: 'members:view',
  writePermission: 'members:edit',
  searchPlaceholder: '搜索会员姓名、标签或城市',
  filterLabel: '会员状态',
  filterKey: 'status',
  filterOptions: [
    { label: '全部状态', value: 'all' },
    { label: '活跃', value: '活跃' },
    { label: '沉默', value: '沉默' },
    { label: '高价值', value: '高价值' },
    { label: '已删除', value: '__deleted__' },
    { label: '包含已删除', value: '__with_deleted__' }
  ],
  columns: [
    { key: 'name', title: '会员姓名' },
    { key: 'level', title: '会员等级', type: 'badge' },
    { key: 'tags', title: '标签', className: 'max-w-[220px] whitespace-normal' },
    { key: 'city', title: '城市' },
    { key: 'total_spent', title: '累计消费', type: 'currency' },
    { key: 'status', title: '状态', type: 'badge' }
  ],
  fields: [
    { name: 'name', label: '会员姓名', type: 'text', required: true },
    {
      name: 'level',
      label: '会员等级',
      type: 'select',
      required: true,
      options: [
        { label: '银卡', value: '银卡' },
        { label: '金卡', value: '金卡' },
        { label: '黑金', value: '黑金' }
      ]
    },
    { name: 'tags', label: '标签', type: 'textarea', required: true },
    { name: 'city', label: '城市', type: 'text', required: true },
    {
      name: 'status',
      label: '会员状态',
      type: 'select',
      required: true,
      options: [
        { label: '活跃', value: '活跃' },
        { label: '沉默', value: '沉默' },
        { label: '高价值', value: '高价值' }
      ]
    },
    { name: 'total_spent', label: '累计消费', type: 'number', required: true }
  ]
};

export function createStaffConfig(
  roleOptions: SelectOption[],
  companyOptions: SelectOption[] = [],
  storeOptions: SelectOption[] = []
): ManagementConfig {
  return {
    entity: 'staff',
    title: '后台员工管理',
    description: '管理后台账号、岗位角色与联系方式。部门和最近登录由系统自动维护。',
    viewPermission: 'staff:view',
    writePermission: 'staff:edit',
    searchPlaceholder: '搜索员工姓名、手机号或邮箱',
    filterLabel: '岗位角色',
    filterKey: 'role_name',
    filterOptions: [
      { label: '全部岗位', value: 'all' },
      ...roleOptions,
      { label: '已删除', value: '__deleted__' },
      { label: '包含已删除', value: '__with_deleted__' }
    ],
    columns: [
      { key: 'name', title: '姓名' },
      { key: 'account', title: '登录账号' },
      { key: 'role_name', title: '岗位角色', type: 'badge' },
      { key: 'department', title: '部门' },
      { key: 'phone', title: '手机号' },
      { key: 'last_login', title: '最近登录' },
      { key: 'status', title: '状态', type: 'badge' }
    ],
    fields: [
      { name: 'name', label: '姓名', type: 'text', required: true },
      { name: 'account', label: '登录账号', type: 'text', required: true },
      { name: 'role_id', label: '岗位角色', type: 'select', required: true, options: roleOptions },
      {
        name: 'company_id',
        label: '所属分公司',
        type: 'select',
        options: [{ label: '未绑定分公司', value: 'none' }, ...companyOptions],
        defaultValue: 'none'
      },
      {
        name: 'store_id',
        label: '所属门店',
        type: 'select',
        options: [{ label: '未绑定门店', value: 'none' }, ...storeOptions],
        defaultValue: 'none'
      },
      {
        name: 'status',
        label: '状态',
        type: 'select',
        required: true,
        options: [
          { label: '在职', value: '在职' },
          { label: '试用中', value: '试用中' },
          { label: '停用', value: '停用' }
        ]
      },
      { name: 'phone', label: '手机号', type: 'text', required: true },
      { name: 'email', label: '邮箱', type: 'text', required: true }
    ],
    detailBasePath: '/dashboard/staff'
  };
}

export const rolesConfig: ManagementConfig = {
  entity: 'roles',
  title: '角色管理',
  description: '配置后台角色、适用范围与成员归属。',
  viewPermission: 'roles:view',
  writePermission: 'roles:edit',
  searchPlaceholder: '搜索角色名称、说明或范围',
  filterLabel: '适用范围',
  filterKey: 'scope',
  filterOptions: [
    { label: '全部范围', value: 'all' },
    { label: '平台', value: '平台' },
    { label: '分公司', value: '分公司' },
    { label: '已删除', value: '__deleted__' },
    { label: '包含已删除', value: '__with_deleted__' }
  ],
  columns: [
    { key: 'role_name', title: '角色名称' },
    { key: 'scope', title: '范围', type: 'badge' },
    { key: 'member_count', title: '成员数' },
    { key: 'description', title: '说明', className: 'max-w-[280px] whitespace-normal' },
    { key: 'status', title: '状态', type: 'badge' }
  ],
  fields: [
    { name: 'role_name', label: '角色名称', type: 'text', required: true },
    {
      name: 'scope',
      label: '适用范围',
      type: 'select',
      required: true,
      options: [
        { label: '平台', value: '平台' },
        { label: '分公司', value: '分公司' }
      ]
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      options: [
        { label: '启用', value: '启用' },
        { label: '草稿', value: '草稿' }
      ]
    },
    { name: 'description', label: '说明', type: 'textarea', required: true }
  ]
};

export const permissionsConfig: ManagementConfig = {
  entity: 'permissions',
  title: '权限管理',
  description: '梳理菜单、页面、按钮和数据范围权限点。',
  viewPermission: 'permissions:view',
  writePermission: 'permissions:edit',
  searchPlaceholder: '搜索模块名称、权限名或权限码',
  filterLabel: '权限层级',
  filterKey: 'level',
  filterOptions: [
    { label: '全部层级', value: 'all' },
    { label: '菜单', value: '菜单' },
    { label: '页面', value: '页面' },
    { label: '按钮', value: '按钮' },
    { label: '数据', value: '数据' },
    { label: '已删除', value: '__deleted__' },
    { label: '包含已删除', value: '__with_deleted__' }
  ],
  columns: [
    { key: 'module', title: '所属模块' },
    { key: 'permission_name', title: '权限名称' },
    { key: 'code', title: '权限码', type: 'code' },
    { key: 'level', title: '层级', type: 'badge' },
    { key: 'status', title: '状态', type: 'badge' }
  ],
  fields: [
    { name: 'module', label: '所属模块', type: 'text', required: true },
    { name: 'permission_name', label: '权限名称', type: 'text', required: true },
    { name: 'code', label: '权限码', type: 'text', required: true },
    {
      name: 'level',
      label: '权限层级',
      type: 'select',
      required: true,
      options: [
        { label: '菜单', value: '菜单' },
        { label: '页面', value: '页面' },
        { label: '按钮', value: '按钮' },
        { label: '数据', value: '数据' }
      ]
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      options: [
        { label: '启用', value: '启用' },
        { label: '规划中', value: '规划中' }
      ]
    }
  ]
};

export const categoriesConfig: ManagementConfig = {
  entity: 'categories',
  title: '分类管理',
  description: '统一维护商品分类，供商品主档、报表和筛选器复用。',
  viewPermission: 'categories:view',
  writePermission: 'categories:edit',
  searchPlaceholder: '搜索分类名称、编码或描述',
  filterLabel: '分类状态',
  filterKey: 'status',
  filterOptions: [
    { label: '全部状态', value: 'all' },
    { label: '启用', value: '启用' },
    { label: '停用', value: '停用' },
    { label: '已删除', value: '__deleted__' },
    { label: '包含已删除', value: '__with_deleted__' }
  ],
  columns: [
    { key: 'category_name', title: '分类名称' },
    { key: 'category_code', title: '分类编码', type: 'code' },
    { key: 'sort_order', title: '排序值' },
    { key: 'status', title: '状态', type: 'badge' },
    { key: 'description', title: '说明', className: 'max-w-[260px] whitespace-normal' }
  ],
  fields: [
    { name: 'category_name', label: '分类名称', type: 'text', required: true },
    { name: 'category_code', label: '分类编码', type: 'text', required: true },
    { name: 'sort_order', label: '排序值', type: 'number', required: true },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      options: [
        { label: '启用', value: '启用' },
        { label: '停用', value: '停用' }
      ]
    },
    { name: 'description', label: '分类说明', type: 'textarea', required: true }
  ]
};

export function createProductsConfig(categoryOptions: SelectOption[]): ManagementConfig {
  return {
    entity: 'products',
    title: '商品管理',
    description: '先维护 SPU 主数据，再进入详情页独立维护 SKU、图片和库存分布。',
    viewPermission: 'products:view',
    writePermission: 'products:edit',
    searchPlaceholder: '搜索 SPU 编码、商品名称、品牌或分类',
    filterLabel: '商品状态',
    filterKey: 'status',
    filterOptions: [
      { label: '全部状态', value: 'all' },
      { label: '启用', value: '启用' },
      { label: '停用', value: '停用' },
      { label: '已删除', value: '__deleted__' },
      { label: '包含已删除', value: '__with_deleted__' }
    ],
    columns: [
      { key: 'spu_code', title: 'SPU 编码', type: 'code' },
      { key: 'name', title: '商品名称' },
      { key: 'brand', title: '品牌' },
      { key: 'category', title: '分类' },
      { key: 'sku_count', title: 'SKU 数' },
      { key: 'status', title: '状态', type: 'badge' }
    ],
    fields: [
      { name: 'spu_code', label: 'SPU 编码', type: 'text', required: true },
      { name: 'name', label: '商品名称', type: 'text', required: true },
      { name: 'brand', label: '品牌', type: 'text', required: true, defaultValue: '米粒冠' },
      { name: 'category', label: '分类', type: 'select', required: true, options: categoryOptions },
      { name: 'scenario', label: '适用场景', type: 'text', required: true },
      { name: 'description', label: '商品描述', type: 'textarea', required: true },
      {
        name: 'status',
        label: '商品状态',
        type: 'select',
        required: true,
        options: [
          { label: '启用', value: '启用' },
          { label: '停用', value: '停用' }
        ]
      }
    ],
    detailBasePath: '/dashboard/products'
  };
}

export function createCompaniesConfig(levelOptions: SelectOption[]): ManagementConfig {
  return {
  entity: 'companies',
  title: '分公司管理',
  description: '管理分公司基础资料、订货额度、门店数量和当前经营状态。',
  viewPermission: 'companies:view',
  writePermission: 'companies:edit',
  searchPlaceholder: '搜索分公司名称、编码或负责人',
  filterLabel: '分公司状态',
  filterKey: 'status',
  filterOptions: [
    { label: '全部状态', value: 'all' },
    { label: '启用', value: '启用' },
    { label: '筹备中', value: '筹备中' },
    { label: '停用', value: '停用' },
    { label: '已删除', value: '__deleted__' },
    { label: '包含已删除', value: '__with_deleted__' }
  ],
  columns: [
    { key: 'name', title: '分公司名称' },
    { key: 'code', title: '编码', type: 'code' },
    { key: 'company_level', title: '分公司等级', type: 'badge' },
    { key: 'manager_name', title: '负责人' },
    { key: 'store_count', title: '门店数' },
    { key: 'inventory_quantity_total', title: '当前库存总量' },
    { key: 'inventory_amount_total', title: '库存金额', type: 'currency' },
    { key: 'total_order_quota', title: '总订货额', type: 'currency' },
    { key: 'available_order_quota', title: '可用订货额', type: 'currency' },
    { key: 'status', title: '状态', type: 'badge' }
  ],
  fields: [
    { name: 'name', label: '分公司名称', type: 'text', required: true },
    { name: 'code', label: '分公司编码', type: 'text', required: true },
    { name: 'company_level', label: '分公司等级', type: 'select', required: true, options: levelOptions },
    { name: 'manager_name', label: '负责人', type: 'text', required: true },
    { name: 'contact_phone', label: '联系电话', type: 'text', required: true },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      options: [
        { label: '启用', value: '启用' },
        { label: '筹备中', value: '筹备中' },
        { label: '停用', value: '停用' }
      ]
    },
    { name: 'notes', label: '备注', type: 'textarea', required: true }
  ],
  detailBasePath: '/dashboard/companies'
};
}

export function createInventoryConfig(
  companyOptions: SelectOption[],
  skuOptions: SelectOption[]
): ManagementConfig {
  return {
    entity: 'inventory',
    title: '库存管理',
    description: '管理分公司库存总览、低库存预警和手工调整。',
    viewPermission: 'inventory:view',
    writePermission: 'inventory:edit',
    searchPlaceholder: '搜索分公司、商品名称、SKU 编码或规格',
    filterLabel: '库存状态',
    filterKey: 'status',
    filterOptions: [
      { label: '全部状态', value: 'all' },
      { label: '充足', value: '充足' },
      { label: '预警', value: '预警' },
      { label: '低库存', value: '低库存' },
      { label: '缺货', value: '缺货' },
      { label: '已删除', value: '__deleted__' },
      { label: '包含已删除', value: '__with_deleted__' }
    ],
    columns: [
      { key: 'company_name', title: '分公司' },
      { key: 'product_name', title: '商品名称' },
      { key: 'sku_code', title: 'SKU 编码', type: 'code' },
      { key: 'spec', title: '规格' },
      { key: 'quantity', title: '库存数' },
      { key: 'safety_stock', title: '安全库存' },
      { key: 'status', title: '状态', type: 'badge' }
    ],
    fields: [
      { name: 'company_id', label: '分公司', type: 'select', required: true, options: companyOptions },
      { name: 'sku_id', label: 'SKU', type: 'select', required: true, options: skuOptions },
      { name: 'quantity', label: '库存数', type: 'number', required: true },
      { name: 'safety_stock', label: '安全库存', type: 'number', required: true },
      {
        name: 'status',
        label: '库存状态',
        type: 'select',
        required: true,
        options: [
          { label: '充足', value: '充足' },
          { label: '预警', value: '预警' },
          { label: '低库存', value: '低库存' },
          { label: '缺货', value: '缺货' }
        ]
      },
      { name: 'remark', label: '调整说明', type: 'textarea', required: true }
    ]
  };
}

export function createPurchaseOrdersConfig(
  companyOptions: SelectOption[],
  skuOptions: SelectOption[]
): ManagementConfig {
  return {
    entity: 'purchase-orders',
    title: '订货单管理',
    description: '统一查看分公司向总公司订货、门店向分公司订货的审核和入库流转。',
    viewPermission: 'purchase-orders:view',
    writePermission: 'purchase-orders:edit',
    searchPlaceholder: '搜索订货单号、分公司或门店',
    filterLabel: '订货单状态',
    filterKey: 'status',
    filterOptions: [
      { label: '全部状态', value: 'all' },
      { label: '待审核', value: '待审核' },
      { label: '待入库', value: '待入库' },
      { label: '已入库', value: '已入库' },
      { label: '已驳回', value: '已驳回' },
      { label: '已删除', value: '__deleted__' },
      { label: '包含已删除', value: '__with_deleted__' }
    ],
    columns: [
      { key: 'order_no', title: '订货单号', type: 'code' },
      { key: 'order_direction', title: '订货方向', type: 'badge' },
      { key: 'order_from', title: '订货方' },
      { key: 'order_to', title: '供货方' },
      { key: 'status', title: '状态', type: 'badge' },
      { key: 'approval_status', title: '审核状态', type: 'badge' },
      { key: 'order_quota_total', title: '订货额消耗', type: 'currency' },
      { key: 'abnormal_flag', title: '异常标记', type: 'badge' },
      { key: 'created_at', title: '创建时间' }
    ],
    fields: [
      { name: 'company_id', label: '分公司', type: 'select', required: true, options: companyOptions },
      { name: 'remark', label: '备注', type: 'textarea', required: true }
    ],
    purchaseSkuOptions: skuOptions,
    detailBasePath: '/dashboard/purchase-orders'
  };
}

export function createMemberOrdersConfig(
  companyOptions: SelectOption[],
  storeOptions: SelectOption[],
  skuOptions: SelectOption[],
  purchaseOrderOptions: SelectOption[]
): ManagementConfig {
  return {
    entity: 'member-orders',
    title: '散客订单管理',
    description: '第一期承接门店收银直接核销的散客订单、销售归属和核销流水。',
    viewPermission: 'member-orders:view',
    writePermission: 'member-orders:edit',
    searchPlaceholder: '搜索订单号、顾客、分公司、门店或销售员工',
    filterLabel: '订单状态',
    filterKey: 'status',
    filterOptions: [
      { label: '全部状态', value: 'all' },
      { label: '待核销', value: '待核销' },
      { label: '已核销', value: '已核销' },
      { label: '异常', value: '异常' },
      { label: '已删除', value: '__deleted__' },
      { label: '包含已删除', value: '__with_deleted__' }
    ],
    columns: [
      { key: 'order_no', title: '订单号', type: 'code' },
      { key: 'company_name', title: '分公司' },
      { key: 'store_name', title: '门店' },
      { key: 'customer_type_label', title: '顾客类型', type: 'badge' },
      { key: 'customer_name', title: '顾客' },
      { key: 'sales_staff_name', title: '销售归属' },
      { key: 'total_amount', title: '订单金额', type: 'currency' },
      { key: 'status', title: '状态', type: 'badge' }
    ],
    fields: [
      { name: 'order_no', label: '订单号（留空自动生成）', type: 'text' },
      { name: 'company_id', label: '分公司', type: 'select', required: true, options: companyOptions },
      { name: 'store_id', label: '门店', type: 'select', required: true, options: storeOptions },
      { name: 'sku_id', label: 'SKU', type: 'select', required: true, options: skuOptions },
      { name: 'purchase_order_id', label: '关联订货单', type: 'select', options: purchaseOrderOptions },
      {
        name: 'customer_type',
        label: '顾客类型',
        type: 'select',
        required: true,
        defaultValue: 'walk_in',
        options: [{ label: '散客', value: 'walk_in' }]
      },
      { name: 'member_name', label: '顾客姓名（留空按散客）', type: 'text' },
      { name: 'member_phone', label: '顾客手机号（可选）', type: 'text' },
      { name: 'sales_staff_name', label: '销售员工', type: 'text', required: true },
      { name: 'quantity', label: '商品数量', type: 'number', required: true },
      { name: 'unit_price', label: '成交单价', type: 'number', required: true },
      {
        name: 'status',
        label: '订单状态',
        type: 'select',
        required: true,
        options: [
          { label: '待核销', value: '待核销' },
          { label: '已核销', value: '已核销' },
          { label: '异常', value: '异常' }
        ]
      }
    ],
    detailBasePath: '/dashboard/member-orders'
  };
}
