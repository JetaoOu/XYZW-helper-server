import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { config } from "../config.js";
import { db, nowIso } from "../db/index.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "sid";
const SESSION_MS = config.sessionDays * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  username: string;
  expiresAt: string;
}

/** 创建会话，返回明文令牌（仅此一次），数据库只保存其哈希 */
export function createSession(userId: string): {
  token: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  db.insert(sessions)
    .values({
      id: hashToken(token),
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: nowIso(),
    })
    .run();
  return { token, expiresAt };
}

/** 校验会话令牌，返回用户信息；过期或不存在返回 null */
export function resolveSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db
    .select({
      userId: users.id,
      username: users.username,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, nowIso()),
      ),
    )
    .get();
  if (!row) return null;
  return { id: row.userId, username: row.username, expiresAt: row.expiresAt };
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

/** 清理过期会话 */
export function cleanupSessions(): void {
  db.delete(sessions).where(lt(sessions.expiresAt, nowIso())).run();
}
