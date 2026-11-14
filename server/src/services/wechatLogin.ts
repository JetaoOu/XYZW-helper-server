import { randomUUID } from "node:crypto";
import {
  arrayBufferToBase64,
  binFromBase64,
  buildRoleBin,
  deriveServerLabel,
  encodeBin,
  exchangeBin,
  getServerList,
  scheduleLoginRequest,
} from "./credential.js";
import { createRole, findRoleDuplicate, updateRole } from "./roleService.js";
import { encodeLoginPayload } from "./wechatPayload.js";
import { log } from "../core/logger.js";

/**
 * 微信扫码登录（借用手机 App 的登录链路）。
 *
 * 流程：
 *   1. 取微信开放平台 app 扫码二维码（uuid）
 *   2. 长轮询扫码状态，确认后拿到 code
 *   3. code 换 hortor combUser（请求 body 需要特定混淆）
 *   4. combUser 打包成账号级 BIN → /login/serverlist 拿到该账号下所有角色
 *   5. 选中角色后按 serverId 重建 BIN → /login/authuser 换取角色凭据
 */

const WX_APPID = "wxfb0d5667e5cb1c44";
const WX_BUNDLE_ID = "com.hortor.games.xyzw";
const WX_SCOPE = "snsapi_base,snsapi_userinfo,snsapi_friend,snsapi_message";
const WX_QR_URL = "https://open.weixin.qq.com/connect/app/qrconnect";
const WX_POLL_URL = "https://long.open.weixin.qq.com/connect/l/qrconnect";
const HORTOR_LOGIN_URL =
  "https://comb-platform.hortorgames.com/comb-login-server/api/v1/login";
/** 模拟微信内置浏览器的 UA，微信侧会校验 */
const WX_UA =
  "Mozilla/5.0 (Linux; Android 7.0; Mi-4c Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043632 Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN";
export interface WechatQr {
  uuid: string;
  imageUrl: string;
}

export type WechatScanState = "waiting" | "scanned" | "confirmed" | "expired";

export interface WechatScanResult {
  status: WechatScanState;
  code?: string;
  nickname?: string;
}

export interface WechatRole {
  serverId: string;
  roleId: string | null;
  name: string;
  power: number | null;
  levelId: number | null;
  serverName: string | null;
}

export interface WechatSessionView {
  sessionId: string;
  nickname: string;
  roles: WechatRole[];
}

interface WechatSession {
  sessionId: string;
  nickname: string;
  /** 账号级 BIN（serverId 为 null），按 serverId 重建后可换角色凭据 */
  binBase64: string;
  roles: WechatRole[];
  createdAt: number;
}

/** 会话只在内存里保留 10 分钟，不落库 */
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map<string, WechatSession>();

function pruneSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dict(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** 取微信登录二维码：解析 HTML 里的 <img class="auth_qrcode"> */
export async function createWechatQr(): Promise<WechatQr> {
  const params = new URLSearchParams({
    appid: WX_APPID,
    bundleid: WX_BUNDLE_ID,
    scope: WX_SCOPE,
    state: "weixin",
  });
  const response = await fetch(`${WX_QR_URL}?${params.toString()}`, {
    headers: {
      "User-Agent": WX_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: "https://open.weixin.qq.com/",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`微信二维码接口返回 ${response.status}`);
  }
  const html = await response.text();
  const matched =
    html.match(/class="auth_qrcode"[^>]*src="([^"]+)"/) ??
    html.match(/https:\/\/open\.weixin\.qq\.com\/connect\/qrcode\/[A-Za-z0-9]+/);
  const imageUrl = (matched?.[1] ?? matched?.[0])?.trim();
  if (!imageUrl) {
    throw new Error("未能从微信页面解析出二维码");
  }
  const uuid = imageUrl.split("/").pop()?.split("?")[0] ?? "";
  if (!uuid) {
    throw new Error("二维码地址缺少 uuid");
  }
  return { uuid, imageUrl };
}

/**
 * 轮询扫码状态。
 * 408 = 本轮无事件（未扫码），403 = 已扫未确认，404 = 二维码失效，
 * 405 = 已确认，wx_redirecturl 里带 code。
 */
export async function pollWechatScan(uuid: string): Promise<WechatScanResult> {
  const url = `${WX_POLL_URL}?uuid=${encodeURIComponent(uuid)}&f=url&_=${Date.now()}`;
  let text = "";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": WX_UA,
        Accept: "*/*",
        Referer: "https://open.weixin.qq.com/",
      },
      // 微信长轮询大约 15 秒返回一次
      signal: AbortSignal.timeout(20_000),
    });
    text = await response.text();
  } catch {
    return { status: "waiting" };
  }
  const codeMatch = text.match(/wx_errcode=(\d+)/);
  const errcode = codeMatch ? Number(codeMatch[1]) : 408;
  const nickname =
    text.match(/window\.wx_nickname\s*=\s*'([^']*)'/)?.[1] ??
    text.match(/window\.wx_nickname\s*=\s*"([^"]*)"/)?.[1] ??
    "";

  if (errcode === 405) {
    const redirect =
      text.match(/wx_redirecturl\s*=\s*'([^']*)'/)?.[1] ??
      text.match(/wx_redirecturl\s*=\s*"([^"]*)"/)?.[1] ??
      "";
    const code = redirect.match(/[?&]code=([^&'"]+)/)?.[1] ?? "";
    if (!code) return { status: "waiting", nickname };
    return { status: "confirmed", code, nickname };
  }
  // 403/404 在不同客户端版本里都表示「已扫码」；二维码是否过期交给前端倒计时判断，
  // 避免扫码瞬间被 WeChat 回的 404 误判成过期。
  if (errcode === 403 || errcode === 404) {
    log.info(`微信轮询状态 ${errcode}：${text.slice(0, 160)}`);
    return { status: "scanned", nickname };
  }
  log.info(
    `微信轮询未知响应 errcode=${errcode}：${text.slice(0, 160)}`,
  );
  return { status: "waiting", nickname };
}

/** 用微信 code 换 hortor 账号信息（combUser） */
export async function loginWithWechatCode(
  code: string,
): Promise<Record<string, unknown>> {
  const payload = {
    gameId: "xyzwapp",
    code,
    gameTp: "app",
    sysInfo:
      '{"system":"Android","hortorSDKVersion":"4.0.6-cn","model":"22081212C","brand":"Redmi"}',
    channel: "android",
    appFrom: "com.tencent.mm",
    noLogin: "2",
    distinctId: "DID-a38175b7-14ce-4b36-aa89-3e092ea03ea6",
    state: "hortor",
    packageName: "com.hortor.games.xyzw",
    tp: "app-we",
    signPrint: "E6:F7:FE:A9:EC:8E:24:D0:4F:2A:32:50:28:78:E1:C5:5E:70:81:13",
  };
  const body = encodeLoginPayload(JSON.stringify(payload));
  const url =
    `${HORTOR_LOGIN_URL}?gameId=xyzwapp&timestamp=${Date.now()}` +
    "&version=android-4.2.1-cn-release&cryptVersion=1.1.0" +
    "&gameTp=app&system=android" +
    "&deviceUniqueId=DID-0e782e88-2f3b-4f5b-9020-47f5e5a5a026" +
    "&packageName=com.hortorgames.xyzw";

  return scheduleLoginRequest(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Accept: "*/*",
        Origin: "https://open.weixin.qq.com",
        Referer: "https://open.weixin.qq.com/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0 Mobile Safari/537.36",
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let json: {
      meta?: { errCode?: number; errMsg?: string };
      data?: { combUser?: Record<string, unknown> };
    };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`登录接口返回非 JSON：${text.slice(0, 120)}`);
    }
    if (json.meta?.errCode !== 0 || !json.data?.combUser) {
      throw new Error(
        `微信登录失败：${json.meta?.errMsg ?? `errcode ${json.meta?.errCode ?? "?"}`}`,
      );
    }
    return json.data.combUser;
  });
}

