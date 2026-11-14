import WebSocket from "ws";
import { bon, encode, getEnc, parse } from "./bonProtocol.js";
import {
  BATTLE_COMMANDS,
  CMD_DEFAULTS,
  ERROR_CODE_MAP,
  RESP_MAP,
  classifyErrorCode,
  type ErrorKind,
} from "./commands.js";

export interface GameClientOptions {
  /** 角色显示名，仅用于日志 */
  name?: string;
  /** 自定义 WebSocket 地址；默认按 connId 等参数拼接 */
  wsUrl?: string;
  /** 连接超时（毫秒） */
  connectTimeoutMs?: number;
  /** 心跳间隔（毫秒） */
  heartbeatMs?: number;
  /** 命令日志回调 */
  onCommand?: (entry: {
    cmd: string;
    status: "ok" | "error" | "sent";
    code?: number;
    message?: string;
  }) => void;
  /** 每条已解析消息的回调（调试与奖励解析用） */
  onMessage?: (message: {
    cmd?: string;
    resp?: string | number;
    body?: unknown;
  }) => void;
}

export interface CredentialParams {
  roleToken: string;
  roleId?: string | number;
  sessId?: number | string;
  connId?: number | string;
  isRestore?: number | string;
}

/** 游戏服务器错误：code 为业务错误码，kind 决定跳过/重试/失败 */
export class GameError extends Error {
  code?: number;
  kind: ErrorKind;
  constructor(message: string, code?: number, kind?: ErrorKind) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.kind = kind ?? classifyErrorCode(code);
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  originalCmd: string;
}

/** 默认游戏 WebSocket 地址：`p` 参数直接放凭据字符串 */
export function buildDefaultWsUrl(credential: string): string {
  return `wss://xxz-xyzw.hortorgames.com/agent?p=${encodeURIComponent(
    credential,
  )}&e=x&lang=chinese`;
}

/**
 * 按需连接的游戏客户端。
 *
 * 与浏览器版不同，这里不做自动重连：一次运行中途断线会导致结果不确定，
 * 由上层把本轮标记为失败，等待下一次重新读取服务器状态（见 ADR 0002）。
 */
export class GameClient {
  readonly name: string;
  readonly url: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private ack = 0;
  private seq = 0;
  private promises = new Map<string | number, PendingRequest>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatStartTimer: NodeJS.Timeout | null = null;
  private readonly heartbeatMs: number;
  private readonly onCommand?: GameClientOptions["onCommand"];
  private readonly onMessage?: GameClientOptions["onMessage"];
  private battleVersion: number | null = null;

  /** 服务器最近一次返回的时间戳（毫秒） */
  serverTime: number | null = null;

  /** 最近一次连接关闭的码与原因，便于定位凭据问题 */
  lastCloseInfo: string | null = null;

