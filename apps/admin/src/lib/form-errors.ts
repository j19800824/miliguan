export type FieldErrors = Record<string, string>;

export type ApiErrorBody = {
  message?: string;
  fieldErrors?: FieldErrors;
};

const fieldMessageRules: Array<[string, string[]]> = [
  ['manager_phone', ['负责人手机号', '负责人手机', '门店负责人手机号', '门店负责人手机', '负责人电话']],
  ['manager_name', ['负责人姓名', '负责人名称']],
  ['category_name', ['分类名称']],
  ['category_code', ['分类编码']],
  ['sku_code', ['SKU 编码', 'SKU编码']],
  ['spu_code', ['SPU 编码', 'SPU编码']],
  ['order_quota_price', ['订货额单价', '订货额度单价']],
  ['redeem_points_price', ['积分兑换价']],
  ['sale_price', ['售价']],
  ['requested_quantity', ['申请库存']],
  ['order_quota_amount', ['订货额度', '订货额']],
  ['target_company_level', ['目标分公司等级', '分公司等级']],
  ['company_id', ['分公司', '公司']],
  ['store_id', ['门店']],
  ['sku_id', ['sku', '商品']],
  ['items', ['SKU', '订货数量', '订货明细']],
  ['name', ['门店名称', '商品名称', 'SKU 名称', 'SKU名称', '名称', '姓名']],
  ['account', ['账号']],
  ['password', ['密码']],
  ['phone', ['手机号', '电话']],
  ['email', ['邮箱']],
  ['manager_name', ['负责人']],
  ['status', ['状态']],
  ['reason', ['原因']],
  ['expires_at', ['回调日期']],
  ['spu_code', ['SPU']],
  ['spec', ['规格']],
  ['unit', ['单位']],
  ['barcode', ['条码']],
  ['qr_code', ['二维码']]
];

export function inferFieldErrors(message: string, payload?: Record<string, unknown> | null): FieldErrors {
  const errors: FieldErrors = {};
  const normalizedMessage = String(message || '');

  for (const [field, keywords] of fieldMessageRules) {
    if (keywords.some((keyword) => normalizedMessage.toLowerCase().includes(keyword.toLowerCase()))) {
      errors[field] = normalizedMessage;
      break;
    }
  }

  if (payload) {
    for (const [field, value] of Object.entries(payload)) {
      if (
        (value === undefined || value === null || String(value).trim() === '') &&
        !errors[field]
      ) {
        errors[field] = '该字段不能为空';
      }
    }
  }

  return errors;
}

export async function readApiError(response: Response, fallback = '操作失败'): Promise<ApiErrorBody> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  return {
    message: body.message || fallback,
    fieldErrors: body.fieldErrors ?? {}
  };
}
