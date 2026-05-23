// NineSync AutoPunch — 九号电动车自动签到
// 适配 Loon / Surge / Quantumult X

/* 环境兼容封装 */
const IS_SCRIPTING = typeof $task!== "undefined";
const IS_REQUEST = typeof $request!== "undefined" || (IS_SCRIPTING && typeof $request!== "undefined");
const HAS_PERSIST = typeof $persistentStore!== "undefined" || (IS_SCRIPTING && typeof $prefs!== "undefined");
const HAS_NOTIFY = typeof $notification!== "undefined" || (IS_SCRIPTING && typeof $notify!== "undefined");
const HAS_HTTP = typeof $httpClient!== "undefined" || (IS_SCRIPTING && typeof $http!== "undefined");

// 跨环境持久化存储
function readPS(key) {
    try {
        return HAS_PERSIST
           ? (typeof $persistentStore!== "undefined"? $persistentStore.read(key) : $prefs.valueForKey(key))
            : null;
    } catch (e) { return null; }
}
function writePS(val, key) {
    try {
        return HAS_PERSIST
           ? (typeof $persistentStore!== "undefined"? $persistentStore.write(val, key) : $prefs.setValueForKey(val, key))
            : false;
    } catch (e) { return false; }
}

// 跨环境通知
function notify(title, sub, body) {
    if (!HAS_NOTIFY) return;
    try {
        if (typeof $notification!== "undefined") $notification.post(title, sub, body);
        else if (IS_SCRIPTING) $notify(title, sub, body);
    } catch (e) { console.log("通知异常：", e); }
}

