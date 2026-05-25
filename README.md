# NineSync AutoPunch

九号电动车自动签到，支持两种运行方式：

| 方式 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| Loon 插件（推荐） | 手机端 MITM + cron | 抓包自动刷新 Token，全自动 | 需保持 VPN 开启 |
| GitHub Actions | 服务端定时执行 | 不需手机、不需 VPN | Token 过期后需手动更新或配置自动同步 |

---

## 方式一：Loon 插件（推荐）

### 流程概览

```
┌─ 一次性配置 ───────────────────────────────────┐
│ 1. Safari 订阅 BoxJS 配置（定义数据存储模型）     │
│ 2. Loon 安装插件（定义 MITM + Cron 规则）        │
└────────────────────────────────────────────────┘
                      ↓
┌─ 凭证获取（每次打开九号 App 签到页时）──────────┐
│ Loon VPN → MITM 拦截 API → 提取 Auth/DeviceId  │
│ → 自动写入 BoxJS 持久化存储                    │
│ → 自动同步到 GitHub Actions（如已配置 Worker）  │
└────────────────────────────────────────────────┘
                      ↓
┌─ 每日自动签到（cron 时间触发）──────────────────┐
│ Loon 定时执行 ninebot-sign.js                  │
│ → 从 BoxJS 读取凭证 → 调用九号签到 API          │
│ → 自动开盲盒 → 通知推送结果                     │
└────────────────────────────────────────────────┘
```

### 1. 订阅 BoxJS

BoxJS 是 Loon 生态的持久化存储系统，用于保存抓包获取的凭证和脚本配置。

Safari 打开以下链接一键订阅：

```
http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/boxjs/ninebot.boxjs.json
```

订阅后可在 BoxJS → 「NineBot-DATA」→「九号签到数据」中查看所有配置项。

### 2. 安装 Loon 插件

Safari 打开以下链接，一键导入插件：

```
loon://import?plugin=https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/loon/ninebot-auto-sign.plugin
```

插件自动配置了 MITM、Script 和 Rewrite 规则，无需手动修改。

### 3. 抓取凭证

1. 开启 Loon VPN
2. 打开九号出行 App → 进入签到页面
3. 收到「凭证已更新」通知即抓包成功

凭证（Authorization、DeviceId）自动写入 BoxJS，之后每日 cron 签到脚本从 BoxJS 读取。

### 4. 配置参数（可选）

Loon → 插件 → 编辑参数，可调整：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 自动盲盒 | 关闭 | 签到后自动开启可领取的盲盒 |
| 自动补签 | 关闭 | 签到失败时自动使用补签卡 |
| Cron 时间 | 08:30 | 每日签到时间 |
| 通知 | 开启 | 推送签到结果通知 |

> Loon cron 依赖 VPN 保持开启。如果日常使用其他 VPN，建议用方式二。

---

## 方式二：GitHub Actions

不需要手机和 VPN，服务端定时执行。适合不方便保持 VPN 的用户，或作为 Loon 方案的补充备用。

### 流程概览

```
┌─ 一次性配置 ─────────────────────────────────┐
│ 1. 用方式一抓取凭证（Authorization + DeviceId） │
│ 2. 填入 GitHub Secrets                       │
└──────────────────────────────────────────────┘
                      ↓
┌─ 每日自动签到 ────────────────────────────────┐
│ 1. GitHub Actions 定时触发                    │
│ 2. 从 Secrets 读取凭证 → 调用九号签到 API      │
│ 3. 结果推送 Bark 通知（可选）                  │
└──────────────────────────────────────────────┘
```

### 1. 获取凭证

先用方式一（Loon 插件）抓一次包。

Safari 打开 BoxJS，在「NineBot-DATA」→「九号签到数据」中找到：

- **Authorization** — 一段很长的 JWT Token
- **DeviceId** — 类似 `6EF1C84C-0175-4901-BBCE-1DCE38036E7C` 的 UUID

复制这两段值备用。

### 2. 配置 GitHub Secrets

1. Fork 本仓库到你自己的 GitHub 账号
2. 你的仓库 → Settings → Secrets and variables → Actions
3. 点击「New repository secret」，逐个添加：

| Name | Value | 必需 |
|------|-------|------|
| `AUTHORIZATION` | BoxJS 中复制的 JWT Token | 是 |
| `DEVICE_ID` | BoxJS 中复制的 UUID | 是 |
| `AUTO_OPEN_BOX` | `true` | 否 |
| `AUTO_REPAIR` | `true` | 否 |
| `NOTIFY_URL` | Bark 链接 | 否 |

> Secrets 是独立的键值对（不是 JSON 格式），每个分别用 Name + Value 两栏填写。

### 3. 启用并测试

1. 你的仓库 → Actions 标签页 → 找到「Ninebot Auto Sign」→ Enable workflow
2. 点击「Run workflow」→ 绿色按钮手动触发
3. 查看运行日志确认签到成功

之后每天定时自动执行，无需任何操作。

### 4. 配置 Cron 时间

编辑 `.github/workflows/sign.yml` 中的 `cron` 表达式。GitHub Actions 使用 **UTC 时间**，北京时间 = UTC + 8：

