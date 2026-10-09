# QuickLink — 用户信息管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[链接管理](./LINKS.md) / [笔记管理](./NOTES.md) / [接口管理](./API.md)。

## 1. 功能概览

注册/登录（记住密码/自动登录）、登录密码可凭注册邮箱找回、修改登录密码、外观主题（跟随系统/浅色/深色）、全局字体选择、开机自启（桌面版）、账号信息（用户名/注册邮箱）与退出登录（均并入设置弹窗）。

> 主密码功能已于 2026-08 全局移除：账号凭据改为明文存储、可直接查看，详见 §6。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/user/` | `authController.ts`、`routes.ts` |
| 前端 | `client/src/modules/user/` | `LoginPage.tsx`（含忘记密码）、`RegisterPage.tsx`、`SettingsModal.tsx`（设置弹窗，含账号信息与退出登录） |
| 前端（共享） | `client/src/` | `stores/authStore.ts`（Zustand 认证态）、`stores/themeStore.ts`（Zustand 外观主题态）、`services/settings.ts`（本地设置与凭据记忆）、`layout/AppLayout.tsx`（侧栏布局，底部仅设置/收起展开两个按钮） |

## 2. 数据模型

### users

```json
{ "_id": "uuid", "username": "unique", "email": "unique",
  "passwordHash": "bcryptjs", "createdAt": "ISO", "updatedAt": "ISO" }
```

> 存量用户文档可能残留 `masterKey` / `masterPasswordHash` 字段，代码不再读写。

索引：`users(username, unique)`、`users(email, unique)`。

## 3. 安全设计

```
登录密码 ──► bcryptjs hash (12 rounds) ──► passwordHash (登录验证; 忘记凭 用户名+注册邮箱 重置)
```

- 仅保留登录密码单一密码体系；账号凭据（链接关联账号/旧 accounts 集合）明文存储于数据库，接口直接返回、前端可直接查看。
- 列表类接口（链接列表、旧 accounts 列表）仍不返回凭据内容，仅 `/secrets`、`/:id`、`/:id/password` 按需返回。
- 存量旧版密文（`{"iv":"...","encrypted":"...","authTag":"..."}` JSON 格式）已无法解密，接口统一转为占位提示「（旧版密文, 无法查看）」（`cryptoService.isLegacyCipher` 识别）。

`cryptoService` 现仅提供 `generatePassword(length)` 工具函数（默认 16 位，含大小写/数字/符号，用于旧 accounts 路由的随机密码生成）与 `isLegacyCipher` 兼容识别；原 AES-256-GCM 加解密实现（`config/crypto.ts`）已删除。

## 4. API

| Method | Path | 描述 | 认证 |
| ------ | ---- | ---- | ---- |
| POST | /api/auth/register | 注册（邮箱必填） | No |
| POST | /api/auth/login | 登录 | No |
| POST | /api/auth/reset-password | 重置登录密码（用户名+注册邮箱验证） | No |
| GET | /api/auth/me | 当前用户 | Yes |
| PUT | /api/auth/password | 修改登录密码 | Yes |

## 5. 前端交互

- **登录页**：用户名+密码，提供记住密码/自动登录勾选与「忘记密码」（凭用户名+注册邮箱重置）。
- **注册页**：用户名/邮箱/登录密码（至少 8 位）+ 确认密码。
- **记住密码/自动登录**：纯客户端能力，凭据 base64 轻度混淆存 `localStorage[quicklink:savedCredentials]`；自动登录仅启动且无 token 时静默尝试一次；与设置弹窗开关联动。
- **设置弹窗**：首行为**账号信息**（头像 + 当前登录用户名 + 「注册邮箱：xxx」，打开弹窗时调 `GET /api/auth/me` 刷新），其后依次为外观主题（跟随系统/浅色/深色，默认跟随系统，背景色随系统深浅色自动切换）、开机自启（仅桌面版，Web 禁用并提示）、记住密码、自动登录、全局字体（预设字体选项：IBM Plex Mono / Courier New / Consolas / Menlo / Monaco / 系统默认 / 等宽字体，亦支持自定义输入，留空使用默认字体；选中后实时生效，通过 CSS 变量 `--ql-font-family` 全局继承），末行为**退出登录**（danger 按钮 + Popconfirm 二次确认，确认后 `logout()` 清本地 token/user 并跳 `/login`，不动已保存凭据）；设置项均存 `localStorage quicklink:settings`（主题态另由 `themeStore` 响应式分发，机制见 [BUILD.md §8](./BUILD.md)）。
- **主侧栏**：底部仅保留「设置」与「收起/展开」两个按钮；原「用户信息」下拉入口（用户名 + 退出登录）已合并进设置弹窗（2026-10）。
- **认证态**：Zustand `authStore`（`user / token / isAuthenticated / login / register / logout / autoLogin`）；请求拦截自动附加 `Authorization: Bearer`；401 自动清理并跳登录（登录/注册页豁免）。

## 6. 设计决策

- **用户信息并入设置弹窗（2026-10）**：侧栏原「用户信息」下拉只承载单一动作（退出登录），与设置弹窗同属账号/偏好类操作，故合并到设置弹窗首尾两行（账号信息展示 + 退出登录），侧栏底部减为一个入口，降低导航区拥挤。
- **bcryptjs 替代 bcrypt**：原生 bcrypt 依赖 node-gyp/C++ 工具链；bcryptjs 纯 JS，跨平台一致，且随桌面包免重建。
- **移除主密码（2026-08）**：单机个人工具场景下主密码交互成本高（每次查看凭据均需输入），收益有限，故全局移除：删除主密码设置/修改/重置接口与前端弹窗，凭据改为明文存储、直接查看；同步删除 `ENCRYPTION_SALT` 配置与 AES 加解密实现。存量旧版密文无法迁移，接口以占位提示呈现（`isLegacyCipher` 识别）。
- **记住密码/自动登录本地凭据**：单机个人工具，威胁模型为本机其他应用读取浏览器存储；base64 混淆仅为避免明文裸奔。自动登录仅启动时一次；开机自启为系统级的能力仅桌面版生效。
- **全局字体选择**：用户可能偏好特定等宽字体以获得更好的代码/文本阅读体验；设置页提供预设选项（覆盖常见等宽字体）并支持自定义输入（tags 模式 Select）；通过 `App.tsx` 统一应用到 `document.body`、antd `ConfigProvider` token 和 CSS 变量 `--ql-font-family`，子组件（如接口管理代码区）可继承；同标签页内通过自定义事件 `quicklink:settings-changed` 实时同步，无需刷新。