function normalizeRoles(list: unknown[]): WechatRole[] {
  return list
    .map((node) => {
      const entry = dict(node);
      const serverId = pickNumber(entry.serverId);
      if (serverId === null) return null;
      return {
        serverId: String(serverId),
        roleId:
          entry.roleId === undefined || entry.roleId === null
            ? null
            : String(entry.roleId),
        name:
          typeof entry.name === "string" && entry.name
            ? entry.name
            : `角色 ${serverId}`,
        power: pickNumber(entry.power),
        levelId: pickNumber(entry.levelId),
        serverName:
          typeof entry.serverName === "string" && entry.serverName
            ? entry.serverName
            : null,
      } satisfies WechatRole;
    })
    .filter((item): item is WechatRole => item !== null)
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
}

/** 扫码确认后：combUser → 账号 BIN → 该账号下所有角色 */
export async function completeWechatLogin(
  code: string,
  nickname = "",
): Promise<WechatSessionView> {
  pruneSessions();
  const combUser = await loginWithWechatCode(code);
  const bin = encodeBin({
    platform: "hortor",
    platformExt: "mix",
    info: combUser,
    serverId: null,
    scene: 0,
    referrerInfo: "",
  });
  const roles = normalizeRoles(await getServerList(bin));
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    sessionId,
    nickname,
    binBase64: arrayBufferToBase64(bin),
    roles,
    createdAt: Date.now(),
  });
  log.info(`微信扫码登录成功：${roles.length} 个角色`);
  return { sessionId, nickname, roles };
}

export interface WechatImportSelection {
  serverId: string | number;
  roleId?: string | number | null;
  name?: string;
}

export interface WechatImportResult {
  serverId: string;
  roleId: string | null;
  name: string;
  status: "created" | "updated" | "failed";
  error?: string;
}

/** 选中角色 → 按 serverId 重建 BIN → 兑换凭据并入库 */
export async function importWechatRoles(
  ownerId: string,
  sessionId: string,
  selections: WechatImportSelection[],
): Promise<WechatImportResult[]> {
  pruneSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("登录会话不存在或已过期，请重新扫码");
  }
  const bin = binFromBase64(session.binBase64);
  const results: WechatImportResult[] = [];

  for (const selection of selections) {
    const serverId = String(selection.serverId);
    try {
      const { credential, payload } = await exchangeBin(bin, serverId);
      const storedBin = arrayBufferToBase64(buildRoleBin(payload, serverId));
      const serverName =
        typeof payload.serverName === "string" && payload.serverName
          ? payload.serverName
          : deriveServerLabel(serverId);
      const name =
        selection.name ||
        (typeof payload.name === "string" ? payload.name : "微信导入");
      const gameRoleId =
        selection.roleId === undefined || selection.roleId === null
          ? null
          : String(selection.roleId);

      const duplicate = findRoleDuplicate(ownerId, {
        gameRoleId,
        server: serverName,
        name,
      });
      if (duplicate) {
        updateRole(ownerId, duplicate.id, {
          credential,
          binBase64: storedBin,
          serverId,
          server: serverName,
          gameRoleId,
          credentialStatus: "valid",
          credentialError: null,
        });
        results.push({ serverId, roleId: gameRoleId, name, status: "updated" });
      } else {
        createRole(ownerId, {
          name,
          server: serverName,
          serverId,
          gameRoleId,
          credential,
          importMethod: "wx",
          binBase64: storedBin,
        });
        results.push({ serverId, roleId: gameRoleId, name, status: "created" });
      }
    } catch (error) {
      results.push({
        serverId,
        roleId:
          selection.roleId === undefined || selection.roleId === null
            ? null
            : String(selection.roleId),
        name: selection.name || `区服 ${serverId}`,
        status: "failed",
        error: (error as Error)?.message ?? "导入失败",
      });
    }
    // 兑换凭据走同一套限流，这里稍微错开避免瞬间打满
    await sleep(300);
  }

  return results;
}

/** 供测试或后续扩展：手动清理全部会话 */
export function clearWechatSessions(): void {
  sessions.clear();
}
