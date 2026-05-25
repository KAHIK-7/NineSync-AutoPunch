// build-sync.js — 构建自包含的 sync-secrets.js
// 用法: node build-sync.js
// 输出: loon/scripts/sync-secrets.js

const fs = require("fs");
const path = require("path");

const ROOT = "/home/MADAO/WorkSpace/NineSync-AutoPunch";

// 1. 读取 tweetnacl minified
const naclRaw = fs.readFileSync(
  require.resolve("tweetnacl/nacl-fast.min.js"),
  "utf8"
);

// 2. 读取 blakejs 源码
const blakeUtil = fs.readFileSync(
  require.resolve("blakejs/util.js"),
  "utf8"
);
const blake2b = fs.readFileSync(
  require.resolve("blakejs/blake2b.js"),
  "utf8"
);

// 3. 去掉 blakejs 的 CommonJS 依赖
const blakeUtilNoCJS = blakeUtil
  .replace(/const util = require\('\.\/util'\)/g, "")
  .replace(/module\.exports\s*=\s*\{[\s\S]*?\};/g, "");

const blake2bNoCJS = blake2b
  .replace(/^const util = require\('\.\/util'\)\s*$/m, "")
  .replace(/module\.exports\s*=\s*\{[\s\S]*?\};/, "")
  .replace(/util\./g, "");

// 4. 收集 blake2b 中用到的 util 函数 (normalizeInput)
function extractFn(src, name) {
  const re = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, "m");
  const m = src.match(re);
  return m ? m[0] : "";
}
const normalizeInput = extractFn(blakeUtilNoCJS, "normalizeInput");

// 5. 构建 blake IIFE
const blakeIIFE = [
  '(function(){',
  '"use strict";',
  normalizeInput,
  blake2bNoCJS,
  'var blake = { blake2b: blake2b, blake2bHex: blake2bHex };',
  'if (typeof globalThis !== "undefined") globalThis.blake = blake;',
  '})();',
].join("\n");

// 6. nacl IIFE（原文件就是 IIFE，但需要去掉 CJS 导出部分）
// 原文件末尾有: ,"object"==typeof module&&module.exports?module.exports=n:...
// 替换为只保留全局赋值
const naclIIFE = naclRaw
  .replace(/,"object"==typeof module[^;]*/g, "")
  .replace(/;$/g, "");

