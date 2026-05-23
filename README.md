# NineSync-AutoPunch

基于 Loon + BoxJS 的九号电动车全自动签到工具。

## 前提条件

- iOS 15+
- [Loon](https://apps.apple.com/app/loon/id1373567447)（付费代理工具）
- [BoxJS](https://boxjs.com)（订阅配置管理，Safari 打开即可）

## 项目结构

```
NineSync-AutoPunch/
├── loon/                          # Loon 插件 + 核心脚本
│   ├── ninebot-auto-sign.plugin   # 主插件
│   └── scripts/
│       ├── ninebot-sign.js        # 签到脚本（兼容 Surge/QX/Loon）
│       └── boxjs-cors.js          # BoxJS 跨域辅助
├── boxjs/                         # BoxJS 配置
    └── ninebot.boxjs.json         # 数据模型（凭证/车辆/设置）

```

## 配置步骤

### 1. 订阅 BoxJS 配置

首先在 Safari 中打开 BoxJS 并订阅数据配置：

```
http://boxjs.com/#/sub/add/https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/boxjs/ninebot.boxjs.json
```

订阅后会新增一个名为「九号·数据」的应用，其中包含 20 个配置项（鉴权凭证、车辆数据、通知设置等）。此时所有字段均为空，需要下一步抓包填入。

> 如果订阅时提示格式错误，刷新页面后重新点击订阅链接即可。BoxJS 首次加载 raw.githubusercontent.com 时偶发超时。

### 2. 安装 Loon 插件

Safari 打开以下链接，会自动跳转到 Loon 并安装插件：

```
loon://import?plugin=https://raw.githubusercontent.com/KAHIK-7/NineSync-AutoPunch/main/loon/ninebot-auto-sign.plugin
```

安装后在 Loon → 插件页面编辑参数：

| 参数 | 建议值 | 说明 |
|------|--------|------|
| `capture` | **true** | 自动抓包开关 |
| `notify` | **true** | 签到结果通知 |
| `cron_time` | **`30 0 * * *`** | 每天 00:30 自动签到 |
| `autoOpenBox` | **true** | 自动开启可领取的盲盒 |

### 3. 抓包获取凭证

1. 打开 Loon，**开启 VPN**
2. 打开九号出行 App → 进入「签到」页面（触发签到状态接口）
3. Loon 自动拦截 API 请求，提取 Authorization / DeviceId 并写入 BoxJS
4. 返回 Safari 刷新 BoxJS 页面，确认 `ninebot.authorization` 已有值

> 凭证有效期有限，如果签到失败，重新进入九号 App 签到页即可自动刷新。

### 4. 验证签到

在 Loon → 脚本页面 → 找到「九号-自动签到」→ 点击运行一次，检查是否收到签到成功通知。

之后每天会在设定的 cron 时间自动执行，无需手动操作。

## Cron 时间配置

Loon 插件使用标准 5 位 cron 表达式：

```
格式：分 时 日 月 周

30 0 * * *   = 每天 00:30（推荐，签到刷新时间点）
0 8 * * *    = 每天 08:00
0 22 * * *   = 每天 22:00
0 0 * * 0    = 每周日 00:00
```

修改方式：Loon → 长按插件 → 编辑参数 → `签到时间（CRON）` → 填入新的表达式。

## 工作原理

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
                      ↓
┌─ 小组件展示（可选）────────────────────────────┐
│ Scriptable 桌面小组件读取 BoxJS 数据            │
│ → 显示签到状态 / N币 / 等级 / 盲盒进度          │
└────────────────────────────────────────────────┘
```

## 常见问题

### 签到没触发？

1. 检查 Loon VPN 是否在 cron 时间到达前已连接
2. 检查 BoxJS 中 `ninebot.authorization` 是否为空（如为空需重新抓包）
3. 在 Loon 脚本页手动运行测试一次，查看日志输出

### Token 过期？

九号 App 的 Authorization 会过期。重新打开九号 App 的签到页面（Loon VPN 需开启），插件会自动刷新凭证写入 BoxJS。

### 车辆数据不显示？

需要在九号 App 中查看车辆状态页面（触发车辆 API 请求），插件才会拦截并同步车辆数据（电量、里程、设防状态等）。

### 必须一直开着 VPN 吗？

- **抓包时**：需要开 VPN（打开九号 App 签到页的那几秒钟）
- **签到执行时**：需要开 VPN（cron 触发的那几秒）
- **其余时间**：不需要，可以关闭 VPN 省电

Loon 的 cron 是系统级定时器，即使你临时关了 VPN，只要在 cron 时间前重新打开即可。签到本身只需要几秒钟的网络请求。

### 不想要 Loon，能用其他方式吗？

可以，但各有取舍：

| 方案 | 优点 | 缺点 |
|------|------|------|
| Loon（推荐） | 全自动抓包刷新 Token | 付费，需 VPN |
| iOS 快捷指令 + Scriptable | 免费，无需 VPN | Token 需手动抓取和定期更新 |
| Surge / Quantumult X | 同 Loon 逻辑 | 同样付费 |

## 致谢

- 基于 [QinyRui/QYR-](https://github.com/QinyRui/QYR-) 的开源项目重构
- Telegram 社区: [t.me/JiuHaoAPP](https://t.me/JiuHaoAPP)