  constructor(credential: string, options: GameClientOptions = {}) {
    this.name = options.name || "?";
    this.url = options.wsUrl || buildDefaultWsUrl(credential);
    this.heartbeatMs = options.heartbeatMs ?? 5000;
    this.onCommand = options.onCommand;
    this.onMessage = options.onMessage;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** 建立连接；超时或失败时抛错 */
  connect(timeoutMs = 15000): Promise<void> {
    this.disconnect();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };

      const timer = setTimeout(() => {
        finish(new Error("连接超时"));
        this.disconnect();
      }, timeoutMs);

      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url);
      } catch (error) {
        finish(error as Error);
        return;
      }
      this.ws = socket;
      this.seq = 0;
      this.ack = 0;
      socket.binaryType = "arraybuffer";

      socket.on("open", () => {
        if (this.ws !== socket) return;
        this.connected = true;
        finish();
        this.startHeartbeat();
      });

      socket.on("message", (data) => {
        if (this.ws !== socket) return;
        this.handleMessage(data as Buffer);
      });

      socket.on("close", (code, reasonBuffer) => {
        const reason = reasonBuffer?.toString?.() ?? "";
        this.lastCloseInfo = `code=${code}${reason ? ` reason=${reason}` : ""}`;
        finish(new Error(`连接在建立前已关闭 (${this.lastCloseInfo})`));
        if (this.ws !== socket) return;
        this.ws = null;
        this.connected = false;
        this.stopHeartbeat();
        this.rejectPending(
          new Error(`WebSocket 连接已关闭 (${this.lastCloseInfo})`),
        );
      });

      socket.on("error", (error) => {
        if (this.ws !== socket) return;
        finish(error);
      });
    });
  }

  disconnect(): void {
    const socket = this.ws;
    this.ws = null;
    this.connected = false;
    this.stopHeartbeat();
    this.rejectPending(new Error("连接已关闭"));
    socket?.close();
  }

  /** 发送但不等待响应 */
  send(cmd: string, params: Record<string, unknown> = {}): void {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      throw new GameError(`未连接，无法发送 ${cmd}`);
    }
    const assignedSeq = cmd === "heart_beat" ? 0 : ++this.seq;
    const body = this.buildBody(cmd, params);
    const packet = encode(
      {
        cmd,
        ack: this.ack,
        seq: assignedSeq,
        time: Date.now(),
        body,
      },
      getEnc("x"),
    );
    this.ws.send(packet);
    this.onCommand?.({ cmd, status: "sent" });
  }

  /**
   * 发送并等待响应。
   * 超时只清理本请求，不影响连接；业务错误转换为 GameError。
   */
  sendWithPromise(
    cmd: string,
    params: Record<string, unknown> = {},
    timeoutMs = 8000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
        reject(new GameError(`未连接，无法发送 ${cmd}`));
        return;
      }
      const requestSeq = ++this.seq;
      const timer = setTimeout(() => {
        this.promises.delete(requestSeq);
        reject(new GameError(`请求超时: ${cmd} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.promises.set(requestSeq, {
        resolve,
        reject,
        timer,
        originalCmd: cmd,
      });

      try {
        const body = this.buildBody(cmd, params);
        const packet = encode(
          {
            cmd,
            ack: this.ack,
            seq: requestSeq,
            time: Date.now(),
            body,
          },
          getEnc("x"),
        );
        this.ws.send(packet);
      } catch (error) {
        clearTimeout(timer);
        this.promises.delete(requestSeq);
        reject(error as Error);
      }
    });
  }

  /** 按顺序执行一批命令；每条之间等待 delayMs */
  async executeBatch(
    commands: Array<{
      cmd: string;
      params?: Record<string, unknown>;
      timeout?: number;
    }>,
    delayMs = 500,
  ): Promise<
    Array<{ cmd: string; ok: boolean; error?: GameError; data?: unknown }>
  > {
    const results: Array<{
      cmd: string;
      ok: boolean;
      error?: GameError;
      data?: unknown;
    }> = [];
    for (const command of commands) {
      try {
        const data = await this.sendWithPromise(
          command.cmd,
          command.params,
          command.timeout ?? 8000,
        );
        results.push({ cmd: command.cmd, ok: true, data });
      } catch (error) {
        results.push({
          cmd: command.cmd,
          ok: false,
          error:
            error instanceof GameError
              ? error
              : new GameError((error as Error).message),
        });
      }
      if (delayMs > 0) await sleep(delayMs);
    }
    return results;
  }

  /** 读取数据版本并缓存 battleVersion */
  async refreshBattleVersion(): Promise<number | null> {
    try {
      const response = (await this.sendWithPromise(
        "fight_startlevel",
        {},
        5000,
      )) as { battleData?: { version?: number } } | undefined;
      const version = response?.battleData?.version;
      if (Number.isFinite(version)) {
        this.battleVersion = version as number;
      }
    } catch {
      // 战斗版本不是所有账号都必须的，失败不影响日常任务
    }
    return this.battleVersion;
  }

  private buildBody(
    cmd: string,
    params: Record<string, unknown>,
  ): Uint8Array {
    const merged: Record<string, unknown> = {
      ...(CMD_DEFAULTS[cmd] || {}),
      ...params,
    };
    if (BATTLE_COMMANDS.has(cmd) && this.battleVersion !== null) {
      merged.battleVersion = this.battleVersion;
    }
    return bon.encode(merged) as Uint8Array;
  }

  private handleMessage(data: Buffer): void {
    this.serverTime = Date.now();
    let message;
    try {
      message = parse(data, getEnc("auto"));
    } catch {
      return;
    }
    const raw = message._raw as
      | {
          seq?: number;
          resp?: string | number;
          cmd?: string;
          code?: number;
          hint?: string;
          time?: number;
          body?: Uint8Array;
        }
      | undefined;
    if (!raw) return;
    if (typeof raw.time === "number" && raw.time > 0) this.serverTime = raw.time;
    if (typeof raw.seq === "number" && raw.seq >= 0) this.ack = raw.seq;

    if (this.onMessage) {
      try {
        this.onMessage({
          cmd: raw.cmd,
          resp: raw.resp,
          body: raw.body === undefined ? undefined : bon.decode(raw.body as Uint8Array),
        });
      } catch {
        this.onMessage({ cmd: raw.cmd, resp: raw.resp, body: undefined });
      }
    }

    const code = raw.code;
    const isOk = code === 0 || code === undefined;

    // 新协议：用 resp 字段直接匹配请求 seq
    if (raw.resp !== undefined) {
      const pending = this.promises.get(raw.resp);
      if (pending) {
        this.promises.delete(raw.resp);
        clearTimeout(pending.timer);
        if (isOk) {
          this.onCommand?.({ cmd: pending.originalCmd, status: "ok" });
          pending.resolve(message.rawData ?? raw);
        } else {
          const error = new GameError(
            `服务器错误: ${code} - ${ERROR_CODE_MAP[code as number] || raw.hint || "未知错误"}`,
            code as number,
          );
          this.onCommand?.({
            cmd: pending.originalCmd,
            status: "error",
            code: code as number,
            message: error.message,
          });
          pending.reject(error);
        }
        return;
      }
    }

    // 兼容旧协议：按响应 cmd 名称匹配
    const responseCmd = (raw.resp ?? raw.cmd)?.toString().toLowerCase();
    if (!responseCmd) return;
    const mapped = RESP_MAP[responseCmd];
    if (!mapped) return;
    const requestCmds = Array.isArray(mapped) ? mapped : [mapped];
    for (const [key, pending] of this.promises) {
      if (!requestCmds.includes(pending.originalCmd)) continue;
      this.promises.delete(key);
      clearTimeout(pending.timer);
      if (isOk) {
        this.onCommand?.({ cmd: pending.originalCmd, status: "ok" });
        pending.resolve(message.rawData ?? raw);
      } else {
        const error = new GameError(
          `服务器错误: ${code} - ${ERROR_CODE_MAP[code as number] || raw.hint || "未知错误"}`,
          code as number,
        );
        this.onCommand?.({
          cmd: pending.originalCmd,
          status: "error",
          code: code as number,
          message: error.message,
        });
        pending.reject(error);
      }
      return;
    }
  }

  private rejectPending(error: Error): void {
    for (const [key, pending] of this.promises) {
      clearTimeout(pending.timer);
      this.promises.delete(key);
      pending.reject(error);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const socket = this.ws;
    this.heartbeatStartTimer = setTimeout(() => {
      this.heartbeatStartTimer = null;
      if (this.ws === socket && this.connected) this.sendHeartbeat();
    }, 3000);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws === socket && this.connected) this.sendHeartbeat();
    }, this.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatStartTimer) clearTimeout(this.heartbeatStartTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatStartTimer = null;
    this.heartbeatTimer = null;
  }

  private sendHeartbeat(): void {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      const packet = encode(
        {
          cmd: "_sys/ack",
          ack: this.ack,
          seq: 0,
          time: Date.now(),
          body: undefined,
        },
        getEnc("x"),
      );
      this.ws.send(packet);
    } catch {
      // 心跳失败交由连接关闭事件处理
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
