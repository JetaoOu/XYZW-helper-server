import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";

/** 设置项默认值；所有值以字符串存库 */
export const SETTING_DEFAULTS: Record<string, string> = {
  maxConcurrentRoles: "3",
  connectionDelayMs: "1000",
  commandDelayMs: "500",
  taskDelayMs: "500",
  clientVersion: "2.21.2-fa918e1997301834-wx",
  platform: "hortor",
  credentialRefreshHours: "12",
  webhookUrl: "",
};

export interface AppSettings {
  maxConcurrentRoles: number;
  connectionDelayMs: number;
  commandDelayMs: number;
  taskDelayMs: number;
  clientVersion: string;
  platform: string;
  credentialRefreshHours: number;
  webhookUrl: string;
}

function clampNumber(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

/** 读取全部设置（合并默认值） */
export function getSettings(): AppSettings {
  const rows = db.select().from(settings).all();
  const values = { ...SETTING_DEFAULTS };
  for (const row of rows) values[row.key] = row.value;
  return {
    maxConcurrentRoles: clampNumber(values.maxConcurrentRoles, 1, 10),
    connectionDelayMs: clampNumber(values.connectionDelayMs, 0, 10_000),
    commandDelayMs: clampNumber(values.commandDelayMs, 0, 10_000),
    taskDelayMs: clampNumber(values.taskDelayMs, 0, 10_000),
    clientVersion: values.clientVersion,
    platform: values.platform,
    credentialRefreshHours: clampNumber(
      values.credentialRefreshHours,
      1,
      72,
    ),
    webhookUrl: values.webhookUrl,
  };
}

/** 更新设置；只接受已知键，未知键忽略 */
export function updateSettings(patch: Record<string, unknown>): AppSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS)) continue;
    if (value === undefined || value === null) continue;
    const text = String(value);
    db.insert(settings)
      .values({ key, value: text })
      .onConflictDoUpdate({ target: settings.key, set: { value: text } })
      .run();
  }
  return getSettings();
}

/** 判断某个键是否允许写入 */
export function isKnownSetting(key: string): boolean {
  return key in SETTING_DEFAULTS;
}

/** 删除设置（恢复默认值） */
export function resetSetting(key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}
