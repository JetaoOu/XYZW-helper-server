import { g_utils } from "../protocol/bonProtocol.js";

const AUTH_URL = "https://xxz-xyzw.hortorgames.com/login/authuser";
const SERVER_LIST_URL = "https://xxz-xyzw.hortorgames.com/login/serverlist";

/** 简易滑动窗口限流：25 次 / 60 秒，沿用旧项目对登录接口的限制 */
class RateLimiter {
  private requests: number[] = [];
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      const now = Date.now();
      this.requests = this.requests.filter(
        (time) => time > now - this.windowMs,
      );
      if (this.requests.length < this.maxRequests) {
        this.requests.push(now);
        return fn();
      }
      const wait = this.requests[0] + this.windowMs - now + 100;
      await sleep(Math.max(wait, 100));
    }
  }
}

const loginLimiter = new RateLimiter(25, 60_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

async function postBinary(url: string, seq: number, body: ArrayBuffer) {
  const response = await fetch(`${url}?_seq=${seq}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`登录接口返回 ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error(`登录接口返回空响应（${response.status}）`);
  }
  return buffer;
}

/** 把 Base64 字符串还原为 ArrayBuffer */
export function binFromBase64(input: string): ArrayBuffer {
  const clean = input.replace(/^data:.*base64,/, "").trim();
  if (!clean) throw new Error("BIN 内容为空");
  const buffer = Buffer.from(clean, "base64");
  if (buffer.length === 0) throw new Error("BIN 内容无效");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * 由 BIN 的 serverId 推导区服显示名，规则与旧项目一致：
 * 高 1000000 位表示角色位（0/1/2），去掉后减 27 得到区服数字。
 */
export function deriveServerLabel(
  serverId: string | number,
): string | null {
  let sid = Number(serverId);
  if (!Number.isFinite(sid)) return null;
  if (sid >= 2_000_000) sid -= 2_000_000;
  else if (sid >= 1_000_000) sid -= 1_000_000;
  const serverNumber = sid - 27;
  return Number.isFinite(serverNumber) ? `${serverNumber}服` : null;
}

export interface RoleBinPayload {
  [key: string]: unknown;
  serverId?: number;
}

/** 解析 BIN 文件中的登录信封 */
export function getBinPayload(data: ArrayBuffer): RoleBinPayload {
  // g_utils.parse 的解密会原地修改字节，复制一份避免同一份 BIN 无法重复解析
  const copy = data.slice(0);
  const message = g_utils.parse(copy);
  const payload = message.getData() || (message as { _raw?: unknown })._raw;
  if (!payload || typeof payload !== "object") {
    throw new Error("BIN 登录凭据解析为空");
  }
  return payload as RoleBinPayload;
}

/** 按区服重新打包 BIN（游戏客户端使用的 LZ4 格式） */
export function buildRoleBin(
  payload: RoleBinPayload,
  serverId: string | number,
): ArrayBuffer {
  const encoded = g_utils.encode(
    { ...payload, serverId: Number(serverId) },
    "lx",
  ) as ArrayBuffer | Uint8Array;
  return toArrayBuffer(encoded);
}

/** 查询 BIN 可用的角色/区服列表，统一返回数组 */
export async function getServerList(bin: ArrayBuffer): Promise<unknown[]> {
  return loginLimiter.schedule(async () => {
    const response = await postBinary(SERVER_LIST_URL, 3, bin);
    const message = g_utils.parse(response);
    const data = message.getData() as { roles?: unknown } | undefined;
    if (!data || typeof data !== "object") {
      throw new Error("BIN 区服列表解析为空");
    }
    const roles = (data as { roles?: unknown }).roles ?? data;
    return Array.isArray(roles)
      ? roles
      : Object.values(roles as Record<string, unknown>);
  });
}

/** 用 BIN 兑换角色凭据，返回可直接用于 WebSocket `p` 参数的 JSON 字符串 */
export async function exchangeBin(
  bin: ArrayBuffer,
  serverId: string | number,
): Promise<{ credential: string; payload: Record<string, unknown> }> {
  return loginLimiter.schedule(async () => {
    const payload = getBinPayload(bin);
    const roleBin = buildRoleBin(payload, serverId);
    const response = await postBinary(AUTH_URL, 1, roleBin);
    const message = g_utils.parse(response);
    const data = message.getData() as Record<string, unknown> | undefined;
    if (!data || typeof data !== "object") {
      throw new Error("登录接口返回的凭据为空");
    }
    const currentTime = Date.now();
    const sessId = currentTime * 100 + Math.floor(Math.random() * 100);
    const connId = currentTime + Math.floor(Math.random() * 10);
    const credential = JSON.stringify({
      ...data,
      sessId,
      connId,
      isRestore: 0,
    });
    return { credential, payload: data };
  });
}

/** 把 ArrayBuffer 编码为 Base64（用于保存 BIN 原件） */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(buffer)).toString("base64");
}

