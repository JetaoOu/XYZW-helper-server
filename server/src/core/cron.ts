import { Cron } from "croner";
import { TIMEZONE } from "./time.js";

/** 校验 cron 表达式是否合法 */
export function validateCron(expression: string): boolean {
  try {
    const probe = new Cron(expression, { timezone: TIMEZONE, paused: true });
    probe.stop();
    return true;
  } catch {
    return false;
  }
}

/** 计算下一次运行时间（ISO 字符串，按 Asia/Shanghai 解释） */
export function computeNextRun(
  expression: string,
  from: Date = new Date(),
): string | null {
  try {
    const probe = new Cron(expression, {
      timezone: TIMEZONE,
      paused: true,
    });
    const next = probe.nextRun(from);
    probe.stop();
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

/** 计算上一个计划时间点（用于启动时的补跑判断） */
export function computePreviousRun(
  expression: string,
  from: Date = new Date(),
): Date | null {
  try {
    const probe = new Cron(expression, {
      timezone: TIMEZONE,
      paused: true,
    });
    const previous = probe.previousRun();
    probe.stop();
    return previous;
  } catch {
    return null;
  }
}
