import type { FastifyInstance } from "fastify";
import { requireUser } from "./guard.js";
import { listActions } from "../actions/registry.js";
import { activeJobCount } from "../services/scheduler.js";

export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({
    status: "ok",
    time: new Date().toISOString(),
    activeJobs: activeJobCount(),
  }));

  app.get(
    "/api/actions",
    { preHandler: requireUser },
    async () => ({ actions: listActions() }),
  );
}
