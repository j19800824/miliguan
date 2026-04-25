# 米粒冠移动端 App — Claude 工作规范

本项目为 React Native + Expo 应用，服务于米粒冠一期（老板 / 分公司总经理 / 门店店长 / 销售员 四端合一）。

> **优先级约定**：本文件指令 > Skills 默认行为 > Claude 系统默认。CLAUDE.md 要求"不做某事"时，skill 说"要做"也不能做。

---

## 一、技术栈

- **框架**：React Native + Expo（managed workflow）
- **路由**：`@react-navigation/native` + `native-stack` / `bottom-tabs`
- **主题**：`src/constants/theme.ts`（设计令牌集中管理）
- **Mock 数据**：`src/data/mock.ts`
- **入口**：`App.tsx` → 按角色路由到 `src/navigation/*Navigator.tsx`

---

## 二、必装 Skills（最小可用组合）

Claude 在本项目工作时，**必须**在合适节点主动调用以下 skill。即使只有 1% 可能相关，也要 invoke。

### 规划与执行类（process skills — 优先于实现类）

| Skill | 触发时机 |
|---|---|
| `superpowers:brainstorming` | 用户提出模糊需求 / 新功能时，**在 EnterPlanMode 之前**先澄清 |
| `superpowers:writing-plans` | 复杂功能、跨多文件改动、重构前必须写 plan |
| `superpowers:executing-plans` | 执行已写好的 plan 时按段落地，不跳步 |
| `superpowers:test-driven-development` | 写业务逻辑 / hooks / 工具函数前，先写测试 |
| `superpowers:verification-before-completion` | 声明"完成"前必须跑：类型检查 + Expo 启动 + 手动截图验证 |
| `superpowers:systematic-debugging` | 排查崩溃 / 白屏 / 导航错误 / 性能问题时 |

### RN / 前端实现类

| Skill | 触发时机 |
|---|---|
| `react-native` | 每次写 RN 组件 / 原生模块 / 平台特定代码（`Platform.select`、手势、权限、相机等） |
| `ecc:frontend-design` / `frontend-design` | 设计新页面 / 新组件 UI 时 |
| `ecc:frontend-patterns` | 设计状态管理 / 数据流 / 表单结构时 |
| `ecc:coding-standards` | 命名、文件结构、import 顺序等规范问题 |

### 发版与质量

| Skill | 触发时机 |
|---|---|
| `ecc:git-workflow` | 每次提交前 — 原子提交、分支命名、commit message |
| `ecc:e2e-testing` | 关键流程（扫码下单、登录、角色切换）变更后 |

---

## 三、Skills 调用规则（硬性）

1. **收到用户消息 → 先判断是否有 skill 适用 → 再回应**，包括澄清问题也要先查 skill。
2. **声明要用哪个 skill**：`"Using superpowers:writing-plans to break this into steps"`。
3. **检查清单型 skill**（如 TDD、verification）**每一项**进 TodoWrite，不能口头承诺。
4. **不得以"简单任务""我记得这个 skill"为由跳过**。
5. **process skill 优先**：先定"怎么做"，再选"用什么实现"。

---

## 四、oh-my-claudecode 使用指引

已装 v4.11.4。对本项目可按需使用以下 skill（用 Skill 工具调用，非强制）：

| Skill | 场景 |
|---|---|
| `oh-my-claudecode:plan` | 超出 superpowers:writing-plans 能力的大任务编排 |
| `oh-my-claudecode:debug` / `oh-my-claudecode:trace` | 疑难 bug 证据链追踪 |
| `oh-my-claudecode:verify` | 交付前再加一层检查 |
| `oh-my-claudecode:deep-interview` | 需求特别模糊时深度澄清 |
| `oh-my-claudecode:ralph` / `oh-my-claudecode:autopilot` | 想跑自主循环（慎用） |
| `oh-my-claudecode:hud` | 状态栏显示 token / cost |

**默认不用**；当 superpowers 覆盖不到时再考虑 `oh-my-claudecode:*`。

---

## 五、本项目特殊规则

### 设计系统
- 所有颜色 / 间距 / 字号 / 圆角改动 **只改** `src/constants/theme.ts`，不要在组件里写死魔法数字。
- 新增组件放 `src/components/`，角色专属页面放 `src/screens/<role>/`。

### 字体（移动端）
- iOS：走系统 `PingFang SC`
- Android：打包 **阿里巴巴普惠体 Regular / Medium**（免费商用）或 **HarmonyOS Sans SC**
- 数字列表（KPI、排行、订单金额）统一 `fontVariant: ['tabular-nums']`
- 通过 `expo-font` 的 `useFonts` 加载，生产前必须做字体子集化（GB2312 + 常用符号）

### Mock 与真实接口
- 一期所有数据走 `src/data/mock.ts`；接后端时统一走 `src/services/api/*`，不得在组件里直接 `fetch`。

### 测试
- 单元测试：`*.test.ts(x)` 与被测文件同目录
- E2E：首选 **Maestro**（YAML 更直观，RN 生态活跃），备选 Detox
- 关键流程必须有 E2E：登录 → 角色路由 → 扫码 → 下单 → 排行榜

### 提交纪律
- 一个 commit 只做一件事；UI + 逻辑混改要拆开提交
- 分支命名：`feat/<role>-<功能>`、`fix/<问题>`、`refactor/<范围>`
- 提交前必跑：`tsc --noEmit` + `expo start` 能启动 + 主流程可点

### 不要做的事
- ❌ 不要新增 `*.md` 文档文件，除非用户明确要求
- ❌ 不要在未 Read 文件的情况下 Edit
- ❌ 不要跳过 pre-commit hook（`--no-verify` 禁用）
- ❌ 不要在 `main` 上直接改
- ❌ 不要把 mock 数据和真实 API 数据混用

---

## 六、首次进入本项目的自检

Claude 第一次在本目录工作时，先确认：

- [ ] 已读 `src/constants/theme.ts` 了解设计令牌
- [ ] 已读当前要改的 screen / component 文件全文
- [ ] 若改 UI：先用 `ecc:frontend-design` 评估
- [ ] 若写新功能：先 `superpowers:brainstorming` → `superpowers:writing-plans`
- [ ] 若修 bug：先 `superpowers:systematic-debugging` 立证据链

---

**最后更新**：2026-04-21
