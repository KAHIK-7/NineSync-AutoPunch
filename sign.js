// NineSync AutoPunch — 九号电动车签到脚本（Node.js 独立版）
// 用法: AUTHORIZATION=xxx DEVICE_ID=xxx node sign.js
//
// 环境变量:
//   AUTHORIZATION    - 九号 API 鉴权 Token（必需）
//   DEVICE_ID        - 设备 ID（必需）
//   AUTO_OPEN_BOX    - 是否自动开盲盒，默认 false
//   AUTO_REPAIR      - 是否自动补签，默认 false
//   NOTIFY_URL       - Bark 通知 URL，可选 (https://api.day.app/your-key)
//   USER_AGENT       - 请求 UA，有默认值

const AUTH = process.env.AUTHORIZATION;
const DEVICE_ID = process.env.DEVICE_ID;
const AUTO_OPEN_BOX = process.env.AUTO_OPEN_BOX === "true";
const AUTO_REPAIR = process.env.AUTO_REPAIR === "true";
const NOTIFY_URL = process.env.NOTIFY_URL || "";
const UA = process.env.USER_AGENT || "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0";

const END = {
  sign:            "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
  status:          "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
  blindBoxList:    "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
  blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
  balance:         "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
  creditInfo:      "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
  repairSign:      "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair",
};

const HEADERS = {
  "Authorization": AUTH,
  "Content-Type": "application/json",
  "device_id": DEVICE_ID,
  "User-Agent": UA,
  "platform": "h5",
  "Origin": "https://h5-bj.ninebot.com",
  "language": "zh",
  "aid": "10000004",
  "accept": "application/json",
  "accept-language": "zh-CN,zh-Hans;q=0.9",
  "referer": "https://h5-bj.ninebot.com/",
};

function today() {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).replace(/\//g, "-");
}

async function notify(title, body) {
  console.log(`[通知] ${title}: ${body}`);
  if (!NOTIFY_URL) return;
  try {
    await fetch(`${NOTIFY_URL}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`);
  } catch (e) { /* ignore */ }
}

async function request(method, url, body) {
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (data.code !== 0 && data.code !== undefined && !data.msg?.includes("已签到")) {
    throw new Error(data.msg || data.message || `code=${data.code}`);
  }
  return data;
}

async function main() {
  if (!AUTH || !DEVICE_ID) {
    console.error("缺少 AUTHORIZATION 或 DEVICE_ID 环境变量");
    process.exit(1);
  }

  // 1. 检查签到状态
  const status = await request("GET", `${END.status}?t=${Date.now()}`);
  const statusData = status.data || {};
  const isSigned = [1, "1", true, "true"].includes(statusData.currentSignStatus);
  const consecutiveDays = statusData.consecutiveDays || 0;
  const signCards = statusData.signCardsNum || 0;

  console.log(`签到状态: ${isSigned ? "已签到" : "未签到"} | 连续: ${consecutiveDays}天 | 补签卡: ${signCards}张`);

  let signMsg = "";

  // 2. 签到
  if (!isSigned) {
    try {
      const signResp = await request("POST", END.sign, { deviceId: DEVICE_ID });
      if (signResp.code === 0) {
        const exp = (signResp.data?.rewardList || [])
          .filter(r => r.rewardType === 1)
          .reduce((s, r) => s + Number(r.rewardValue), 0);
        signMsg = `签到成功 +${exp}经验`;
        console.log(signMsg);
      }
    } catch (e) {
      signMsg = `签到失败: ${e.message}`;
      console.error(signMsg);

      // 自动补签
      if (AUTO_REPAIR && signCards > 0) {
        try {
          const repairResp = await request("POST", END.repairSign, { deviceId: DEVICE_ID });
          if (repairResp.code === 0) {
            signMsg += ` | 补签成功 (剩余${signCards - 1}张)`;
          }
        } catch (e2) {
          signMsg += ` | 补签失败: ${e2.message}`;
        }
      }
    }
  } else {
    signMsg = "今日已签到";
  }

  // 3. 盲盒
  let boxMsg = "";
  if (AUTO_OPEN_BOX) {
    try {
      const boxResp = await request("GET", `${END.blindBoxList}?t=${Date.now()}`);
      const notOpened = boxResp.data?.notOpenedBoxes || [];
      const available = notOpened.filter(b => Number(b.leftDaysToOpen || b.remaining) === 0);
      if (available.length > 0) {
        const results = [];
        for (const box of available) {
          const rid = box.rewardId || box.id;
          if (!rid) continue;
          try {
            const openResp = await request("POST", END.blindBoxReceive, { rewardId: rid });
            if (openResp.code === 0) {
              const type = openResp.data?.rewardType === 1 ? "经验" : "N币";
              results.push(`+${openResp.data?.rewardValue || 0}${type}`);
            }
          } catch (e) { results.push(`失败:${e.message}`); }
          await new Promise(r => setTimeout(r, 1500));
        }
        boxMsg = `盲盒: ${results.join(", ")}`;
        console.log(boxMsg);
      } else {
        boxMsg = `盲盒: 无可开 (待开${notOpened.length}个)`;
      }
    } catch (e) {
      boxMsg = `盲盒查询失败: ${e.message}`;
    }
  }

  // 4. 积分 & N币
  let creditInfo = "等级: 未知";
  try {
    const cr = await request("GET", END.creditInfo);
    const cd = cr.data || {};
    creditInfo = `等级: LV${cd.level || "?"} 经验: ${cd.credit || 0}`;
  } catch (e) { /* ignore */ }

  let nCoin = "";
  try {
    const bal = await request("GET", END.balance);
    nCoin = `N币: ${bal.data?.balance || 0}`;
  } catch (e) { /* ignore */ }

  // 5. 通知
  const msg = [`[九号签到 ${today()}]`, signMsg, creditInfo, nCoin, boxMsg]
    .filter(Boolean).join("\n");
  console.log("\n" + msg);
  await notify("九号签到", msg.replace(/\n/g, " | "));
}

main().catch(e => {
  console.error("执行异常:", e);
  process.exit(1);
});