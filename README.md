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
│ 1. GitHub Actions 定时触发（北京时间 08:30）    │
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

之后每天 UTC 00:30（北京时间 08:30）自动执行，无需任何操作。

### 4. Token 过期处理

Authorization 有效期有限。过期后：

- **手动更新**：重新用方式一抓包，更新 Secrets 中的 `AUTHORIZATION`
- **自动同步**：配置 Loon 抓包后自动更新 GitHub Secrets（见下方）

### 5. 通知配置（可选）

安装 iOS App [Bark](https://apps.apple.com/app/bark/id1403753865)，复制设备链接（形如 `https://api.day.app/xxxx`），填入 `NOTIFY_URL` Secret。签到完成后会推送结果到手机。

---

## 凭证自动同步（Loon → GitHub Actions）

Loon 抓包获取新凭证后，自动更新 GitHub Actions Secrets，彻底告别手动更新。

### 方案对比

| 方案 | 原理 | 复杂度 | 推荐 |
|------|------|--------|------|
| A | Loon 直接调 GitHub Secrets API | 高（需在 Loon 中实现 libsodium 加密） | |
| B | 通过 Cloudflare Worker 代理 | 中（需部署一个 Worker） | ★ |

### 推荐方案 B：Worker 代理

Loon 抓包后只需发一个 HTTP POST 到 Worker，Worker 负责加密和调 GitHub API。Loon 端无需处理复杂的 libsodium 加密。

```
Loon 抓包成功（凭证已更新）
  → POST {auth, deviceId} 到 Cloudflare Worker
  → Worker 加密并调 GitHub Secrets API
  → 更新完成 → 推送通知
```

**所需材料：**
- GitHub Personal Access Token（`repo` 权限）
- Cloudflare 账号（免费额度足够，每天调用个位数）

**为什么不用方案 A？** GitHub Secrets API 要求用 libsodium `crypto_box_seal` 加密 secret 值。Loon 运行在 JavaScriptCore 上，缺少原生 crypto 模块，纯 JS 实现 nacl 体积大且维护成本高。加一层 Worker 代理，复杂的加密逻辑放在服务端，Loon 端保持轻量。

> 此功能待开发，暂时使用手动更新方式。

---

## 项目结构

```
├── sign.js                        # Node.js 签到脚本（GitHub Actions 用）
├── .github/workflows/sign.yml     # Actions 定时任务配置
├── loon/                          # Loon 插件
│   ├── ninebot-auto-sign.plugin   # 插件定义（MITM + Cron + Script）
│   └── scripts/
│       ├── ninebot-sign.js        # 签到逻辑（兼容 Surge/QX/Loon）
│       └── boxjs-cors.js          # BoxJS 跨域兼容
└── boxjs/
    └── ninebot.boxjs.json         # BoxJS 数据模型
```

## 常见问题

**Secrets 安全吗？**

安全。GitHub Secrets 加密存储，只在 Actions 运行时解密注入。公开仓库也不会泄露。运行日志中 Secrets 值会被自动打码。

**怎么知道 Token 过期了？**

如果配了 Bark 通知，签到失败会推送。没配的话，偶尔去 Actions 看看最近的运行日志。

**GitHub Actions 免费吗？**

免费。公开仓库无限使用，私有仓库每月 2000 分钟。每天跑一次消耗不到 1 分钟。

**Loon 抓包后必须手动复制到 Secrets 吗？**

当前是的。配置「凭证自动同步」后可以自动化，见上方对应章节。