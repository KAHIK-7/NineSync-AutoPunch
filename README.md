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

若已配置 [凭证自动同步](#凭证自动同步loon--github-actions)，此时也会自动推送到 GitHub Actions Secrets。

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

每次 Loon 抓包时自动将凭证推送到 GitHub Actions Secrets，彻底告别手动更新。

### 原理

```
Loon 抓包（MITM 拦截九号 API）
  → 提取 Auth / DeviceId 写入 BoxJS
  → POST 到 Cloudflare Worker（HTTPS）
  → Worker 用 libsodium sealed box 加密
  → Worker 调 GitHub Secrets API 写入
  → 完成 → Loon 收到通知
```

GitHub Secrets API 要求用 libsodium `crypto_box_seal` 加密，Loon 的 JavaScriptCore 引擎没有原生 crypto 模块，所以加一层 Cloudflare Worker 代理做加密。Loon 端只需发一个简单的 HTTPS POST，完全不增加复杂度。

### 前置条件

| 材料 | 说明 |
|------|------|
| GitHub Personal Access Token | 经典令牌，勾选 `repo` 权限 |
| Cloudflare 账号 | 免费，Worker 每日请求量在免费额度内 |
| Node.js + npm | 本地部署 Worker 用（WSL / macOS 均可） |

### 第 1 步：创建 GitHub PAT

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. 权限选 **Only select repositories** → 选择 `NineSync-AutoPunch`
4. 勾选 `repo` 权限（含读写 Secrets）
5. 生成后复制 token（只显示一次）

### 第 2 步：部署 Cloudflare Worker

```bash
# 1. 安装 Wrangler CLI（一次性）
npm install -g wrangler

# 2. 登录 Cloudflare（WSL 用户先创建 API Token 再用环境变量）
#    Dashboard → Profile → API Tokens → Create Token → 编辑 Cloudflare Workers 模板
#    然后：
export CLOUDFLARE_API_TOKEN="你的API令牌"

# 3. 进入 worker 目录，安装依赖
cd worker
npm install

# 4. 配置 Worker 环境变量（敏感信息用 secret 存储）
npx wrangler secret put GITHUB_TOKEN     # GitHub PAT（第 1 步创建的）
npx wrangler secret put GITHUB_OWNER     # GitHub 用户名（如 KAHIK-7）
npx wrangler secret put GITHUB_REPO      # 仓库名（如 NineSync-AutoPunch）

# 5. 部署
npx wrangler deploy
```

部署成功后输出 Worker URL，形如：

```
https://ninesync-secrets-worker.xxxx.workers.dev
```

记下这个 URL，下一步要用。

### 第 3 步：配置 BoxJS

1. Safari 打开 BoxJS → 「NineBot-DATA」→「九号签到数据」
2. 找到 **Worker地址** 字段，填入上一步的 Worker URL
3. 保存

> 如果没看到 Worker地址 字段，说明 BoxJS 订阅的配置是旧版本。重新订阅一次：
> ```
> http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/boxjs/ninebot.boxjs.json
> ```

### 第 4 步：添加手动同步脚本（可选）

自动同步已内置在抓包流程中。如需一个可手动触发的备用按钮：

1. Loon → 配置 → 脚本 → 右上角 ⊕ → 本地脚本
2. 脚本名称填 `九号-同步GitHub`，脚本类型选 `cron`
3. Cron 时间随意（如 `0 0 1 1 0`，不依赖 cron 自动执行）
4. 内容复制 `loon/scripts/sync-secrets.js` 的全部代码
5. 保存后在脚本列表点击即可手动执行

### 测试

1. 确保 Loon VPN 开启
2. 打开九号出行 App → 进入签到页面
3. 查看 Loon 日志：应显示 "GitHub Secrets 同步成功"
4. 去 GitHub 仓库 → Settings → Secrets → 检查 `AUTHORIZATION` 和 `DEVICE_ID` 的更新时间

如果 Loon 日志显示 Worker 调用成功但 GitHub Secrets 没变化，检查：
- GitHub PAT 是否有 `repo` 权限
- Worker 的三个 secret（GITHUB_TOKEN / OWNER / REPO）是否正确
- 在 Cloudflare Dashboard → Workers & Pages → `ninesync-secrets-worker` → Logs 查看 Worker 端错误

### 管理 Worker

| 操作 | 方式 |
|------|------|
| 查看实时日志 | `npx wrangler tail`（在 worker 目录下） |
| 更新代码 | `npx wrangler deploy` |
| 更换 PAT | `npx wrangler secret put GITHUB_TOKEN` 或在 Dashboard 网页修改 |
| 删除 Worker | Cloudflare Dashboard → Workers & Pages → 找到 Worker → Settings → Delete |

> 删除本地 `worker/` 目录不会影响云端。云端 Worker 需在 Cloudflare Dashboard 单独删除。

---

## 项目结构

```
├── sign.js                        # Node.js 签到脚本（GitHub Actions 用）
├── .github/workflows/sign.yml     # Actions 定时任务配置
├── loon/                          # Loon 插件
│   ├── ninebot-auto-sign.plugin   # 插件定义（MITM + Cron + Script）
│   └── scripts/
│       ├── ninebot-sign.js        # 签到逻辑 + 抓包自动同步（兼容 Surge/QX/Loon）
│       ├── sync-secrets.js        # 手动凭证同步脚本（备用）
│       └── boxjs-cors.js          # BoxJS 跨域兼容
├── worker/                        # Cloudflare Worker
│   ├── package.json
│   ├── wrangler.toml
│   └── src/
│       └── index.js               # 接收 Loon POST → 加密 → 调 GitHub Secrets API
└── boxjs/
    └── ninebot.boxjs.json         # BoxJS 数据模型
```

## 常见问题

**Secrets 安全吗？**

安全。GitHub Secrets 加密存储，只在 Actions 运行时解密注入。公开仓库也不会泄露。运行日志中 Secrets 值会被自动打码。

**Worker 传输凭证安全吗？**

安全。Loon → Worker 走 HTTPS 加密传输，Worker → GitHub API 也走 HTTPS。Worker 本身不存储凭证，收到即加密转发，处理完即丢弃。

**怎么知道 Token 过期了？**

如果配了 Bark 通知，签到失败会推送。没配的话，偶尔去 Actions 看看最近的运行日志。

**GitHub Actions 免费吗？**

免费。公开仓库无限使用，私有仓库每月 2000 分钟。每天跑一次消耗不到 1 分钟。

**Cloudflare Worker 免费吗？**

免费。免费额度每天 10 万次请求。每次抓包才调用 1 次，一天个位数，碰不到零头。

**Loon 抓包后必须手动复制到 Secrets 吗？**

不需要。配置好凭证自动同步后，每次抓包自动推送。旧 Token 过期后，打开一次九号 App 签到页即可自动刷新 GitHub Secrets。