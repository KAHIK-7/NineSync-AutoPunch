// NineSync AutoPunch — 凭证同步到 GitHub Actions
// 独立脚本，从 BoxJS 读取凭证并推送到 Cloudflare Worker
// 手动触发：在 Loon 脚本列表中点击执行
// 自动触发：九号签到脚本抓包成功后自动调用

/* 环境兼容 */
const IS_SCRIPTING = typeof $task !== "undefined";
const HAS_PERSIST = typeof $persistentStore !== "undefined" || (IS_SCRIPTING && typeof $prefs !== "undefined");
const HAS_NOTIFY = typeof $notification !== "undefined" || (IS_SCRIPTING && typeof $notify !== "undefined");
const HAS_HTTP = typeof $httpClient !== "undefined" || (IS_SCRIPTING && typeof $http !== "undefined");

function readPS(key) {
  try {
    return HAS_PERSIST
      ? (typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : $prefs.valueForKey(key))
      : null;
  } catch (e) { return null; }
}

function notify(title, sub, body) {
  if (!HAS_NOTIFY) return;
  try {
    if (typeof $notification !== "undefined") $notification.post(title, sub, body);
    else if (IS_SCRIPTING) $notify(title, sub, body);
  } catch (e) { console.log("通知异常：" + e); }
}

function getHttp() {
  return typeof $httpClient !== "undefined" ? $httpClient : $http;
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const httpReq = getHttp();
    httpReq.post({
      url,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 15000,
    }, (err, resp, data) => {
      if (err) { reject(new Error(String(err.message || err.error || err))); return; }
      let result;
      try { result = JSON.parse(data); } catch (e) { result = data; }
      if (resp.status >= 200 && resp.status < 300) {
        resolve(result);
      } else {
        reject(new Error(result?.error || `HTTP ${resp.status}`));
      }
    });
  });
}

// 主流程
(async () => {
  const auth = readPS("ninebot.authorization") || "";
  const devId = readPS("ninebot.deviceId") || "";
  const workerUrl = readPS("ninebot.syncWorkerUrl") || "";

  if (!auth || !devId) {
    notify("GitHub同步", "失败", "BoxJS中无凭证，请先抓包");
    $done && $done();
    return;
  }

  if (!workerUrl) {
    notify("GitHub同步", "失败", "未配置Worker地址，请在BoxJS中设置 syncWorkerUrl");
    $done && $done();
    return;
  }

  try {
    console.log(`[同步] 推送凭证到 ${workerUrl}`);
    const result = await httpPost(workerUrl, { authorization: auth, deviceId: devId });
    console.log("[同步] 结果:", JSON.stringify(result));
    if (result.ok) {
      notify("GitHub同步", "成功", "Secrets已自动更新");
    } else {
      notify("GitHub同步", "失败", result.error || "未知错误");
    }
  } catch (e) {
    console.error("[同步] 异常:", e.message);
    notify("GitHub同步", "失败", e.message.slice(0, 50));
  }

  $done && $done();
})();