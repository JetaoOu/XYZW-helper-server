const isDev = process.env.NODE_ENV !== "production";

function stamp(): string {
  return new Date().toISOString();
}

/** 简单结构化日志；生产环境只输出 info 及以上 */
export const log = {
  debug(...args: unknown[]): void {
    if (isDev) console.debug(`[debug]`, stamp(), ...args);
  },
  info(...args: unknown[]): void {
    console.info(`[info]`, stamp(), ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`[warn]`, stamp(), ...args);
  },
  error(...args: unknown[]): void {
    console.error(`[error]`, stamp(), ...args);
  },
};
