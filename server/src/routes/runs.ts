import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { runLogs, runResults, runs, schedules } from "../db/schema.js";
import { requireUser } from "./guard.js";
import { subscribeRun } from "../core/events.js";

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/runs",
    { preHandler: requireUser },
    async (request) => {
      const query = request.query as {
        limit?: string;
        scheduleId?: string;
      };
      const limit = Math.min(
        Math.max(Number.parseInt(query.limit || "50", 10) || 50, 1),
        200,
      );
      const conditions = [eq(runs.ownerId, request.user!.id)];
      if (query.scheduleId) {
        conditions.push(eq(runs.scheduleId, query.scheduleId));
      }
      const rows = db
        .select()
        .from(runs)
        .where(and(...conditions))
        .orderBy(desc(runs.startedAt))
        .limit(limit)
        .all();
      const scheduleRows = db.select().from(schedules).all();
      const scheduleNames = new Map(
        scheduleRows.map((row) => [row.id, row.name] as const),
      );
      return {
        runs: rows.map((row) => ({
          ...row,
          scheduleName: row.scheduleId
            ? (scheduleNames.get(row.scheduleId) ?? null)
            : null,
        })),
      };
    },
  );

  app.get(
    "/api/runs/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const run = db
        .select()
        .from(runs)
        .where(and(eq(runs.id, id), eq(runs.ownerId, request.user!.id)))
        .get();
      if (!run) return reply.code(404).send({ error: "运行记录不存在" });
      const results = db
        .select()
        .from(runResults)
        .where(eq(runResults.runId, id))
        .orderBy(runResults.roleName, runResults.createdAt)
        .all();
      const logs = db
        .select()
        .from(runLogs)
        .where(eq(runLogs.runId, id))
        .orderBy(runLogs.createdAt)
        .all();
      return { run, results, logs };
    },
  );

  app.get(
    "/api/runs/:id/logs",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const run = db
        .select()
        .from(runs)
        .where(and(eq(runs.id, id), eq(runs.ownerId, request.user!.id)))
        .get();
      if (!run) return reply.code(404).send({ error: "运行记录不存在" });
      return {
        logs: db
          .select()
          .from(runLogs)
          .where(eq(runLogs.runId, id))
          .orderBy(runLogs.createdAt)
          .all(),
      };
    },
  );

  app.get(
    "/api/runs/:id/results",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const run = db
        .select()
        .from(runs)
        .where(and(eq(runs.id, id), eq(runs.ownerId, request.user!.id)))
        .get();
      if (!run) return reply.code(404).send({ error: "运行记录不存在" });
      return {
        results: db
          .select()
          .from(runResults)
          .where(eq(runResults.runId, id))
          .all(),
      };
    },
  );

  // SSE：实时推送运行日志与状态
  app.get(
    "/api/runs/:id/stream",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const run = db
        .select()
        .from(runs)
        .where(and(eq(runs.id, id), eq(runs.ownerId, request.user!.id)))
        .get();
      if (!run) return reply.code(404).send({ error: "运行记录不存在" });

      reply.hijack();
      const response = reply.raw;
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      response.write(
        `event: snapshot\ndata: ${JSON.stringify({
          run: {
            id: run.id,
            status: run.status,
            successCount: run.successCount,
            failedCount: run.failedCount,
            skippedCount: run.skippedCount,
          },
          results: db
            .select()
            .from(runResults)
            .where(eq(runResults.runId, id))
            .all(),
        })}\n\n`,
      );

      const unsubscribe = subscribeRun(id, (event) => {
        response.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
        );
      });

      const heartbeat = setInterval(() => {
        response.write(": ping\n\n");
      }, 25_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.raw.on("close", cleanup);
      request.raw.on("error", cleanup);
    },
  );
}
