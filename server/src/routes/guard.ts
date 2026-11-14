import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSession, type SessionUser } from "../auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

/** 受保护路由的 preHandler：校验会话 cookie */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies?.sid;
  const user = resolveSession(token);
  if (!user) {
    await reply.code(401).send({ error: "未登录或会话已过期" });
    return;
  }
  request.user = user;
}