/** 用保存的 BIN 原件重新兑换一份新鲜凭据 */
export async function exchangeCredentialFromBin(
  binBase64: string,
  serverIdOverride?: string | number | null,
): Promise<{ credential: string; serverId: number }> {
  const bin = binFromBase64(binBase64);
  const payload = getBinPayload(bin);
  const serverId =
    serverIdOverride === undefined || serverIdOverride === null
      ? Number(payload.serverId)
      : Number(serverIdOverride);
  if (!Number.isFinite(serverId)) {
    throw new Error("BIN 缺少区服信息，无法重新兑换凭据");
  }
  const result = await exchangeBin(bin, serverId);
  return { credential: result.credential, serverId };
}

export interface ParsedCredential {
  /** 直接放入 WebSocket `p` 参数的字符串 */
  credential: string;
  /** 若凭据是 JSON，则为其字段 */
  fields: Record<string, unknown>;
  roleId?: string | number;
  roleToken?: string;
}

/**
 * 解析手动粘贴的凭据。兼容：
 * - 纯 Base64（解码后是 JSON 或纯文本）
 * - 直接粘贴的 JSON
 * - 带 `data:...base64,` 前缀
 */
export function parseManualCredential(raw: string): ParsedCredential {
  const input = raw.trim();
  if (!input) throw new Error("凭据不能为空");
  const cleaned = input.replace(/^data:.*base64,/, "").trim();

  let decoded: string | null = null;
  try {
    const buffer = Buffer.from(cleaned, "base64");
    if (buffer.length > 0) decoded = buffer.toString("utf8");
  } catch {
    decoded = null;
  }

  const candidates = [cleaned, decoded].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.roleToken === "string") {
        return buildParsed(JSON.stringify(parsed), parsed);
      }
      if (typeof parsed.token === "string") {
        return buildParsed(parsed.token, parsed);
      }
      if (typeof parsed.gameToken === "string") {
        return buildParsed(parsed.gameToken, parsed);
      }
    } catch {
      // 继续尝试下一个候选
    }
  }

  // 纯文本或 Base64 解出的纯字符串，整体作为凭据
  const plain = decoded?.trim() || cleaned;
  return buildParsed(plain, {});
}

function buildParsed(
  credential: string,
  fields: Record<string, unknown>,
): ParsedCredential {
  return {
    credential,
    fields,
    roleId: fields.roleId as string | number | undefined,
    roleToken: fields.roleToken as string | undefined,
  };
}

export interface UrlTokenResult {
  credential: string;
  server?: string;
  name?: string;
}

/** 从 URL 拉取凭据：要求返回 JSON 且含 `token` 字段 */
export async function fetchCredentialFromUrl(
  url: string,
): Promise<UrlTokenResult> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`来源地址返回 ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.token !== "string" || !data.token) {
    throw new Error("来源地址未返回 token 字段");
  }
  const parsed = parseManualCredential(data.token);
  return {
    credential: parsed.credential,
    server: typeof data.server === "string" ? data.server : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
  };
}
