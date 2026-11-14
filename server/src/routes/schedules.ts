import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db, newId, nowIso } from "../db/index.js";
import { schedules } from "../db/schema.js";
import { requireUser } from "./guard.js";
import {
  getRolesByIds,
  getSchedule,
  listSchedules,
  setScheduleRoles,
} from "../services/repositories.js";
import {
  reloadSchedules,
  unregisterSchedule,
} from "../services/scheduler.js";
import { computeNextRun, validateCron } from "../core/cron.js";
import { startScheduleRun } from "../services/executor.js";
import { orderActionKeys } from "../actions/registry.js";
import { listGroups } from "../services/groups.js";

function normalizeActionKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return ["daily"];
  const keys = input.filter((item): item is string => typeof item === "string");
  return orderActionKeys(keys);
}

function normalizeRoleIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((item): item is string => typeof item === "string"))];
}

function normalizeGroupIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((item): item is string => typeof item === "string"))];
}

function validateGroupIds(ownerId: string, groupIds: string[]): string | null {
  if (groupIds.length === 0) return null;
  const known = new Set(listGroups(ownerId).map((group) => group.id));
  return groupIds.every((id) => known.has(id)) ? null : "包含不存在的分组";
}

export async function registerScheduleRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/schedules",
    { preHandler: requireUser },
    async (request) => ({
      schedules: listSchedules(request.user!.id),
    }),
  );

  app.post(
    "/api/schedules",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | {
            name?: string;
            cronExpr?: string;
            actionKeys?: unknown;
            roleIds?: unknown;
            groupIds?: unknown;
            enabled?: boolean;
          }
        | undefined;
      const name = body?.name?.trim();
      const cronExpr = body?.cronExpr?.trim();
      if (!name || !cronExpr) {
        return reply.code(400).send({ error: "请填写计划名称和 cron 表达式" });
      }
      if (!validateCron(cronExpr)) {
        return reply.code(400).send({ error: "cron 表达式无效" });
      }
      const roleIds = normalizeRoleIds(body?.roleIds);
      const groupIds = normalizeGroupIds(body?.groupIds);
      const actionKeys = normalizeActionKeys(body?.actionKeys);
      if (roleIds.length === 0 && groupIds.length === 0) {
        return reply.code(400).send({ error: "请至少选择一个角色或分组" });
      }
      const groupError = validateGroupIds(request.user!.id, groupIds);
      if (groupError) return reply.code(400).send({ error: groupError });
      const existing = getRolesByIds(request.user!.id, roleIds);
      if (existing.length !== roleIds.length) {
        return reply.code(400).send({ error: "包含不存在的角色" });
      }

      const id = newId();
      const timestamp = nowIso();
      const enabled = body?.enabled ?? true;
      db.insert(schedules)
        .values({
          id,
          ownerId: request.user!.id,
          name,
          cronExpr,
          timezone: "Asia/Shanghai",
          actionKeys: JSON.stringify(actionKeys),
          groupIds: JSON.stringify(groupIds),
          enabled,
          nextRunAt: enabled ? computeNextRun(cronExpr) : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      setScheduleRoles(id, roleIds);
      reloadSchedules(request.user!.id);
      return { schedule: getSchedule(request.user!.id, id) };
    },
  );

  app.patch(
    "/api/schedules/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schedule = getSchedule(request.user!.id, id);
      if (!schedule) return reply.code(404).send({ error: "计划不存在" });
      const body = request.body as
        | {
            name?: string;
            cronExpr?: string;
            actionKeys?: unknown;
            roleIds?: unknown;
            groupIds?: unknown;
            enabled?: boolean;
          }
        | undefined;

      const values: Record<string, unknown> = { updatedAt: nowIso() };
      if (body?.name !== undefined) values.name = body.name.trim();
      if (body?.cronExpr !== undefined) {
        if (!validateCron(body.cronExpr)) {
          return reply.code(400).send({ error: "cron 表达式无效" });
        }
        values.cronExpr = body.cronExpr.trim();
      }
      if (body?.actionKeys !== undefined) {
        values.actionKeys = JSON.stringify(
          normalizeActionKeys(body.actionKeys),
        );
      }
      if (body?.enabled !== undefined) {
        values.enabled = body.enabled;
      }
      if (body?.roleIds !== undefined || body?.groupIds !== undefined) {
        const roleIds =
          body?.roleIds !== undefined
            ? normalizeRoleIds(body.roleIds)
            : schedule.roleIds;
        const groupIds =
          body?.groupIds !== undefined
            ? normalizeGroupIds(body.groupIds)
            : schedule.groupIds;
        if (roleIds.length === 0 && groupIds.length === 0) {
          return reply
            .code(400)
            .send({ error: "请至少选择一个角色或分组" });
        }
        const groupError = validateGroupIds(request.user!.id, groupIds);
        if (groupError) return reply.code(400).send({ error: groupError });
        const existing = getRolesByIds(request.user!.id, roleIds);
        if (existing.length !== roleIds.length) {
          return reply.code(400).send({ error: "包含不存在的角色" });
        }
        setScheduleRoles(id, roleIds);
        values.groupIds = JSON.stringify(groupIds);
      }

      const nextEnabled = (values.enabled ?? schedule.enabled) as boolean;
      const nextCron = (values.cronExpr ?? schedule.cronExpr) as string;
      values.nextRunAt = nextEnabled ? computeNextRun(nextCron) : null;

      db.update(schedules)
        .set(values)
        .where(
          and(
            eq(schedules.id, id),
            eq(schedules.ownerId, request.user!.id),
          ),
        )
        .run();
      reloadSchedules(request.user!.id);
      return { schedule: getSchedule(request.user!.id, id) };
    },
  );

  app.delete(
    "/api/schedules/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schedule = getSchedule(request.user!.id, id);
      if (!schedule) return reply.code(404).send({ error: "计划不存在" });
      unregisterSchedule(id);
      db.delete(schedules)
        .where(
          and(
            eq(schedules.id, id),
            eq(schedules.ownerId, request.user!.id),
          ),
        )
        .run();
      reloadSchedules(request.user!.id);
      return { ok: true };
    },
  );

  app.post(
    "/api/schedules/:id/run",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schedule = getSchedule(request.user!.id, id);
      if (!schedule) return reply.code(404).send({ error: "计划不存在" });
      const runId = startScheduleRun(schedule, "manual");
      return { runId };
    },
  );
}
