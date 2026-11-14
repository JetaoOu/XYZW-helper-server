import { lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { commandLogs, runLogs, sessions } from "../db/schema.js";
import { log } from "../core/logger.js";
import { nowIso } from "../db/index.js";

import { cleanupResourceSnapshots } from "./resources.js";

const LOG_RETENTION_DAYS = 30;

/** 清理过期会话与 30 天前的命令日志 */
export function runCleanup(): void {
  const now = new Date();
  const logCutoff = new Date(
    now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const deletedSessions = db
    .delete(sessions)
    .where(lt(sessions.expiresAt, nowIso()))
    .run();
  const deletedLogs = db
    .delete(commandLogs)
    .where(lt(commandLogs.createdAt, logCutoff))
    .run();
  const deletedRunLogs = db
    .delete(runLogs)
    .where(lt(runLogs.createdAt, logCutoff))
    .run();
  const deletedResourceSnapshots = cleanupResourceSnapshots(90);

  log.info(
    `清理完成：过期会话 ${deletedSessions.changes} 条，命令日志 ${deletedLogs.changes} 条，运行日志 ${deletedRunLogs.changes} 条，资源快照 ${deletedResourceSnapshots} 条`,
  );
}
