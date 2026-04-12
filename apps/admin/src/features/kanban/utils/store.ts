import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
// import { persist } from 'zustand/middleware';

export type Priority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  priority: Priority;
  description?: string;
  assignee?: string;
  dueDate?: string;
};

type KanbanState = {
  columns: Record<string, Task[]>;
  setColumns: (columns: Record<string, Task[]>) => void;
  addTask: (title: string, description?: string) => void;
};

const initialColumns: Record<string, Task[]> = {
  backlog: [
    {
      id: '1',
      title: '梳理门店设备绑定流程',
      priority: 'high',
      assignee: '张琳',
      dueDate: '2026-04-08'
    },
    {
      id: '2',
      title: '补充订单导出字段',
      priority: 'medium',
      assignee: '王森',
      dueDate: '2026-04-12'
    },
    {
      id: '3',
      title: '更新会员召回短信文案',
      priority: 'low',
      assignee: '李悦',
      dueDate: '2026-04-15'
    },
    {
      id: '9',
      title: '核对角色权限矩阵',
      priority: 'medium',
      assignee: '陈卓',
      dueDate: '2026-04-10'
    }
  ],
  inProgress: [
    {
      id: '4',
      title: '重构通知提醒规则',
      priority: 'high',
      assignee: '赵晴',
      dueDate: '2026-04-03'
    },
    {
      id: '5',
      title: '搭建门店员工邀请流程',
      priority: 'medium',
      assignee: '周一鸣',
      dueDate: '2026-04-06'
    },
    {
      id: '10',
      title: '修复预约单时区展示问题',
      priority: 'high',
      assignee: '张琳',
      dueDate: '2026-04-04'
    }
  ],
  done: [
    {
      id: '6',
      title: '完成后台登录页占位版',
      priority: 'high',
      assignee: '陈卓',
      dueDate: '2026-03-22'
    },
    {
      id: '7',
      title: '经营工作台图表底座',
      priority: 'medium',
      assignee: '王森',
      dueDate: '2026-03-20'
    },
    {
      id: '8',
      title: '首版通知中心布局',
      priority: 'low',
      assignee: '赵晴',
      dueDate: '2026-03-18'
    }
  ]
};

export const useTaskStore = create<KanbanState>()(
  // To enable persistence across refreshes, uncomment the persist wrapper below:
  // persist(
  (set) => ({
    columns: initialColumns,

    setColumns: (columns) => set({ columns }),

    addTask: (title, description) =>
      set((state) => ({
        columns: {
          ...state.columns,
          backlog: [
            {
              id: uuid(),
              title,
              description,
              priority: 'medium' as Priority,
              assignee: undefined,
              dueDate: undefined
            },
            ...(state.columns.backlog ?? [])
          ]
        }
      }))
  })
  //   ,
  //   { name: 'kanban-store' }
  // )
);
