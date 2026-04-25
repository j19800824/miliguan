export type Role = 'boss' | 'branch_gm' | 'store_manager' | 'sales_staff';

export interface MockUser {
  id: string;
  name: string;
  role: Role;
  roleLabel: string;
  org: string;
  avatar: string;
  points?: number;
}

export const MOCK_USERS: MockUser[] = [
  { id: '1', name: '张总', role: 'boss', roleLabel: '老板', org: '米粒冠总部', avatar: '👑' },
  { id: '2', name: '李经理', role: 'branch_gm', roleLabel: '分公司总经理', org: '华东分公司', avatar: '🏢', points: 128500 },
  { id: '3', name: '王店长', role: 'store_manager', roleLabel: '门店店长', org: '静安社区店', avatar: '🏪', points: 8820 },
  { id: '4', name: '陈小丽', role: 'sales_staff', roleLabel: '销售店员', org: '静安社区店', avatar: '🛒', points: 3260 },
];

export const MOCK_KPI = {
  totalSales: '1,284,600',
  totalVerify: '38,420',
  totalPoints: '96,300',
  totalInventory: '12,840',
  salesGrowth: '+12.4%',
  verifyGrowth: '+8.7%',
};

export const MOCK_BRANCHES = [
  { id: '1', name: '华东分公司', sales: '386,200', verify: 11230, points: 34800, rank: 1, trend: 'up' },
  { id: '2', name: '华南分公司', sales: '312,500', verify: 9640, points: 28600, rank: 2, trend: 'up' },
  { id: '3', name: '华北分公司', sales: '278,300', verify: 8510, points: 24300, rank: 3, trend: 'down' },
  { id: '4', name: '西南分公司', sales: '198,600', verify: 6080, points: 18200, rank: 4, trend: 'up' },
  { id: '5', name: '西北分公司', sales: '109,000', verify: 2960, points: 9400, rank: 5, trend: 'down' },
];

export const MOCK_RANKING_DAILY = [
  { rank: 1, name: '陈小丽', org: '静安社区店', points: 680, isMe: false },
  { rank: 2, name: '刘明', org: '虹桥社区店', points: 590, isMe: false },
  { rank: 3, name: '王店长', org: '静安社区店', points: 520, isMe: true },
  { rank: 4, name: '张芳', org: '徐汇社区店', points: 480, isMe: false },
  { rank: 5, name: '李强', org: '杨浦社区店', points: 420, isMe: false },
  { rank: 6, name: '赵敏', org: '普陀社区店', points: 380, isMe: false },
];

export const MOCK_ORDERS = [
  { id: 'ORD20240401001', sku: '低GI免煮米 2kg', qty: 200, points: 12000, status: '已完成', date: '04-01' },
  { id: 'ORD20240328002', sku: '低GI免煮米 100g×25', qty: 50, points: 8500, status: '待确认', date: '03-28' },
  { id: 'ORD20240325003', sku: '低GI免煮米 2.5kg', qty: 100, points: 15000, status: '已完成', date: '03-25' },
  { id: 'ORD20240320004', sku: '低GI免煮米 100g', qty: 500, points: 6000, status: '已完成', date: '03-20' },
];

export const MOCK_VERIFY_RECORDS = [
  { id: 'V001', product: '低GI免煮米 2kg', barcode: '6901234567890', time: '14:32', staff: '陈小丽', status: 'success', pts: 20 },
  { id: 'V002', product: '低GI免煮米 100g', barcode: '6901234567891', time: '13:15', staff: '王店长', status: 'success', pts: 20 },
  { id: 'V003', product: '低GI免煮米 2.5kg', barcode: '6901234567892', time: '11:48', staff: '陈小丽', status: 'success', pts: 20 },
  { id: 'V004', product: '未知商品', barcode: '0000000000000', time: '10:22', staff: '王店长', status: 'fail', pts: 0 },
];

export const MOCK_INVENTORY = [
  { sku: '低GI免煮米 100g', stock: 1240, warn: false },
  { sku: '低GI免煮米 2kg', stock: 86, warn: true },
  { sku: '低GI免煮米 2.5kg', stock: 320, warn: false },
];

export const MOCK_STORES = [
  { id: 'S01', name: '静安社区店', manager: '王店长', verify: 128, status: 'normal' },
  { id: 'S02', name: '虹桥社区店', manager: '刘明', verify: 96, status: 'normal' },
  { id: 'S03', name: '徐汇社区店', manager: '张芳', verify: 12, status: 'warn' },
];
