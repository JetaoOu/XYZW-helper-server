import { Cron } from "croner";
import { eq } from "drizzle-orm";
import { db, nowIso } from "../db/index.js";
import { schedules } from "../db/schema.js";
import { TIMEZONE } from "../core/time.js";
import { computeNextRun, validateCron } from "../core/cron.js";
import { log } from "../core/logger.js";
import { emitGlobal } from "../core/events.js";
import { listSchedules } from "./repositories.js";
import { executeSchedule } from "./executor.js";
import type { ScheduleRecord } from "../types.js";

const MISFIRE_GRACE_MS = 2 * 60 * 60 * 1000;

const jobs = new Map<string, Cron>();

function updateNextRun(scheduleId: string, next: Date | null): void {
  db.update(schedules)
    .set({ nextRunAt: next ? next.toISOString() : null })
    .where(eq(schedules.id, scheduleId))
    .run();
}

/** 启动时补跑：今天应跑时间已过、未跑过、且在 2 小时宽限内 */
function checkMisfire(schedule: ScheduleRecord, job: Cron): void {
  const previous = job.previousRun();
  if (!previous) return;
  const elapsed = Date.now() - previous.getTime();
  if (elapsed < 0 || elapsed > MISFIRE_GRACE_MS) return;
  const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  if (lastRun && lastRun >= previous) return;

  log.info(
    `计划 ${schedule.name} 检测到错过的触发点 ${previous.toISOString()}，开始补跑`,
  );
  executeSchedule(schedule, "scheduled").catch((error) => {
    log.error(`计划 ${schedule.name} 补跑失败`, error);
  });
}

function registerSchedule(schedule: ScheduleRecord): void {
  try {
    const job = new Cron(
      schedule.cronExpr,
      {
        timezone: TIMEZONE,
        protect: true,
      },
      () => {
        const current = jobs.get(schedule.id);
        executeSchedule(schedule, "scheduled")
          .catch((error) => {
            log.error(`计划 ${schedule.name} 执行失败`, error);
          })
          .finally(() => {
            updateNextRun(schedule.id, current?.nextRun() ?? null);
            emitGlobal("schedules", { scheduleId: schedule.id });
          });
      },
    );
    jobs.set(schedule.id, job);
    updateNextRun(schedule.id, job.nextRun());
    checkMisfire(schedule, job);
    log.info(
      `已注册计划 ${schedule.name} (${schedule.cronExpr} ${TIMEZONE})`,
    );
  } catch (error) {
    log.error(`计划 ${schedule.name} 注册失败：${(error as Error).message}`);
    updateNextRun(schedule.id, null);
  }
}

/** 重新注册全部计划（计划增删改后调用） */
export function reloadSchedules(ownerId: string): void {
  for (const job of jobs.values()) job.stop();
  jobs.clear();
  const list = listSchedules(ownerId);
  for (const schedule of list) {
    if (!schedule.enabled) {
      updateNextRun(schedule.id, null);
      continue;
    }
    registerSchedule(schedule);
  }
  emitGlobal("schedules", { reloaded: true });
  log.info(`调度器已加载 ${jobs.size} 个启用中的计划`);
}

/** 停止某个计划的调度器（删除计划时调用） */
export function unregisterSchedule(scheduleId: string): void {
  const job = jobs.get(scheduleId);
  if (!job) return;
  job.stop();
  jobs.delete(scheduleId);
}

/** 当前注册的计划数量 */
export function activeJobCount(): number {
  return jobs.size;
}

/** 刷新单次运行的"下次运行时间"（运行结束后调用） */
export function refreshNextRun(schedule: ScheduleRecord): void {
  const job = jobs.get(schedule.id);
  if (!job) return;
  updateNextRun(schedule.id, job.nextRun());
}

export function currentTimestamp(): string {
  return nowIso();
}
