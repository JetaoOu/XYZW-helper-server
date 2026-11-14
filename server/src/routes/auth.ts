import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
} from "../auth/session.js";
import { config } from "../config.js";
import { requireUser } from "./guard.js";

// 登录失败限流：同一 IP 10 分钟内失败 5 次后锁定 10 分钟
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = new Map<string, { count: number; firstAt: number }>();

function getClientKey(request: { ip: string }): string {
  return request.ip;
}

function isLocked(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > FAIL_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > FAIL_WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (request, reply) => {
    const key = getClientKey(request);
    if (isLocked(key)) {
      return reply
        .code(429)
        .send({ error: "登录失败次数过多，请 10 分钟后再试" });
    }
    const body = request.body as
      | { username?: string; password?: string }
      | undefined;
    const username = body?.username?.trim();
    const password = body?.password;
    if (!username || !password) {
      return reply.code(400).send({ error: "请输入用户名和密码" });
    }

    const user = db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      recordFailure(key);
      return reply.code(401).send({ error: "用户名或密码错误" });
    }

    attempts.delete(key);
    const session = createSession(user.id);
    reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionDays * 24 * 60 * 60,
    });
    return { user: { id: user.id, username: user.username } };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    deleteSession(request.cookies?.[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get(
    "/api/auth/me",
    { preHandler: requireUser },
    async (request) => ({
      user: {
        id: request.user?.id,
        username: request.user?.username,
      },
    }),
  );

  app.post(
    "/api/auth/password",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { currentPassword?: string; newPassword?: string }
        | undefined;
      if (!body?.currentPassword || !body?.newPassword) {
        return reply.code(400).send({ error: "请填写当前密码和新密码" });
      }
      if (body.newPassword.length < 8) {
        return reply.code(400).send({ error: "新密码至少 8 位" });
      }
      const user = db
        .select()
        .from(users)
        .where(eq(users.id, request.user!.id))
        .get();
      if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
        return reply.code(400).send({ error: "当前密码不正确" });
      }
      db.update(users)
        .set({ passwordHash: hashPassword(body.newPassword) })
        .where(eq(users.id, user.id))
        .run();
      // 修改密码后让该用户的现有会话全部失效
      db.delete(sessions).where(eq(sessions.userId, user.id)).run();
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return { ok: true };
    },
  );
}
