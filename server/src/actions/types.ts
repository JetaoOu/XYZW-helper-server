import type { GameClient } from "../protocol/gameClient.js";
import type { AppSettings } from "../services/settings.js";
import type { ActionResult, RoleRecord } from "../types.js";

export interface ActionContext {
  role: RoleRecord;
  client: GameClient;
  settings: AppSettings;
  /** 发送命令：带一次瞬时错误重试，业务错误以 GameError 抛出 */
  send: (
    cmd: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<unknown>;
  /** 输出一条运行日志 */
  log: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
  sleep: (ms: number) => Promise<void>;
  commandDelay: number;
  taskDelay: number;
}

export interface ActionDefinition {
  key: string;
  name: string;
  description: string;
  /** 分类：日常 / 副本 / 宝库 / 怪异塔 / 资源 / 功法 */
  category: string;
  /**
   * 该动作额外需要的执行时长（毫秒）。
   * 角色级总超时 = 基础 5 分钟 + 所选动作的额外时长之和，
   * 用于推关这类需要长时间连续战斗的动作。
   */
  timeoutMs?: number;
  run: (ctx: ActionContext) => Promise<ActionResult>;
}
