import { NavGroup } from '@/types';

/**
 * Navigation configuration with RBAC support
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 *
 * RBAC Access Control:
 * Each navigation item can have an `access` property that controls visibility
 * based on permissions, plans, features, roles, and organization context.
 *
 * Examples:
 *
 * 1. Require organization:
 *    access: { requireOrg: true }
 *
 * 2. Require specific permission:
 *    access: { requireOrg: true, permission: 'org:teams:manage' }
 *
 * 3. Require specific plan:
 *    access: { plan: 'pro' }
 *
 * 4. Require specific feature:
 *    access: { feature: 'premium_access' }
 *
 * 5. Require specific role:
 *    access: { role: 'admin' }
 *
 * 6. Multiple conditions (all must be true):
 *    access: { requireOrg: true, permission: 'org:teams:manage', plan: 'pro' }
 *
 * Note: The `visible` function is deprecated but still supported for backward compatibility.
 * Use the `access` property for new items.
 */
export const navGroups: NavGroup[] = [
  {
    label: '总览',
    items: [
      {
        title: '工作台',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        access: { permission: 'overview:view' },
        items: []
      },
      {
        title: '分类管理',
        url: '/dashboard/categories',
        icon: 'product',
        isActive: false,
        access: { permission: 'categories:view' },
        items: []
      },
      {
        title: '商品管理',
        url: '/dashboard/products',
        icon: 'workspace',
        isActive: false,
        access: { permission: 'products:view' },
        items: []
      },
      {
        title: '商品审核',
        url: '/dashboard/product-approvals',
        icon: 'notification',
        isActive: false,
        access: { permission: 'products:approve' },
        items: []
      },
      {
        title: '分公司管理',
        url: '/dashboard/companies',
        icon: 'product',
        isActive: false,
        access: { permission: 'companies:view' },
        items: []
      },
      {
        title: '库存管理',
        url: '/dashboard/inventory',
        icon: 'teams',
        isActive: false,
        access: { permission: 'inventory:view' },
        items: []
      },
      {
        title: '订货单管理',
        url: '/dashboard/purchase-orders',
        icon: 'account',
        isActive: false,
        access: { permission: 'purchase-orders:view' },
        items: []
      },
      {
        title: '会员订单管理',
        url: '/dashboard/member-orders',
        icon: 'sparkles',
        isActive: false,
        access: { permission: 'member-orders:view' },
        items: []
      },
      {
        title: '积分兑换',
        url: '/dashboard/redeem',
        icon: 'sparkles',
        isActive: false,
        access: { permission: 'settings:view' },
        items: []
      },
      {
        title: '后台员工',
        url: '/dashboard/staff',
        icon: 'account',
        isActive: false,
        access: { permission: 'staff:view' },
        items: []
      }
    ]
  },
  {
    label: '协同',
    items: [
      {
        title: '协同看板',
        url: '/dashboard/kanban',
        icon: 'kanban',
        isActive: false,
        access: { permission: 'kanban:view' },
        items: []
      },
      {
        title: '通知中心',
        url: '/dashboard/notifications',
        icon: 'notification',
        isActive: false,
        access: { permission: 'notifications:view' },
        items: []
      }
    ]
  },
  {
    label: '系统',
    items: [
      {
        title: '系统设置',
        url: '#',
        icon: 'settings',
        isActive: true,
        access: { permission: 'settings:view' },
        items: [
          {
            title: '角色管理',
            url: '/dashboard/roles',
            icon: 'settings',
            access: { permission: 'roles:view' }
          },
          {
            title: '权限管理',
            url: '/dashboard/permissions',
            icon: 'settings',
            access: { permission: 'permissions:view' }
          },
          {
            title: '基础设置',
            url: '/dashboard/settings',
            icon: 'settings',
            access: { permission: 'settings:view' }
          },
          {
            title: '数据报表',
            url: '/dashboard/reports',
            icon: 'trendingUp',
            access: { permission: 'reports:view' }
          }
        ]
      }
    ]
  }
];