// 7. 读取同步脚本逻辑（去掉头部注释和环境兼容部分）
const syncLogic = [
  "",
  "// ======== 同步逻辑 ========",
  "",
  `var nacl = globalThis.nacl;`,
  `var blake2b = globalThis.blake.blake2b;`,
  "",
  `function b64decode(str) {`,
  `  var bin = atob(str);`,
  `  var bytes = new Uint8Array(bin.length);`,
  `  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);`,
  `  return bytes;`,
  `}`,
  "",
  `function b64encode(bytes) {`,
  `  var bin = "";`,
  `  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);`,
  `  return btoa(bin);`,
  `}`,
  "",
  `function cryptoBoxSeal(plaintext, publicKeyB64) {`,
  `  var pk = b64decode(publicKeyB64);`,
  `  var msg = (new TextEncoder()).encode(plaintext);`,
  `  var epk = nacl.box.keyPair();`,
  `  var sharedKey = nacl.box.before(pk, epk.secretKey);`,
  `  var nonceInput = new Uint8Array(epk.publicKey.length + pk.length);`,
  `  nonceInput.set(epk.publicKey);`,
  `  nonceInput.set(pk, epk.publicKey.length);`,
  `  var nonce = blake2b(nonceInput, null, 24);`,
  `  var encrypted = nacl.box.after(msg, nonce, sharedKey);`,
  `  var sealed = new Uint8Array(epk.publicKey.length + encrypted.length);`,
  `  sealed.set(epk.publicKey);`,
  `  sealed.set(encrypted, epk.publicKey.length);`,
  `  return b64encode(sealed);`,
  `}`,
  "",
  `// 环境兼容`,
  `var IS_SCRIPTING = typeof $task !== "undefined";`,
  `var HAS_PERSIST = typeof $persistentStore !== "undefined" || (IS_SCRIPTING && typeof $prefs !== "undefined");`,
  `var HAS_NOTIFY = typeof $notification !== "undefined" || (IS_SCRIPTING && typeof $notify !== "undefined");`,
  `var HAS_HTTP = typeof $httpClient !== "undefined" || (IS_SCRIPTING && typeof $http !== "undefined");`,
  "",
  `function readPS(key) {`,
  `  try {`,
  `    return HAS_PERSIST`,
  `      ? (typeof $persistentStore !== "undefined" ? $persistentStore.read(key) : $prefs.valueForKey(key))`,
  `      : null;`,
  `  } catch (e) { return null; }`,
  `}`,
  "",
  `function notify(title, sub, body) {`,
  `  if (!HAS_NOTIFY) return;`,
  `  try {`,
  `    if (typeof $notification !== "undefined") $notification.post(title, sub, body);`,
  `    else if (IS_SCRIPTING) $notify(title, sub, body);`,
  `  } catch (e) {}`,
  `}`,
  "",
  `function httpReq(method, url, headers, body) {`,
  `  return new Promise(function(resolve, reject) {`,
  `    var http = typeof $httpClient !== "undefined" ? $httpClient : $http;`,
  `    var opts = { url: url, headers: headers, timeout: 15000 };`,
  `    if (body) opts.body = JSON.stringify(body);`,
  `    var cb = function(err, resp, data) {`,
  `      if (err) { reject(new Error(String(err.message || err.error || err || "unknown"))); return; }`,
  `      var result;`,
  `      try { result = JSON.parse(data); } catch (e) { result = data; }`,
  `      if (resp.status >= 200 && resp.status < 300) {`,
  `        resolve({ status: resp.status, data: result });`,
  `      } else {`,
  `        reject(new Error(result.error || result.message || "HTTP " + resp.status));`,
  `      }`,
  `    };`,
  `    if (method === "GET") http.get(opts, cb);`,
  `    else http.post(opts, cb);`,
  `  });`,
  `}`,
  "",
  `(function() {`,
  `  var auth = readPS("ninebot.authorization") || "";`,
  `  var devId = readPS("ninebot.deviceId") || "";`,
  `  var token = readPS("ninebot.syncGitHubToken") || "";`,
  `  var owner = readPS("ninebot.syncGitHubOwner") || "";`,
  `  var repo  = readPS("ninebot.syncGitHubRepo") || "";`,
  "",
  `  if (!auth || !devId) {`,
  `    notify("GitHub同步", "失败", "BoxJS中无凭证，请先抓包");`,
  `    $done && $done();`,
  `    return;`,
  `  }`,
  `  if (!token || !owner || !repo) {`,
  `    notify("GitHub同步", "失败", "请先在BoxJS中配置 syncGitHubToken/Owner/Repo");`,
  `    $done && $done();`,
  `    return;`,
  `  }`,
  "",
  `  var ghHeaders = {`,
  `    "Authorization": "Bearer " + token,`,
  `    "User-Agent": "NineSync/1.0",`,
  `    "Accept": "application/vnd.github+json",`,
  `    "X-GitHub-Api-Version": "2022-11-28",`,
  `    "Content-Type": "application/json"`,
  `  };`,
  `  var ghApi = "https://api.github.com";`,
  "",
  `  httpReq("GET", ghApi + "/repos/" + owner + "/" + repo + "/actions/secrets/public-key", ghHeaders)`,
  `    .then(function(resp) {`,
  `      var keyId = resp.data.key_id;`,
  `      var key = resp.data.key;`,
  `      var authEnc = cryptoBoxSeal(auth, key);`,
  `      var devEnc  = cryptoBoxSeal(devId, key);`,
  `      return Promise.all([`,
  `        httpReq("PUT", ghApi + "/repos/" + owner + "/" + repo + "/actions/secrets/" + encodeURIComponent("AUTHORIZATION"), ghHeaders, { encrypted_value: authEnc, key_id: keyId }),`,
  `        httpReq("PUT", ghApi + "/repos/" + owner + "/" + repo + "/actions/secrets/" + encodeURIComponent("DEVICE_ID"), ghHeaders, { encrypted_value: devEnc, key_id: keyId })`,
  `      ]);`,
  `    })`,
  `    .then(function() {`,
  `      notify("GitHub同步", "成功", "Secrets已自动更新");`,
  `      $done && $done();`,
  `    })`,
  `    .catch(function(e) {`,
  `      notify("GitHub同步", "失败", e.message.slice(0, 50));`,
  `      $done && $done();`,
  `    });`,
  `})();`,
].join("\n");

// 8. 组装最终文件
const output = [
  "// NineSync AutoPunch — 凭证同步到 GitHub Actions（自包含版）",
  "// 从 BoxJS 读取凭证和 GitHub 配置，直接调 GitHub Secrets API 更新",
  "//",
  "// BoxJS 配置项:",
  "//   ninebot.syncGitHubToken — GitHub PAT (classic, repo 权限)",
  "//   ninebot.syncGitHubOwner — GitHub 用户名",
  "//   ninebot.syncGitHubRepo  — 仓库名",
  "//",
  "// 内嵌 tweetnacl + blakejs，无外部依赖。约 52KB。",
  "",
  naclIIFE,
  blakeIIFE,
  syncLogic,
].join("\n");

const outPath = path.join(ROOT, "loon", "scripts", "sync-secrets.js");
fs.writeFileSync(outPath, output, "utf8");
console.log("Built sync-secrets.js (" + fs.statSync(outPath).size + " bytes)");