| 北京时间 | UTC Cron |
|----------|----------|
| 00:01 | `1 16 * * *` |
| 08:05 | `5 0 * * *` |
| 08:30 | `30 0 * * *` |

修改后 commit push，下次开始按新时间执行。

### 5. Token 过期处理

Authorization 有效期有限。过期后：

- **手动更新**：重新用方式一抓包，更新 Secrets 中的 `AUTHORIZATION`
- **自动同步**：配置凭证自动同步（见下方），抓包时自动更新 Secrets

### 6. 通知配置（可选）

安装 iOS App [Bark](https://apps.apple.com/app/bark/id1403753865)，复制设备链接（形如 `https://api.day.app/xxxx`），填入 `NOTIFY_URL` Secret。签到完成后会推送结果到手机。

---

## 凭证自动同步（Loon → GitHub Actions）

Token 过期后，只需在 Loon 中手动触发一次同步脚本，即可将 BoxJS 中已抓取的凭证推送到 GitHub Secrets，无需打开电脑。

### 原理

```
Loon 手动触发 sync-secrets.js
  → 从 BoxJS 读取 Auth / DeviceId / GitHub PAT
  → 调 GitHub API 获取仓库 public key
  → tweetnacl + blakejs 本地 libsodium 加密（纯 JS，内嵌脚本中）
  → PUT GitHub Secrets API 更新 AUTHORIZATION + DEVICE_ID
  → 通知推送结果
```

脚本自包含 tweetnacl 和 blakejs，无任何外部依赖。整个流程就是脚本直接调 GitHub API，中间不经过任何第三方服务。

### 第 1 步：创建 GitHub PAT

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. 权限选 **Only select repositories** → 选择 `NineSync-AutoPunch`
4. 勾选 `repo` 权限
5. 生成后复制 token（只显示一次）

### 第 2 步：配置 BoxJS

Safari 打开 BoxJS → 「NineBot-DATA」→「九号签到数据」，填入以下三个字段：

| 字段 | 值 | 说明 |
|------|-----|------|
| GitHub PAT | 第 1 步复制的 token | `ghp_xxxxxxxx` |
| GitHub 用户名 | 你的 GitHub ID | 如 `KAHIK-7` |
| GitHub 仓库名 | 仓库名 | 如 `NineSync-AutoPunch` |

> 如果没看到这三个字段，说明 BoxJS 订阅的是旧版配置。重新订阅一次：
> ```
> http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/boxjs/ninebot.boxjs.json
> ```

### 第 3 步：添加同步脚本

1. Loon → 配置 → 脚本 → 右上角 ⊕ → 本地脚本
2. 脚本名称填 `九号-同步GitHub`，脚本类型选 `cron`
3. Cron 时间随意（如 `0 0 1 1 0`，不依赖 cron 自动执行）
4. 内容复制 `loon/scripts/sync-secrets.js` 的全部代码
5. 保存

### 使用

Token 过期后：

1. 打开九号 App 签到页 → 抓包获取新凭证（自动写入 BoxJS）
2. Loon → 脚本列表 → 点击 `九号-同步GitHub` 执行
3. 收到「GitHub同步 成功」通知即完成

之后 GitHub Actions 便可用新凭证继续签到。

---

## 项目结构

```
├── sign.js                        # Node.js 签到脚本（GitHub Actions 用）
├── .github/workflows/sign.yml     # Actions 定时任务配置
├── loon/                          # Loon 插件
│   ├── ninebot-auto-sign.plugin   # 插件定义（MITM + Cron + Script）
│   └── scripts/
│       ├── ninebot-sign.js        # 签到逻辑（兼容 Surge/QX/Loon）
│       ├── sync-secrets.js        # 凭证同步脚本（自包含，内嵌 crypto）
│       └── boxjs-cors.js          # BoxJS 跨域兼容
├── worker/                        # Cloudflare Worker（已弃用，仅供参考）
│   ├── package.json
│   ├── wrangler.toml
│   └── src/index.js
└── boxjs/
    └── ninebot.boxjs.json         # BoxJS 数据模型
```

## 常见问题

**Secrets 安全吗？**

安全。GitHub Secrets 加密存储，只在 Actions 运行时解密注入。公开仓库也不会泄露。运行日志中 Secrets 值会被自动打码。

**同步脚本传输凭证安全吗？**

安全。脚本直接调 GitHub API（HTTPS），不经过任何第三方服务。GitHub PAT 加密存储在 BoxJS 中，仅在手机本地使用。

**怎么知道 Token 过期了？**

如果配了 Bark 通知，签到失败会推送。没配的话，偶尔去 Actions 看看最近的运行日志。

**GitHub Actions 免费吗？**

免费。公开仓库无限使用，私有仓库每月 2000 分钟。每天跑一次消耗不到 1 分钟。

**Loon 抓包后必须手动复制到 Secrets 吗？**

不需要。配置好同步脚本后，Token 过期 → 打开九号 App 抓包 → Loon 里点一下同步脚本 → 完成。全程在手机上操作，不需要电脑。