import type { FastifyInstance } from "fastify";
import { requireUser } from "./guard.js";
import {
  completeWechatLogin,
  createWechatQr,
  importWechatRoles,
  pollWechatScan,
  type WechatImportSelection,
} from "../services/wechatLogin.js";
import { log } from "../core/logger.js";

/** 微信扫码添加角色：二维码 → 轮询状态 → 换取账号 → 按区服导入角色 */
export async function registerWechatRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/api/wx/qrcode",
    { preHandler: requireUser },
    async (_request, reply) => {
      try {
        const qr = await createWechatQr();
        log.info("已生成微信登录二维码");
        return qr;
      } catch (error) {
        log.warn(`获取微信二维码失败：${(error as Error).message}`);
        return reply
          .code(502)
          .send({ error: (error as Error).message || "获取微信二维码失败" });
      }
    },
  );

  app.get<{ Querystring: { uuid?: string } }>(
    "/api/wx/status",
    { preHandler: requireUser },
    async (request, reply) => {
      const uuid = request.query.uuid?.trim();
      if (!uuid) {
        return reply.code(400).send({ error: "缺少 uuid" });
      }
      try {
        const result = await pollWechatScan(uuid);
        // 只在状态变化时留痕，避免刷屏（不记录 code）
        if (result.status !== "waiting") {
          log.info(`微信扫码状态：${result.status}`);
        }
        return result;
      } catch (error) {
        return reply
          .code(502)
          .send({ error: (error as Error).message || "查询扫码状态失败" });
      }
    },
  );

  app.post(
    "/api/wx/complete",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { code?: string; nickname?: string }
        | undefined;
      if (!body?.code) {
        return reply.code(400).send({ error: "缺少微信 code" });
      }
      try {
        return await completeWechatLogin(body.code, body.nickname ?? "");
      } catch (error) {
        log.warn(`微信登录失败：${(error as Error).message}`);
        return reply
          .code(400)
          .send({ error: (error as Error).message || "微信登录失败" });
      }
    },
  );

  app.post(
    "/api/wx/import",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { sessionId?: string; roles?: WechatImportSelection[] }
        | undefined;
      if (!body?.sessionId || !Array.isArray(body.roles) || body.roles.length === 0) {
        return reply.code(400).send({ error: "请选择要导入的角色" });
      }
      try {
        const results = await importWechatRoles(
          request.user!.id,
          body.sessionId,
          body.roles,
        );
        const created = results.filter((item) => item.status === "created").length;
        const updated = results.filter((item) => item.status === "updated").length;
        const failed = results.filter((item) => item.status === "failed").length;
        log.info(
          `微信导入角色：新增 ${created}，更新 ${updated}，失败 ${failed}`,
        );
        return { results, created, updated, failed };
      } catch (error) {
        return reply
          .code(400)
          .send({ error: (error as Error).message || "导入角色失败" });
      }
    },
  );
}
