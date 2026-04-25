import { create } from 'zustand';
import type { NotificationStatus, NotificationAction } from '@/components/ui/notification-card';

export type Notification = {
  id: string;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: string;
  actions?: NotificationAction[];
};

type NotificationState = {
  notifications: Notification[];
  loading: boolean;
  loadNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => void;
  addNotification: (notification: Omit<Notification, 'status'>) => void;
  unreadCount: () => number;
};

async function fetchNotifications() {
  const response = await fetch('/api/admin/notifications?pageSize=50', {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error('通知加载失败');
  }
  const body = await response.json();
  return (body.rows ?? []) as Notification[];
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  loading: false,

  loadNotifications: async () => {
    set({ loading: true });
    try {
      const notifications = await fetchNotifications();
      set({ notifications });
    } finally {
      set({ loading: false });
    }
  },

  markAsRead: async (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, status: 'read' as const } : n
      )
    }));
    const response = await fetch(`/api/admin/notifications/${id}/read`, { method: 'PUT' });
    if (!response.ok) {
      await get().loadNotifications();
    }
  },

  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        status: 'read' as const
      }))
    }));
    const response = await fetch('/api/admin/notifications/read-all', { method: 'PUT' });
    if (!response.ok) {
      await get().loadNotifications();
    }
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [{ ...notification, status: 'unread' as const }, ...state.notifications]
    })),

  unreadCount: () => get().notifications.filter((n) => n.status === 'unread').length
}));
