import type { NavGroup, NavItem } from '@/types';

export function canAccessItem(item: NavItem, permissions: string[]) {
  const requiredPermission = item.access?.permission;
  if (!requiredPermission) return true;
  return permissions.includes(requiredPermission);
}

function filterItem(item: NavItem, permissions: string[]): NavItem | null {
  const filteredChildren =
    item.items?.map((child) => filterItem(child, permissions)).filter((child): child is NavItem => Boolean(child)) ?? [];

  if (filteredChildren.length > 0) {
    return {
      ...item,
      items: filteredChildren
    };
  }

  if (!canAccessItem(item, permissions)) {
    return null;
  }

  return {
    ...item,
    items: filteredChildren
  };
}

export function filterNavGroups(groups: NavGroup[], permissions: string[]) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => filterItem(item, permissions))
        .filter((item): item is NavItem => Boolean(item))
    }))
    .filter((group) => group.items.length > 0);
}
