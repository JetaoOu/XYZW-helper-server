import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { sqlite } from "../db/index.js";
import { log } from "../core/logger.js";

const BACKUP_DIR = path.join(config.dataDir, "backups");
const KEEP = 7;

function pruneBackups(): void {
  const files = readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(".db"))
    .sort();
  while (files.length > KEEP) {
    const oldest = files.shift();
    if (!oldest) break;
    try {
      unlinkSync(path.join(BACKUP_DIR, oldest));
    } catch (error) {
      log.warn(`清理旧备份失败 ${oldest}`, error);
    }
  }
}

/** 在线备份 SQLite 到宿主机挂载目录，保留最近 7 份 */
export async function runBackup(): Promise<string> {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(BACKUP_DIR, `xyzw-${stamp}.db`);
  await sqlite.backup(destination);
  pruneBackups();
  log.info(`数据库备份完成：${destination}`);
  return destination;
}
