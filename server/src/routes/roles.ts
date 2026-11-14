import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { runLogs, runResults, runs } from "../db/schema.js";
import { requireUser } from "./guard.js";
import { getRole, listRoles } from "../services/repositories.js";
import {
  createRole,
  credentialFingerprint,
  deleteRole,
  findRoleDuplicate,
  toRoleView,
  updateRole,
} from "../services/roleService.js";
import {
  arrayBufferToBase64,
  binFromBase64,
  buildRoleBin,
  deriveServerLabel,
  exchangeBin,
  exchangeCredentialFromBin,
  fetchCredentialFromUrl,
  getServerList,
  parseManualCredential,
} from "../services/credential.js";
import {
  captureRoleSnapshot,
  startRoleRun,
} from "../services/executor.js";
import { getDailyStatus } from "../services/dailyStatus.js";
import { getResourceGrowth } from "../services/resources.js";

function encodeCredentialSummary(credential: string): {
  roleId?: string | number;
  roleToken?: string;
} {
  try {
    const parsed = JSON.parse(credential) as Record<string, unknown>;
    return {
      roleId: parsed.roleId as string | number | undefined,
      roleToken: parsed.roleToken as string | undefined,
    };
  } catch {
    return {};
  }
}

/** 把 YYYY-MM-DD 解释为 Asia/Shanghai 的一天 */
function dayRange(date: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) return null;
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function registerRoleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/roles",
    { preHandler: requireUser },
    async (request) => {
      const ownerId = request.user!.id;
      const list = listRoles(ownerId);
      // 列表不带完整快照，详情由 GET /api/roles/:id 单独读取
      return {
        roles: list.map((role) => toRoleView(role, { includeSnapshot: false })),
      };
    },
  );

  // 角色详情（含完整快照）
  app.get<{ Params: { id: string } }>(
    "/api/roles/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const role = getRole(request.user!.id, request.params.id);
      if (!role) {
        return reply.code(404).send({ error: "角色不存在" });
      }
      return { role: toRoleView(role) };
    },
  );

  // 手动粘贴凭据
  app.post(
    "/api/roles/manual",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { name?: string; token?: string; server?: string }
        | undefined;
      if (!body?.token) {
        return reply.code(400).send({ error: "请填写凭据" });
      }
      try {
        const parsed = parseManualCredential(body.token);
        const summary = encodeCredentialSummary(parsed.credential);
        const duplicate = findRoleDuplicate(request.user!.id, {
          credentialHash: credentialFingerprint(parsed.credential),
          name: body.name?.trim() || null,
        });
        if (duplicate) {
          return reply
            .code(409)
            .send({ error: `角色已存在：${duplicate.name}` });
        }
        const role = createRole(request.user!.id, {
          name: body.name || "手动导入",
          server: body.server ?? null,
          gameRoleId:
            summary.roleId === undefined ? null : String(summary.roleId),
          credential: parsed.credential,
          importMethod: "manual",
        });
        return { role: role ? toRoleView(role) : null };
      } catch (error) {
        return reply
          .code(400)
          .send({ error: (error as Error).message || "凭据解析失败" });
      }
    },
  );

  // URL 导入
  app.post(
    "/api/roles/url",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { name?: string; url?: string }
        | undefined;
      if (!body?.url) {
        return reply.code(400).send({ error: "请填写来源地址" });
      }
      try {
        const fetched = await fetchCredentialFromUrl(body.url);
        const summary = encodeCredentialSummary(fetched.credential);
        const duplicate = findRoleDuplicate(request.user!.id, {
          credentialHash: credentialFingerprint(fetched.credential),
          name: body.name?.trim() || fetched.name?.trim() || null,
        });
        if (duplicate) {
          return reply
            .code(409)
            .send({ error: `角色已存在：${duplicate.name}` });
        }
        const role = createRole(request.user!.id, {
          name: body.name || fetched.name || "URL 导入",
          server: fetched.server ?? null,
          gameRoleId:
            summary.roleId === undefined ? null : String(summary.roleId),
          credential: fetched.credential,
          importMethod: "url",
          sourceUrl: body.url,
        });
        return { role: role ? toRoleView(role) : null };
      } catch (error) {
        return reply
          .code(400)
          .send({ error: (error as Error).message || "URL 导入失败" });
      }
    },
  );

  // 读取 BIN 中的角色/区服列表
  app.post(
    "/api/roles/bin/servers",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as { binBase64?: string } | undefined;
      if (!body?.binBase64) {
        return reply.code(400).send({ error: "请上传 BIN 文件" });
      }
      try {
        const servers = await getServerList(
          binFromBase64(body.binBase64),
        );
        return { servers };
      } catch (error) {
        return reply
          .code(400)
          .send({ error: (error as Error).message || "BIN 解析失败" });
      }
    },
  );

  // BIN 导入
  app.post(
    "/api/roles/bin",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | {
            name?: string;
            binBase64?: string;
            binName?: string;
            serverId?: string | number;
            roleId?: string | number;
          }
        | undefined;
      if (!body?.binBase64 || body.serverId === undefined) {
        return reply.code(400).send({ error: "请上传 BIN 并选择区服" });
      }
      try {
        const bin = binFromBase64(body.binBase64);
        const { credential, payload } = await exchangeBin(bin, body.serverId);
        // 保存按所选区服重建后的 BIN，后续可随时用同一份 BIN 重新兑换凭据
        const storedBin = arrayBufferToBase64(
          buildRoleBin(payload, body.serverId),
        );
        const serverName =
          typeof payload.serverName === "string" && payload.serverName
            ? payload.serverName
            : deriveServerLabel(body.serverId);
        const effectiveName =
          body.name ||
          (typeof payload.name === "string" ? payload.name : "BIN 导入");
        const gameRoleId =
          body.roleId === undefined ? null : String(body.roleId);

        // 同一角色重复导入：更新凭据与 BIN，不再新建第二条记录
        const duplicate = findRoleDuplicate(request.user!.id, {
          gameRoleId,
          server: serverName,
          name: effectiveName,
        });
        if (duplicate) {
          updateRole(request.user!.id, duplicate.id, {
            credential,
            binBase64: storedBin,
            serverId: body.serverId,
            server: serverName,
            gameRoleId,
            credentialStatus: "valid",
            credentialError: null,
          });
          const updated = getRole(request.user!.id, duplicate.id);
          return {
            role: updated ? toRoleView(updated) : null,
            updated: true,
          };
        }

        const role = createRole(request.user!.id, {
          name: effectiveName,
          server: serverName,
          serverId: body.serverId,
          gameRoleId,
          credential,
          importMethod: "bin",
          binBase64: storedBin,
          binName: body.binName ?? null,
        });
        return { role: role ? toRoleView(role) : null, updated: false };
      } catch (error) {
        return reply
          .code(400)
          .send({ error: (error as Error).message || "BIN 导入失败" });
      }
    },
  );

  // 更新角色
  app.patch(
    "/api/roles/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as
        | { name?: string; server?: string; enabled?: boolean; groupId?: string | null }
        | undefined;
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      updateRole(request.user!.id, id, {
        name: body?.name,
        server:
          body?.server === undefined ? undefined : body.server || null,
        enabled: body?.enabled,
        groupId: body?.groupId,
      });
      const updated = getRole(request.user!.id, id);
      return { role: updated ? toRoleView(updated) : null };
    },
  );

  app.delete(
    "/api/roles/:id",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      deleteRole(request.user!.id, id);
      return { ok: true };
    },
  );

  // 从来源 URL 重新拉取凭据
  app.post(
    "/api/roles/:id/refresh",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      if (!role.sourceUrl && !role.binBase64) {
        return reply
          .code(400)
          .send({ error: "该角色没有 BIN 或来源地址，无法刷新凭据" });
      }
      try {
        // BIN 原件优先：它包含区服信息，兑换结果确定
        if (role.binBase64) {
          const { credential } = await exchangeCredentialFromBin(
            role.binBase64,
            role.serverId,
          );
          updateRole(request.user!.id, id, {
            credential,
            credentialStatus: "valid",
            credentialError: null,
            ...(role.credentialStatus === "invalid"
              ? { enabled: true }
              : {}),
          });
        } else if (role.sourceUrl) {
          const fetched = await fetchCredentialFromUrl(role.sourceUrl);
          updateRole(request.user!.id, id, {
            credential: fetched.credential,
            credentialStatus: "valid",
            credentialError: null,
          });
        }
        const updated = getRole(request.user!.id, id);
        return { role: updated ? toRoleView(updated) : null };
      } catch (error) {
        return reply
          .code(400)
          .send({ error: (error as Error).message || "刷新失败" });
      }
    },
  );

  // 手动刷新快照
  app.post(
    "/api/roles/:id/snapshot",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      try {
        const snapshot = await captureRoleSnapshot(role);
        const updated = getRole(request.user!.id, id);
        return {
          snapshot: (snapshot as { role?: unknown })?.role ?? snapshot,
          role: updated ? toRoleView(updated) : null,
        };
      } catch (error) {
        return reply
          .code(502)
          .send({ error: (error as Error).message || "快照刷新失败" });
      }
    },
  );

  // 手动执行角色
  app.post(
    "/api/roles/:id/run",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      const body = request.body as { actionKeys?: string[] } | undefined;
      const actionKeys =
        Array.isArray(body?.actionKeys) && body.actionKeys.length > 0
          ? body.actionKeys
          : ["daily"];
      const runId = startRoleRun(request.user!.id, id, actionKeys);
      return { runId };
    },
  );

  // 每个动作最近一次执行结果（角色功能页展示用）
  app.get(
    "/api/roles/:id/action-status",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      const rows = db
        .select({
          actionKey: runResults.actionKey,
          status: runResults.status,
          message: runResults.message,
          errorCode: runResults.errorCode,
          createdAt: runResults.createdAt,
        })
        .from(runResults)
        .where(eq(runResults.roleId, id))
        .orderBy(desc(runResults.createdAt))
        .all();
      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (!latest.has(row.actionKey)) latest.set(row.actionKey, row);
      }
      return { statuses: [...latest.values()] };
    },
  );

  // 角色最近一次的官方日常任务进度
  app.get(
    "/api/roles/:id/daily-status",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      return { dailyStatus: getDailyStatus(id) };
    },
  );

  // 某天的角色执行日志（按运行分组）
  app.get(
    "/api/roles/:id/logs",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      const query = request.query as { date?: string };
      const date =
        query.date ??
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
      const range = dayRange(date);
      if (!range) return reply.code(400).send({ error: "日期格式应为 YYYY-MM-DD" });

      const rows = db
        .select({
          id: runLogs.id,
          runId: runLogs.runId,
          level: runLogs.level,
          message: runLogs.message,
          actionKey: runLogs.actionKey,
          createdAt: runLogs.createdAt,
          runStatus: runs.status,
          runTrigger: runs.trigger,
          runStartedAt: runs.startedAt,
        })
        .from(runLogs)
        .innerJoin(runs, eq(runs.id, runLogs.runId))
        .where(
          and(
            eq(runLogs.roleId, id),
            eq(runs.ownerId, request.user!.id),
            gte(runLogs.createdAt, range.start),
            lt(runLogs.createdAt, range.end),
          ),
        )
        .orderBy(runLogs.createdAt)
        .all();

      const groups = new Map<
        string,
        {
          runId: string;
          status: string;
          trigger: string;
          startedAt: string;
          logs: Array<{
            id: string;
            level: string;
            message: string;
            actionKey: string | null;
            createdAt: string;
          }>;
        }
      >();
      for (const row of rows) {
        let group = groups.get(row.runId);
        if (!group) {
          group = {
            runId: row.runId,
            status: row.runStatus,
            trigger: row.runTrigger,
            startedAt: row.runStartedAt,
            logs: [],
          };
          groups.set(row.runId, group);
        }
        group.logs.push({
          id: row.id,
          level: row.level,
          message: row.message,
          actionKey: row.actionKey,
          createdAt: row.createdAt,
        });
      }
      return { date, groups: [...groups.values()] };
    },
  );

  // 最近 N 天的资源净增长
  app.get(
    "/api/roles/:id/resource-growth",
    { preHandler: requireUser },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const role = getRole(request.user!.id, id);
      if (!role) return reply.code(404).send({ error: "角色不存在" });
      const query = request.query as { days?: string };
      const days = Math.min(
        Math.max(Number.parseInt(query.days || "7", 10) || 7, 1),
        30,
      );
      return { growth: getResourceGrowth(id, days) };
    },
  );

  // 导入旧项目的备份文件
  app.post(
    "/api/roles/import-backup",
    { preHandler: requireUser },
    async (request, reply) => {
      const body = request.body as
        | { backup?: unknown }
        | undefined;
      let backup = body?.backup;
      if (typeof backup === "string") {
        try {
          backup = JSON.parse(backup);
        } catch {
          return reply.code(400).send({ error: "备份文件不是合法 JSON" });
        }
      }
      if (!backup || typeof backup !== "object") {
        return reply.code(400).send({ error: "缺少备份内容" });
      }

      const data = backup as {
        tokens?: unknown;
        localStorage?: Record<string, string>;
      };
      let sourceTokens: unknown = data.tokens;
      if (!Array.isArray(sourceTokens)) {
        const raw = data.localStorage?.gameTokens;
        if (typeof raw === "string") {
          try {
            sourceTokens = JSON.parse(raw);
          } catch {
            sourceTokens = undefined;
          }
        }
      }
      if (!Array.isArray(sourceTokens)) {
        return reply
          .code(400)
          .send({ error: "备份中没有找到 token 列表" });
      }

      // 旧备份的 IndexedDB 里保存着每个角色的 BIN 原件，按 id 建立索引
      const indexedDB = (backup as { indexedDB?: Record<string, unknown> })
        .indexedDB;
      const xyzwDb = indexedDB?.xyzw as
        | { tokens?: unknown }
        | undefined;
      const binRecords = Array.isArray(xyzwDb?.tokens) ? xyzwDb.tokens : [];
      const binById = new Map<string, string>();
      for (const record of binRecords) {
        if (!record || typeof record !== "object") continue;
        const rec = record as Record<string, unknown>;
        const data = (rec.data ?? rec.value) as
          | Record<string, unknown>
          | undefined;
        if (
          data &&
          data.__xyzwType === "ArrayBuffer" &&
          typeof data.b64 === "string"
        ) {
          if (typeof rec.id === "string") binById.set(rec.id, data.b64);
        }
      }

      // 旧备份里如果所有 token 共用同一个 roleId，说明那是账号 uid，不能作为角色 ID
      const roleIdCounts = new Map<string, number>();
      for (const item of sourceTokens) {
        if (!item || typeof item !== "object") continue;
        const rawRoleId = (item as Record<string, unknown>).roleId;
        if (rawRoleId === undefined || rawRoleId === null) continue;
        const key = String(rawRoleId);
        roleIdCounts.set(key, (roleIdCounts.get(key) ?? 0) + 1);
      }
      const uniqueRoleIds = new Set(
        [...roleIdCounts.entries()]
          .filter(([, count]) => count === 1)
          .map(([id]) => id),
      );

      let imported = 0;
      let updated = 0;
      const failed: Array<{ name: string; error: string }> = [];
      for (const item of sourceTokens) {
        if (!item || typeof item !== "object") continue;
        const token = item as Record<string, unknown>;
        const rawToken = token.token;
        if (typeof rawToken !== "string" || !rawToken) {
          failed.push({
            name: String(token.name ?? "未命名"),
            error: "缺少 token 字段",
          });
          continue;
        }
        const name =
          typeof token.name === "string" && token.name
            ? token.name
            : "备份导入";
        const binBase64 =
          typeof token.id === "string" ? binById.get(token.id) : undefined;
        const gameRoleId =
          token.roleId === undefined || token.roleId === null
            ? null
            : uniqueRoleIds.has(String(token.roleId))
              ? String(token.roleId)
              : null;
        const serverId =
          token.serverId === undefined || token.serverId === null
            ? undefined
            : (token.serverId as string | number);
        try {
          const parsed = parseManualCredential(rawToken);
          const duplicate = findRoleDuplicate(request.user!.id, {
            gameRoleId,
            server:
              typeof token.server === "string" ? token.server : null,
            credentialHash: credentialFingerprint(parsed.credential),
            name,
          });
          if (duplicate) {
            // 已存在：补上 BIN / 区服 / 真实角色 ID，不覆盖现有凭据
            updateRole(request.user!.id, duplicate.id, {
              ...(binBase64 && !duplicate.binBase64
                ? { binBase64 }
                : {}),
              ...(serverId !== undefined ? { serverId } : {}),
              ...(gameRoleId ? { gameRoleId } : {}),
            });
            updated++;
            continue;
          }
          createRole(request.user!.id, {
            name,
            server: typeof token.server === "string" ? token.server : null,
            serverId,
            gameRoleId,
            credential: parsed.credential,
            importMethod:
              typeof token.importMethod === "string"
                ? token.importMethod
                : "manual",
            sourceUrl:
              typeof token.sourceUrl === "string" ? token.sourceUrl : null,
            binBase64: binBase64 ?? null,
          });
          imported++;
        } catch (error) {
          failed.push({
            name,
            error: (error as Error).message,
          });
        }
      }

      return { imported, updated, failed };
    },
  );
}
