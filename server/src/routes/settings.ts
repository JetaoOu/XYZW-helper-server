import type { FastifyInstance } from "fastify";
import { requireUser } from "./guard.js";
import {
  SETTING_DEFAULTS,
  getSettings,
  updateSettings,
} from "../services/settings.js";

export async function registerSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/settings",
    { preHandler: requireUser },
    async () => ({
      settings: getSettings(),
      defaults: SETTING_DEFAULTS,
    }),
  );

  app.patch(
    "/api/settings",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object") {
        return reply.code(400).send({ error: "缺少设置内容" });
      }
      return { settings: updateSettings(body) };
    },
  );
}
