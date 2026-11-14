import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { Cron } from "croner";
import { count } from "drizzle-orm";
import { config } from "./config.js";
import { db, newId, nowIso, sqlite } from "./db/index.js";
import { users } from "./db/schema.js";
import { hashPassword } from "./auth/password.js";
import { cleanupSessions } from "./auth/session.js";
import { TIMEZONE } from "./core/time.js";
import { log } from "./core/logger.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerRoleRoutes } from "./routes/roles.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerScheduleRoutes } from "./routes/schedules.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerMetaRoutes } from "./routes/meta.js";
import { registerWechatRoutes } from "./routes/wechat.js";
import { reloadSchedules } from "./services/scheduler.js";
import { runBackup } from "./services/backup.js";
import { runCleanup } from "./services/cleanup.js";

/** 首次启动时创建管理员账号 */
function ensureAdminUser(): string {
  const existing = db.select({ value: count() }).from(users).get();
  if (existing && existing.value > 0) {
    return db.select().from(users).get()!.id;
  }
  const id = newId();
  db.insert(users)
    .values({
      id,
      username: config.adminUsername,
      passwordHash: hashPassword(config.adminPassword),
      createdAt: nowIso(),
    })
    .run();
  log.info(`已创建管理员账号：${config.adminUsername}`);
  if (config.adminPassword === "change-me-please") {
    log.warn("管理员密码仍是默认值，请尽快在设置页修改！");
  }
  return id;
}

function scheduleHousekeeping(): void {
  // 每天 03:00 备份数据库
  new Cron("0 3 * * *", { timezone: TIMEZONE }, () => {
    runBackup().catch((error) => log.error("数据库备份失败", error));
  });
  // 每天 12:00 清理日志与过期会话
  new Cron("0 12 * * *", { timezone: TIMEZONE }, () => {
    runCleanup();
  });
  // 每小时清理过期会话
  new Cron("0 * * * *", { timezone: TIMEZONE }, () => {
    cleanupSessions();
  });
}

async function main(): Promise<void> {
  const app = Fastify({
    logger: false,
    bodyLimit: 25 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cookie);

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    log.error(`请求失败 ${request.method} ${request.url}`, err);
    reply
      .code(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500)
      .send({ error: err.message || "服务器内部错误" });
  });

  await registerAuthRoutes(app);
  await registerRoleRoutes(app);
  await registerGroupRoutes(app);
  await registerScheduleRoutes(app);
  await registerRunRoutes(app);
  await registerSettingsRoutes(app);
  await registerMetaRoutes(app);
  await registerWechatRoutes(app);

  // 生产模式下由后端托管前端静态文件
  const hasWebDist = fs.existsSync(path.join(config.webDist, "index.html"));
  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "接口不存在" });
      }
      return reply.sendFile("index.html");
    });
    log.info(`已托管前端静态文件：${config.webDist}`);
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "接口不存在" });
      }
      return reply.code(404).send({
        error: "前端尚未构建，请先执行 pnpm build:web",
      });
    });
  }

  const ownerId = ensureAdminUser();
  reloadSchedules(ownerId);
  scheduleHousekeeping();

  await app.listen({ port: config.port, host: "0.0.0.0" });
  log.info(`服务已启动：http://0.0.0.0:${config.port}`);

  const shutdown = async () => {
    log.info("正在关闭服务…");
    await app.close();
    sqlite.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  log.error("启动失败", error);
  process.exit(1);
});
