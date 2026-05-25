// NineSync Secrets Sync Worker
// 接收 Loon 的 POST 请求，加密后写入 GitHub Actions Secrets
//
// 部署:
//   1. npm install
//   2. npx wrangler secret put GITHUB_TOKEN  (GitHub PAT, repo 权限)
//   3. npx wrangler secret put GITHUB_OWNER  (GitHub 用户名)
//   4. npx wrangler secret put GITHUB_REPO   (仓库名)
//   5. npx wrangler deploy

import nacl from "tweetnacl";
import blake from "blakejs";

const GITHUB_API = "https://api.github.com";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    let body;
    try { body = await request.json(); } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const { authorization, deviceId } = body;
    if (!authorization || !deviceId) {
      return json(400, { ok: false, error: "Missing authorization or deviceId" });
    }

    const token = env.GITHUB_TOKEN;
    const owner = env.GITHUB_OWNER;
    const repo  = env.GITHUB_REPO;
    if (!token || !owner || !repo) {
      return json(500, { ok: false, error: "Worker not configured: missing env vars" });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": "NineSync-Worker/1.0",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    try {
      // 1. 获取仓库 public key
      const pkResp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/public-key`, { headers });
      if (!pkResp.ok) {
        return json(pkResp.status, { ok: false, error: `Failed to get public key: ${await pkResp.text()}` });
      }
      const { key_id, key } = await pkResp.json();

      // 2. 加密并更新 AUTHORIZATION + DEVICE_ID
      await updateSecret("AUTHORIZATION", authorization, key_id, key, owner, repo, headers);
      await updateSecret("DEVICE_ID", deviceId, key_id, key, owner, repo, headers);

      return json(200, { ok: true, message: "Secrets updated" });
    } catch (e) {
      return json(500, { ok: false, error: e.message });
    }
  },
};

async function updateSecret(name, value, keyId, publicKeyB64, owner, repo, headers) {
  const encrypted = seal(value, publicKeyB64);
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`,
    { method: "PUT", headers, body: JSON.stringify({ encrypted_value: encrypted, key_id: keyId }) }
  );
  if (resp.ok || resp.status === 204) return;
  throw new Error(`Failed to update ${name}: ${await resp.text()}`);
}

// crypto_box_seal 实现（tweetnacl + blakejs）
// GitHub 要求 libsodium sealed box 加密，这里用纯 JS 复现
function seal(plaintext, publicKeyBase64) {
  const pk = b64decode(publicKeyBase64);
  const msg = new TextEncoder().encode(plaintext);

  // 1. 生成临时密钥对
  const epk = nacl.box.keyPair();

  // 2. 计算共享密钥
  const sharedKey = nacl.box.before(pk, epk.secretKey);

  // 3. nonce = BLAKE2b-512(epk_pk || pk)[0:24]
  const nonceInput = new Uint8Array(epk.publicKey.length + pk.length);
  nonceInput.set(epk.publicKey);
  nonceInput.set(pk, epk.publicKey.length);
  const nonce = blake.blake2b(nonceInput, null, 24);

  // 4. 加密
  const encrypted = nacl.box.after(msg, nonce, sharedKey);

  // 5. 结果 = epk_pk (32 bytes) || ciphertext
  const sealed = new Uint8Array(epk.publicKey.length + encrypted.length);
  sealed.set(epk.publicKey);
  sealed.set(encrypted, epk.publicKey.length);

  return b64encode(sealed);
}

function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64encode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}