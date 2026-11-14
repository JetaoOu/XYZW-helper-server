import { eq } from "drizzle-orm";
import { db, nowIso } from "../db/index.js";
import { roleDailyStatus } from "../db/schema.js";

export interface DailyTaskStateView {
  id: number;
  condition: number;
  label: string;
  progress: number;
  required: number;
  remaining: number;
  status: "pending" | "claimable" | "claimed";
}

/** 保存角色最近一次读取到的官方日常任务进度 */
export function saveDailyStatus(
  roleId: string,
  tasks: DailyTaskStateView[],
): void {
  if (!Array.isArray(tasks) || tasks.length === 0) return;
  const payload = JSON.stringify(tasks);
  db.insert(roleDailyStatus)
    .values({ roleId, updatedAt: nowIso(), payload })
    .onConflictDoUpdate({
      target: roleDailyStatus.roleId,
      set: { updatedAt: nowIso(), payload },
    })
    .run();
}

export interface DailyStatusResult {
  updatedAt: string;
  tasks: DailyTaskStateView[];
}

export function getDailyStatus(roleId: string): DailyStatusResult | null {
  const row = db
    .select()
    .from(roleDailyStatus)
    .where(eq(roleDailyStatus.roleId, roleId))
    .get();
  if (!row) return null;
  try {
    const tasks = JSON.parse(row.payload) as DailyTaskStateView[];
    return { updatedAt: row.updatedAt, tasks };
  } catch {
    return null;
  }
}
