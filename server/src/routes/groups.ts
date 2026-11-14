import type { FastifyInstance } from "fastify";
import { requireUser } from "./guard.js";
import {
  assignRolesToGroup,
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
} from "../services/groups.js";

export async function registerGroupRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/api/groups", { preHandler: requireUser }, async (request) => ({
    groups: listGroups(request.user!.id),
  }));

  app.post(
    "/api/groups",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { name?: string; color?: string }
        | undefined;
      if (!body?.name?.trim()) {
        return reply.code(400).send({ error: "请填写分组名称" });
      }
      try {
        return {
          group: createGroup(
            request.user!.id,
            body.name,
            body.color || undefined,
          ),
        };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );

  app.patch(
    "/api/groups/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as
        | { name?: string; color?: string }
        | undefined;
      try {
        updateGroup(request.user!.id, id, body ?? {});
        return {
          group: listGroups(request.user!.id).find((group) => group.id === id),
        };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );

  app.delete(
    "/api/groups/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      deleteGroup(request.user!.id, id);
      return { ok: true };
    },
  );

  app.post(
    "/api/groups/assign",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { roleIds?: unknown; groupId?: string | null }
        | undefined;
      const roleIds = Array.isArray(body?.roleIds)
        ? body.roleIds.filter(
            (item): item is string => typeof item === "string",
          )
        : [];
      if (roleIds.length === 0) {
        return reply.code(400).send({ error: "请选择角色" });
      }
      const groupId = body?.groupId ?? null;
      try {
        const updated = assignRolesToGroup(
          request.user!.id,
          roleIds,
          groupId,
        );
        return { updated };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );
}
