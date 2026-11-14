/** 时区工具：所有调度语义固定按 Asia/Shanghai 解释 */

export const TIMEZONE = "Asia/Shanghai";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 返回指定时间（默认当前）在 Asia/Shanghai 下的日期，格式 YYYY-MM-DD */
export function dateKey(date: Date = new Date()): string {
  return dayFormatter.format(date);
}

/** 返回指定时间在 Asia/Shanghai 下的 HH:mm:ss */
export function timeKey(date: Date = new Date()): string {
  return timeFormatter.format(date);
}

/** 判断两个时间是否属于同一个上海日 */
export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

/** 把日期格式化为前端友好的完整时间（带时区） */
export function formatDateTime(date: Date): string {
  return `${dateKey(date)} ${timeKey(date)}`;
}
