import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { db, nowIso } from "../db/index.js";
import { runLogs } from "../db/schema.js";

export interface RunLogEvent {
  id?: string;
  runId: string;
  roleId?: string;
  roleName?: string;
  actionKey?: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  at?: string;
}

export interface RunStatusEvent {
  runId: string;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  successCount?: number;
  failedCount?: number;
  skippedCount?: number;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

/** 运行日志：同时落库（供历史查看）并推送给 SSE 订阅者 */
export function emitRunLog(event: RunLogEvent): void {
  const id = event.id ?? randomUUID();
  const at = event.at ?? nowIso();
  const payload = { ...event, id, at };
  try {
    db.insert(runLogs)
      .values({
        id,
        runId: event.runId,
        roleId: event.roleId ?? null,
        roleName: event.roleName ?? null,
        actionKey: event.actionKey ?? null,
        level: event.level,
        message: event.message,
        createdAt: at,
      })
      .run();
  } catch {
    // 日志落库失败不应影响任务执行
  }
  emitter.emit(`run:${event.runId}`, { type: "log", data: payload });
}

export function emitRunStatus(event: RunStatusEvent): void {
  emitter.emit(`run:${event.runId}`, { type: "status", data: event });
}

/** 订阅某个运行的实时事件，返回取消订阅函数 */
export function subscribeRun(
  runId: string,
  handler: (event: { type: string; data: unknown }) => void,
): () => void {
  const eventName = `run:${runId}`;
  emitter.on(eventName, handler);
  return () => emitter.off(eventName, handler);
}

/** 全局状态变更（供总览页刷新计划状态） */
export function emitGlobal(event: string, data: unknown): void {
  emitter.emit(`global:${event}`, data);
}

export function subscribeGlobal(
  event: string,
  handler: (data: unknown) => void,
): () => void {
  const eventName = `global:${event}`;
  emitter.on(eventName, handler);
  return () => emitter.off(eventName, handler);
}
