# NineSync AutoPunch

九号电动车自动签到，支持两种运行方式：

| 方式 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| GitHub Actions（推荐） | 服务端定时执行 | 不需手机、不需 VPN | Token 过期后需手动更新 |
| Loon 插件 | 手机端 MITM + cron | 抓包自动刷新 Token | 需保持 VPN 开启 |

---

## 方式一：GitHub Actions

### 前置条件

需要一个可用的九号 API 凭证（Authorization + DeviceId）。用下面的 Loon 插件抓取。

### 1. 抓取凭证

用 Loon 插件抓一次包，获取凭证：

1. Safari 打开安装插件：
   ```
   loon://import?plugin=https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/loon/ninebot-auto-sign.plugin
   ```
2. Loon → 插件 → 编辑参数 → 打开「自动抓包开关」
3. 开启 Loon VPN → 打开九号出行 App → 进入签到页面
4. 收到"凭证已更新"通知即抓包成功

### 2. 获取凭证值

凭证被写入了 BoxJS。Safari 打开 BoxJS，在「MK2-DATA」→「九号签到数据」中找到：

- **Authorization** — 一段很长的 JWT Token
- **DeviceId** — 类似 `6EF1C84C-0175-4901-BBCE-1DCE38036E7C` 的 UUID

复制这两段值。

> 如果 BoxJS 中没有数据，确认第 1 步抓包成功。BoxJS 订阅链接：
> ```
> http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/boxjs/ninebot.boxjs.json
> ```

### 3. 配置 GitHub Actions

1. 打开你的 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 点击「New repository secret」，逐个添加：

   | Name | Value | 说明 |
   |------|-------|------|
   | `AUTHORIZATION` | 第 2 步复制的 JWT Token | 必需 |
   | `DEVICE_ID` | 第 2 步复制的 UUID | 必需 |
   | `AUTO_OPEN_BOX` | `true` | 自动开盲盒（可选） |
   | `AUTO_REPAIR` | `true` | 签到失败自动补签（可选） |
   | `NOTIFY_URL` | Bark 链接 | 结果推送（可选，见下方） |

3. Actions 标签页 → 点击「Ninebot Auto Sign」→ 「Enable workflow」

### 4. 测试

Actions → Ninebot Auto Sign → 「Run workflow」→ 绿色按钮手动触发。查看运行日志确认签到成功。

之后每天 UTC 00:30（北京时间 08:30）自动执行，无需任何操作。

### 5. Token 过期处理

Authorization 有效期有限。过期后 GitHub Actions 日志会显示签到失败。此时重新执行第 1、2 步获取新 Token，然后更新 Secrets 中的 `AUTHORIZATION` 即可。

### 6. 通知配置（可选）

安装 iOS App [Bark](https://apps.apple.com/app/bark/id1403753865)，复制设备链接（形如 `https://api.day.app/xxxx`），填入 `NOTIFY_URL` Secret。每次签到完成后会推送结果到手机。

---

## 方式二：Loon 插件

适合希望手机端全自动运行的用户。插件安装后：

- **抓包**：打开九号 App 签到页时自动提取凭证写入 BoxJS
- **签到**：每天 cron 时间自动执行签到 + 盲盒 + 补签

安装链接：
```
loon://import?plugin=https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/loon/ninebot-auto-sign.plugin
```

安装后可编辑参数调整 cron 时间、通知开关等。

> 注意：Loon cron 依赖 VPN 保持开启。如果日常使用其他 VPN，建议用方式一。

---

## 项目结构

```
├── sign.js                        # Node.js 签到脚本（GitHub Actions 用）
├── .github/workflows/sign.yml     # Actions 定时任务配置
├── loon/                          # Loon 插件（用于抓包）
│   ├── ninebot-auto-sign.plugin
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