// 工具函数
function nowStr() { return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }); }
function formatDateTime(date = new Date()) {
    const tz = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
    return tz.replace(/\//g, "-");
}

/* BoxJS 配置 */
const BOXJS_ROOT_KEY = "ComponentService";
const BOXJS_NINEBOT_KEY = "ninebot";
const BOXJS_URL = "http://boxjs.com";
/* BoxJS 存储键 */
const KEY_AUTH = "ninebot.authorization";
const KEY_DEV = "ninebot.deviceId";
const KEY_UA = "ninebot.userAgent";
const KEY_DEBUG = "ninebot.debug";
const KEY_NOTIFY = "ninebot.notify";
const KEY_AUTOBOX = "ninebot.autoOpenBox";
const KEY_NOTIFYFAIL = "ninebot.notifyFail";
const KEY_TITLE = "ninebot.titlePrefix";
const KEY_LAST_CAPTURE = "ninebot.lastCaptureAt";
const KEY_LOG_LEVEL = "ninebot.logLevel";
const KEY_LAST_SIGN_DATE = "ninebot.lastSignDate";
const KEY_ENABLE_RETRY = "ninebot.enableRetry";
const KEY_AUTO_REPAIR = "ninebot.autoRepairCard";

/* 接口地址 */
const END = {
    sign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/sign",
    status: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status",
    blindBoxList: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/list",
    blindBoxReceive: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/blind-box/receive",
    balance: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/balance?appVersion=609103606",
    creditInfo: "https://api5-h5-app-bj.ninebot.com/web/credit/get-msg",
    creditLst: "https://api5-h5-app-bj.ninebot.com/web/credit/credit-lst",
    nCoinRecord: "https://cn-cbu-gateway.ninebot.com/portal/self-service/task/account/money/record/v2",
    repairSign: "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/repair"
};

/* 重试/超时配置 */
const RETRY_CONFIG = {
    default: { max: 3, delay: 1500 },
    sign: { max: 2, delay: 1000 },
    blindBox: { max: 2, delay: 2000 },
    query: { max: 3, delay: 1500 }
};
const REQUEST_TIMEOUT = 12000;
const LOG_LEVEL_MAP = { silent: 0, simple: 1, full: 2 };

/* 日志分级 */
function getLogLevel() {
    const v = readPS(KEY_LOG_LEVEL) || "full";
    return LOG_LEVEL_MAP[v]?? LOG_LEVEL_MAP.full;
}
function logInfo(...args) {
    const level = getLogLevel();
    if (level < 2) return;
    console.log(`[${nowStr()}] INFO: ${args.map(a => typeof a === "object"? JSON.stringify(a, null, 2) : String(a)).join(" ")}`);
}
function logWarn(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.warn(`[${nowStr()}] WARN: ${args.join(" ")}`);
}
function logErr(...args) {
    const level = getLogLevel();
    if (level < 1) return;
    console.error(`[${nowStr()}] ERROR: ${args.join(" ")}`);
}

/* Token有效性校验 */
function checkTokenValid(resp) {
    if (!resp) return true;
    const invalidCodes = [401, 403, 50001, 50002, 50003];
    const invalidMsgs = ["无效", "过期", "未登录", "授权", "token", "authorization", "请重新登录"];
    const respStr = JSON.stringify(resp).toLowerCase();
    const hasInvalidCode = invalidCodes.includes(resp.code || resp.status);
    const hasInvalidMsg = invalidMsgs.some(msg => respStr.includes(msg));
    return!(hasInvalidCode || hasInvalidMsg);
}

/* BoxJs 鉴权信息同步 */
async function writeToBoxJs(auth, deviceId, ua) {
    if (!HAS_HTTP) {
        logWarn("当前环境不支持HTTP，跳过BoxJs同步");
        return false;
    }
    try {
        let boxData = {};
        await new Promise((resolve) => {
            const httpReq = typeof $httpClient!== "undefined"? $httpClient : $http;
            httpReq.get({
                url: `${BOXJS_URL}/query/data/${BOXJS_ROOT_KEY}`,
                headers: { "Accept": "application/json" },
                timeout: REQUEST_TIMEOUT
            }, (err, res, data) => {
                if (!err && res?.status === 200) {
                    try { boxData = JSON.parse(data)?.val || {}; } catch (e) { logWarn("解析BoxJs数据失败：", e); }
                }
                resolve();
            });
        });
        boxData[BOXJS_NINEBOT_KEY] = {
            authorization: auth,
            deviceId: deviceId,
            userAgent: ua,
            updateTime: formatDateTime()
        };
        await new Promise((resolve) => {
            const httpReq = typeof $httpClient!== "undefined"? $httpClient : $http;
            httpReq.post({
                url: `${BOXJS_URL}/update/data/${BOXJS_ROOT_KEY}`,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ val: boxData }),
                timeout: REQUEST_TIMEOUT
            }, (err, res) => {
                if (!err && res?.status === 200) {
                    logInfo("BoxJs同步成功");
                    notify("九号抓包", "凭证已更新", "鉴权信息已写入BoxJS");
                    resolve(true);
                } else {
                    logErr("BoxJs写入失败：", err || `状态码${res?.status}`);
                    notify("九号抓包", "BoxJS写入失败", "请检查BoxJS服务是否正常");
                    resolve(false);
                }
            });
        });
        return true;
    } catch (e) {
        logErr("BoxJs同步异常：", e);
        return false;
    }
}

/* 抓包自动写入鉴权信息 */
const CAPTURE_PATTERNS = ["/portal/api/user-sign/v2/status", "/portal/api/user-sign/v2/sign", "/blind-box/receive"];
const isCaptureRequest = IS_REQUEST && (typeof $request!== "undefined" && $request.url) && CAPTURE_PATTERNS.some(u => $request.url.includes(u));
if (isCaptureRequest) {
    try {
        logInfo("进入抓包流程，开始提取鉴权信息");
        const h = $request.headers || {};
        const auth = h["Authorization"] || h["authorization"] || "";
        const dev = h["DeviceId"] || h["deviceid"] || h["device_id"] || "";
        const ua = h["User-Agent"] || h["user-agent"] || "";
        if (!auth ||!dev) {
            logWarn("抓包未提取到有效信息：Authorization/DeviceId缺失");
            $done({});
            return;
        }
        let changed = false;
        if (auth && readPS(KEY_AUTH)!== auth) { writePS(auth, KEY_AUTH); changed = true; }
        if (dev && readPS(KEY_DEV)!== dev) { writePS(dev, KEY_DEV); changed = true; }
        if (ua && readPS(KEY_UA)!== ua) { writePS(ua, KEY_UA); changed = true; }
        if (changed) {
            const currentTime = formatDateTime();
            writePS(currentTime, KEY_LAST_CAPTURE);
            await writeToBoxJs(auth, dev, ua);
        } else {
            logInfo("抓包信息无变化，跳过写入");
            notify("九号抓包", "凭证无变化", "鉴权信息与已存储的一致，跳过更新");
        }
    } catch (e) {
        logErr("抓包流程异常：", e);
        notify("九号抓包", "失败", `错误：${String(e).slice(0, 50)}`);
    }
    $done({});
    return;
}

