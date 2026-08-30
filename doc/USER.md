# QuickLink — 用户信息管理模块

> 模块文档之一。总览见 [BUILD.md](./BUILD.md)，其余模块：[链接管理](./LINKS.md) / [笔记管理](./NOTES.md)。

## 1. 功能概览

注册/登录（记住密码/自动登录）、登录密码可凭注册邮箱找回、修改登录密码、外观主题（跟随系统/浅色/深色）、开机自启（桌面版）、退出登录。

> 主密码功能已于 2026-08 全局移除：账号凭据改为明文存储、可直接查看，详见 §6。

**代码位置**：

| 端 | 目录 | 文件 |
| -- | ---- | ---- |
| 服务端 | `server/src/modules/user/` | `authController.ts`、`routes.ts` |
| 前端 | `client/src/modules/user/` | `LoginPage.tsx`（含忘记密码）、`RegisterPage.tsx`、`SettingsModal.tsx`（设置弹窗） |
| 前端（共享） | `client/src/` | `stores/authStore.ts`（Zustand 认证态）、`stores/themeStore.ts`（Zustand 外观主题态）、`services/settings.ts`（本地设置与凭据记忆）、`layout/AppLayout.tsx`（用户下拉） |

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
- **主侧栏用户下拉**：退出登录。
- **设置弹窗**：外观主题（跟随系统/浅色/深色，默认跟随系统，背景色随系统深浅色自动切换）、开机自启（仅桌面版，Web 禁用并提示）、记住密码、自动登录；均存 `localStorage quicklink:settings`（主题态另由 `themeStore` 响应式分发，机制见 [BUILD.md §8](./BUILD.md)）。
- **认证态**：Zustand `authStore`（`user / token / isAuthenticated / login / register / logout / autoLogin`）；请求拦截自动附加 `Authorization: Bearer`；401 自动清理并跳登录（登录/注册页豁免）。

## 6. 设计决策

- **bcryptjs 替代 bcrypt**：原生 bcrypt 依赖 node-gyp/C++ 工具链；bcryptjs 纯 JS，跨平台一致，且随桌面包免重建。
- **移除主密码（2026-08）**：单机个人工具场景下主密码交互成本高（每次查看凭据均需输入），收益有限，故全局移除：删除主密码设置/修改/重置接口与前端弹窗，凭据改为明文存储、直接查看；同步删除 `ENCRYPTION_SALT` 配置与 AES 加解密实现。存量旧版密文无法迁移，接口以占位提示呈现（`isLegacyCipher` 识别）。
- **记住密码/自动登录本地凭据**：单机个人工具，威胁模型为本机其他应用读取浏览器存储；base64 混淆仅为避免明文裸奔。自动登录仅启动时一次；开机自启为系统级能力仅桌面版生效。