/* 读取脚本配置 */
const cfg = {
    Authorization: readPS(KEY_AUTH) || "",
    DeviceId: readPS(KEY_DEV) || "",
    userAgent: readPS(KEY_UA) || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609113620",
    debug: (readPS(KEY_DEBUG) === null)? true : (readPS(KEY_DEBUG)!== "false"),
    notify: (readPS(KEY_NOTIFY) === null)? true : (readPS(KEY_NOTIFY)!== "false"),
    autoOpenBox: readPS(KEY_AUTOBOX) === "true",
    autoRepair: readPS(KEY_AUTO_REPAIR) === "true",
    notifyFail: (readPS(KEY_NOTIFYFAIL) === null)? true : (readPS(KEY_NOTIFYFAIL)!== "false"),
    titlePrefix: readPS(KEY_TITLE) || "九号签到助手",
    logLevel: getLogLevel(),
    enableRetry: (readPS(KEY_ENABLE_RETRY) === null)? true : (readPS(KEY_ENABLE_RETRY)!== "false")
};

// 校验配置
if (!cfg.Authorization ||!cfg.DeviceId) {
    notify(cfg.titlePrefix, "配置缺失", "请先抓包执行签到，自动写入Authorization/DeviceId");
    logWarn("脚本终止：未读取到有效账号信息");
    $done && $done();
    process.exit && process.exit();
}

logInfo("NineSync AutoPunch 启动");
logInfo("当前配置：", {
    自动开箱: cfg.autoOpenBox,
    自动补签: cfg.autoRepair,
    开启重试: cfg.enableRetry,
    最后抓包: readPS(KEY_LAST_CAPTURE) || "未抓包",
    最后签到: readPS(KEY_LAST_SIGN_DATE) || "未签到"
});

/* 构造请求头 */
function makeHeaders() {
    return {
        "Authorization": cfg.Authorization,
        "Content-Type": "application/json",
        "device_id": cfg.DeviceId,
        "User-Agent": cfg.userAgent,
        "platform": "h5",
        "Origin": "https://h5-bj.ninebot.com",
        "language": "zh",
        "aid": "10000004",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "zh-CN,zh-Hans;q=0.9",
        "accept": "application/json",
        "sys_language": "zh-CN",
        "referer": "https://h5-bj.ninebot.com/"
    };
}

/* 跨环境HTTP请求（带重试） */
function requestWithRetry({ method = "GET", url, headers = {}, body = null, timeout = REQUEST_TIMEOUT, retryType = "default" }) {
    return new Promise((resolve, reject) => {
        const { max: MAX_RETRY, delay: RETRY_DELAY } = RETRY_CONFIG[retryType] || RETRY_CONFIG.default;
        let attempts = 0;
        const httpReq = typeof $httpClient!== "undefined"? $httpClient : $http;
        const once = () => {
            attempts++;
            const opts = { url, headers, timeout };
            if (method === "POST") opts.body = body? JSON.stringify(body) : null;
            logInfo(`[请求] ${method} ${url} (尝试${attempts}/${MAX_RETRY})`);
            if (method === "POST" && body) logInfo("[请求体]", body);
            const cb = (err, resp, data) => {
                if (err) {
                    const msg = String(err && (err.error || err.message || err));
                    const shouldRetry = /(Socket closed|ECONNRESET|network|timed out|timeout|failed|502|504)/i.test(msg);
                    if (attempts < MAX_RETRY && shouldRetry && cfg.enableRetry) {
                        logWarn(`请求错误：${msg}，${RETRY_DELAY}ms后重试`);
                        setTimeout(once, RETRY_DELAY);
                        return;
                    }
                    logErr(`请求最终失败：${msg}`);
                    reject(new Error(`请求异常: ${msg}`));
                    return;
                }
                logInfo(`[响应] 状态码: ${resp.status}, 数据长度: ${data?.length || 0}`);
                let respData = {};
                try { respData = data? JSON.parse(data) : {}; } catch (e) { respData = { raw: data, parseErr: e.message }; }
                if (!checkTokenValid({ code: resp.status,...respData })) {
                    const errMsg = "Token失效/未授权，请重新抓包";
                    notify(cfg.titlePrefix, "Token失效", errMsg);
                    logErr(errMsg);
                    reject(new Error(errMsg));
                    return;
                }
                if (resp.status >= 500 && attempts < MAX_RETRY && cfg.enableRetry) {
                    logWarn(`服务端错误${resp.status}，${RETRY_DELAY}ms后重试`);
                    setTimeout(once, RETRY_DELAY);
                    return;
                }
                resolve(respData);
            };
            if (method === "GET") httpReq.get(opts, cb);
            else httpReq.post(opts, cb);
        };
        once();
    });
}
function httpGet(url, headers = {}, retryType = "query") {
    return requestWithRetry({ method: "GET", url, headers, retryType });
}
function httpPost(url, headers = {}, body = {}, retryType = "default") {
    return requestWithRetry({ method: "POST", url, headers, body, retryType });
}

/* 时间工具函数 */
function toDateKeyAny(ts) {
    if (!ts) return null;
    try {
        let d;
        if (typeof ts === "number") {
            ts = ts > 1e12? Math.floor(ts / 1000) : ts;
            d = new Date(ts * 1000);
        } else if (typeof ts === "string") {
            d = /^\d+$/.test(ts)? new Date(Number(ts) * (ts.length > 10? 1 : 1000)) : new Date(ts);
        }
        return!isNaN(d.getTime())
           ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/\//g, "-")
            : null;
    } catch (e) {
        logWarn("时间转换异常：", e);
        return null;
    }
}
function todayKey() {
    return toDateKeyAny(new Date().getTime());
}

/* 自动补签 */
async function autoRepairSign(headers, signCards) {
    if (!cfg.autoRepair || signCards <= 0) {
        logInfo(cfg.autoRepair? "补签卡数量不足，跳过补签" : "自动补签已关闭，跳过");
        return "";
    }
    try {
        logInfo(`执行自动补签（剩余补签卡：${signCards}）`);
        const repairResp = await httpPost(END.repairSign, headers, { deviceId: cfg.DeviceId }, "sign");
        if (repairResp?.code === 0) {
            const msg = `自动补签成功（剩余补签卡：${signCards - 1}）`;
            logInfo(msg);
            return msg;
        } else {
            const errMsg = repairResp.msg || repairResp.message || "补签失败，原因未知";
            logWarn(`补签失败：${errMsg}`);
            return `补签失败：${errMsg}`;
        }
    } catch (e) {
        logErr("补签请求异常：", e);
        return `补签异常：${String(e).slice(0, 30)}`;
    }
}

/* 盲盒自动开箱 */
async function openAllAvailableBoxes(headers) {
    if (!cfg.autoOpenBox) {
        logInfo("自动开箱功能已关闭，跳过");
        return [];
    }
    try {
        const boxResp = await httpGet(END.blindBoxList, headers, "blindBox");
        const notOpened = boxResp?.data?.notOpenedBoxes || [];
        const availableBoxes = notOpened.filter(b => Number(b.leftDaysToOpen?? b.remaining) === 0);
        if (availableBoxes.length === 0) {
            logInfo("无可用盲盒（需等待的盲盒：" + notOpened.length + "个）");
            return ["- 无可用盲盒，待开" + notOpened.length + "个"];
        }
        logInfo(`发现可开启盲盒：${availableBoxes.length}个`, availableBoxes);
        const openResults = [];
        for (const box of availableBoxes) {
            const rewardId = box.rewardId?? box.id?? "";
            if (!rewardId) {
                openResults.push(`未知盲盒：缺失rewardId`);
                logWarn("盲盒ID缺失，跳过开箱");
                continue;
            }
            try {
                const openResp = await httpPost(END.blindBoxReceive, headers, { rewardId: rewardId }, "blindBox");
                if (openResp?.code === 0) {
                    const rewardType = openResp.data?.rewardType === 1? "经验" : "N币";
                    const rewardValue = openResp.data?.rewardValue || 0;
                    openResults.push(`${box.awardDays || "未知"}天盲盒：+${rewardValue}${rewardType}`);
                    logInfo(`盲盒开箱成功：+${rewardValue}${rewardType}`);
                } else {
                    const errMsg = openResp.msg || openResp.message || "开箱失败";
                    openResults.push(`${box.awardDays || "未知"}天盲盒：${errMsg}`);
                    logWarn(`盲盒开箱失败：${errMsg}`);
                }
            } catch (e) {
                openResults.push(`${box.awardDays || "未知"}天盲盒：${String(e).slice(0, 30)}`);
                logErr("盲盒开箱异常：", e);
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        return openResults;
    } catch (e) {
        logErr("盲盒查询异常：", e);
        return ["盲盒功能异常：" + String(e).slice(0, 30)];
    }
}

/* 脚本主流程 */
(async () => {
    try {
        const headers = makeHeaders();
        const today = todayKey();
        const lastSignDate = readPS(KEY_LAST_SIGN_DATE) || "";

        let isTodaySigned = lastSignDate === today;
        let statusData = {};
        if (!isTodaySigned) {
            logInfo("本地未检测到今日签到，查询官方签到状态");
            const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
            statusData = statusResp?.data || {};
            const currentSignStatus = statusData?.currentSignStatus?? statusData?.currentSign?? null;
            isTodaySigned = [1, '1', true, 'true'].includes(currentSignStatus);
            logInfo("官方签到状态：", isTodaySigned? "已签到" : "未签到");
        }

        let consecutiveDays = statusData?.consecutiveDays?? statusData?.continuousDays?? 0;
        let signCards = statusData?.signCardsNum?? statusData?.remedyCard?? 0;
        if (!consecutiveDays ||!signCards) {
            try {
                const statusResp = await httpGet(`${END.status}?t=${Date.now()}`, headers);
                consecutiveDays = statusResp?.data?.consecutiveDays?? 0;
                signCards = statusResp?.data?.signCardsNum?? 0;
            } catch (e) { logWarn("读取基础数据异常：", e); }
        }

        let signMsg = "", repairMsg = "", todayGainExp = 0, todayGainNcoin = 0;
        if (!isTodaySigned) {
            logInfo("开始执行今日签到");
            try {
                const signResp = await httpPost(END.sign, headers, { deviceId: cfg.DeviceId }, "sign");
                if (signResp?.code === 0 && Array.isArray(signResp.data?.rewardList)) {
                    consecutiveDays += 1;
                    writePS(today, KEY_LAST_SIGN_DATE);
                    todayGainExp = signResp.data.rewardList.filter(r => r.rewardType === 1).reduce((s, r) => s + Number(r.rewardValue), 0);
                    signMsg = `今日签到：成功（+${todayGainExp}经验）`;
                    logInfo("签到成功：", signMsg);
                } else if (signResp.code === 540004 || /已签到/.test(signResp.msg || signResp.message || "")) {
                    signMsg = "今日签到：已完成（重复请求）";
                    writePS(today, KEY_LAST_SIGN_DATE);
                } else {
                    const errMsg = signResp.msg || signResp.message || "未知错误";
                    signMsg = `签到失败：${errMsg}`;
                    logWarn("签到失败：", errMsg);
                    if (cfg.autoRepair && signCards > 0) {
                        repairMsg = await autoRepairSign(headers, signCards);
                        signCards -= 1;
                    }
                }
            } catch (e) {
                signMsg = `签到异常：${String(e).slice(0, 30)}`;
                logErr("签到请求异常：", e);
            }
        } else {
            signMsg = "今日签到：已完成";
            logInfo("今日已签到，跳过签到流程");
            try {
                const creditResp = await httpPost(END.creditLst, headers, { page: 1, size: 100 });
                const creditList = Array.isArray(creditResp?.data?.list)? creditResp.data.list : [];
                const todayRecords = creditList.filter(it => toDateKeyAny(it.create_date) === today);
                const signRecords = todayRecords.filter(it => it.change_msg === "每日签到" || it.change_code === "1");
                todayGainExp = signRecords.reduce((sum, it) => sum + (Number(it.credit?? 0) || 0), 0);
                logInfo(`已签到，今日签到经验：+${todayGainExp}`);
            } catch (e) { logWarn("统计已签到经验异常：", e); }
        }

        try {
            const nCoinResp = await httpPost(END.nCoinRecord, headers, { tranType: 1, size: 10, page: 1 }, "query");
            const nCoinList = Array.isArray(nCoinResp?.data?.list)? nCoinResp.data.list : [];
            const todayShareRecords = nCoinList.filter(it => toDateKeyAny(it.occurrenceTime) === today && it.source === "分享");
            todayGainNcoin = todayShareRecords.reduce((sum, it) => sum + Number(it.count?? 0), 0);
            logInfo(`今日分享获得N币：+${todayGainNcoin}`);
        } catch (e) { logWarn("统计N币异常：", e); }

        let creditData = {}, needExp = 0;
        try {
            const cr = await httpGet(END.creditInfo, headers);
            creditData = cr?.data || {};
            const currentExp = Number(creditData.credit?? 0);
            if (creditData.credit_upgrade) {
                const m = String(creditData.credit_upgrade).match(/还需\s*([0-9]+)\s*/);
                needExp = m && m[1]? Number(m[1]) : 0;
            } else if (creditData.credit_range && Array.isArray(creditData.credit_range) && creditData.credit_range.length >= 2) {
                needExp = creditData.credit_range[1] - currentExp;
            }
            needExp = Math.max(0, needExp);
        } catch (e) { logWarn("查询经验等级异常：", e); }

        let nCoinBalance = 0;
        try {
            const balResp = await httpGet(END.balance, headers);
            nCoinBalance = Number(balResp?.data?.balance?? balResp?.data?.coin?? 0);
        } catch (e) { logWarn("查询N币余额异常：", e); }

        const boxOpenResults = await openAllAvailableBoxes(headers);
        const boxMsg = boxOpenResults.length > 0
           ? `盲盒开箱结果\n${boxOpenResults.join("\n")}`
            : "盲盒开箱：无可用盲盒";

        if (cfg.notify) {
            const rewardDetail = `今日奖励：+${todayGainExp || 0}经验 / +${todayGainNcoin || 0}N币`;
            let blindProgress = "- 待开盲盒：查询中...";
            try {
                const boxResp = await httpGet(END.blindBoxList, headers);
                const notOpened = boxResp?.data?.notOpenedBoxes || [];
                const opened = boxResp?.data?.openedBoxes || [];
                blindProgress = notOpened.length > 0
                   ? `- 待开盲盒：${notOpened.length}个（可开：${notOpened.filter(b => Number(b.leftDaysToOpen) === 0).length}个）`
                    : "- 待开盲盒：0个";
                blindProgress += `\n- 已开盲盒：${opened.length}个`;
            } catch (e) { blindProgress = "- 待开盲盒：查询异常"; }

            let notifyBody = `${signMsg}
${repairMsg? `${repairMsg}\n` : ""}${rewardDetail}
${boxMsg}
账户状态
- 等级：${creditData.level? `LV.${creditData.level}` : "未知"}
- 当前经验：${creditData.credit?? 0}
- 升级还需：${needExp}经验
- 持有N币：${nCoinBalance || 0}
- 补签卡：${signCards}张
- 连续签到：${consecutiveDays}天
盲盒进度
${blindProgress}`;

            const MAX_LEN = 800;
            if (notifyBody.length > MAX_LEN) notifyBody = notifyBody.slice(0, MAX_LEN - 3) + "...";
            notify(cfg.titlePrefix, "任务完成", notifyBody);
            logInfo("通知已发送");
        }

        logInfo("NineSync AutoPunch 执行完成");
    } catch (e) {
        logErr("脚本主流程异常：", e);
        if (cfg.notifyFail) notify(cfg.titlePrefix, "任务异常", `执行失败：${String(e).slice(0, 50)}`);
    } finally {
        $done && $done();
        process.exit && process.exit();
    }
})();