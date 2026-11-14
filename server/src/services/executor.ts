import { and, eq, inArray } from "drizzle-orm";
import { db, newId, nowIso } from "../db/index.js";
import {
  commandLogs,
  roles,
  runResults,
  runs,
  schedules,
} from "../db/schema.js";
import { GameClient, GameError } from "../protocol/gameClient.js";
import { ACTIONS, orderActionKeys } from "../actions/registry.js";
import type { ActionContext } from "../actions/types.js";
import { emitRunLog, emitRunStatus } from "../core/events.js";
import { log } from "../core/logger.js";
import { RoleLock, Semaphore } from "../core/concurrency.js";
import {
  exchangeCredentialFromBin,
  fetchCredentialFromUrl,
} from "./credential.js";
import {
  extractResourceBag,
  saveResourceSnapshot,
} from "./resources.js";
import { formatGainText } from "./resourceLabels.js";
import { encryptCredential } from "../crypto/credentialCipher.js";
import { getRole, getRolesByIds } from "./repositories.js";
import { getSettings, type AppSettings } from "./settings.js";
import type {
  ActionResult,
  RoleRecord,
  RunStatus,
  RunTrigger,
  ScheduleRecord,
} from "../types.js";

const ROLE_TOTAL_TIMEOUT_MS = 5 * 60 * 1000;

const semaphore = new Semaphore(3);
const roleLock = new RoleLock();
const activeScheduleRuns = new Set<string>();

let lastConnectAt = 0;

interface CreateRunOptions {
  ownerId: string;
  scheduleId?: string | null;
  trigger: RunTrigger;
  status?: RunStatus;
}

function createRun(options: CreateRunOptions): string {
  const id = newId();
  db.insert(runs)
    .values({
      id,
      ownerId: options.ownerId,
      scheduleId: options.scheduleId ?? null,
      trigger: options.trigger,
      status: options.status ?? "running",
      startedAt: nowIso(),
      finishedAt: options.status ? nowIso() : null,
    })
    .run();
  emitRunStatus({
    runId: id,
    status: options.status ?? "running",
  });
  return id;
}

function writeResult(
  runId: string,
  role: RoleRecord,
  actionKey: string,
  result: ActionResult,
  durationMs: number,
  gainJson?: string | null,
): void {
  db.insert(runResults)
    .values({
      id: newId(),
      runId,
      roleId: role.id,
      roleName: role.name,
      actionKey,
      status: result.status,
      errorCode:
        result.errorCode === undefined ? null : String(result.errorCode),
      message: result.message ?? null,
      gainJson: gainJson ?? null,
      durationMs,
      createdAt: nowIso(),
    })
    .run();
}

/** 奖励条目：type 1 金币、2 钻石、3 物品 */
interface RawReward {
  type?: number;
  itemId?: number;
  value?: number;
}

function collectRewards(response: unknown, rewards: RawReward[]): void {
  const list = (response as { reward?: unknown } | undefined)?.reward;
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    rewards.push(entry as RawReward);
  }
}

/** 把奖励条目归一为 { gold / diamond / item:<id> : 数量 } */
function normalizeRewards(rewards: RawReward[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const reward of rewards) {
    let key: string | null = null;
    if (reward.type === 1) key = "gold";
    else if (reward.type === 2) key = "diamond";
    else if (reward.type === 3) key = `item:${reward.itemId ?? 0}`;
    if (!key) continue;
    result[key] = (result[key] ?? 0) + (Number(reward.value) || 0);
  }
  return result;
}

function updateRunCounts(runId: string): {
  successCount: number;
  failedCount: number;
  skippedCount: number;
} {
  const rows = db
    .select({ status: runResults.status })
    .from(runResults)
    .where(eq(runResults.runId, runId))
    .all();
  const counts = { successCount: 0, failedCount: 0, skippedCount: 0 };
  for (const row of rows) {
    // 已完成（服务器提示“今天已签到/已领取”）按成功计入运行汇总
    if (row.status === "success" || row.status === "completed") {
      counts.successCount++;
    } else if (row.status === "failed") counts.failedCount++;
    else counts.skippedCount++;
  }
  return counts;
}

function finishRun(
  runId: string,
  error?: string,
): void {
  const counts = updateRunCounts(runId);
  const status: RunStatus =
    counts.successCount === 0 &&
    counts.failedCount === 0 &&
    counts.skippedCount > 0
      ? "skipped"
      : error && counts.successCount === 0 && counts.skippedCount === 0
        ? "failed"
        : counts.failedCount > 0
          ? counts.successCount > 0
            ? "partial"
            : "failed"
          : "success";
  db.update(runs)
    .set({
      status,
      finishedAt: nowIso(),
      successCount: counts.successCount,
      failedCount: counts.failedCount,
      skippedCount: counts.skippedCount,
      error: error ?? null,
    })
    .where(eq(runs.id, runId))
    .run();
  emitRunStatus({ runId, status, ...counts });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (error instanceof GameError) {
    if (error.kind === "retry") return true;
    if (/请求超时/.test(error.message)) return true;
  }
  const message = (error as Error)?.message ?? "";
  return /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|socket hang up|网络/i.test(
    message,
  );
}

function isCredentialFailure(error: unknown): boolean {
  if (error instanceof GameError) {
    if (error.code === 200760) return true;
    if (/连接在建立前已关闭/.test(error.message)) return true;
  }
  // 刚连上就被服务器关闭，通常意味着凭据不被接受
  return /WebSocket 连接已关闭|连接已关闭/.test(
    (error as Error)?.message ?? "",
  );
}

function markCredentialInvalid(role: RoleRecord, message: string): void {
  db.update(roles)
    .set({
      credentialStatus: "invalid",
      credentialError: message,
      enabled: false,
      updatedAt: nowIso(),
    })
    .where(eq(roles.id, role.id))
    .run();
  log.warn(`角色 ${role.name} 凭据失效：${message}`);
}

async function maybeRefreshCredential(
  role: RoleRecord,
  settings: AppSettings,
): Promise<RoleRecord> {
  if (!role.sourceUrl) return role;
  const tolerance = settings.credentialRefreshHours * 60 * 60 * 1000;
  const updatedAt = role.credentialUpdatedAt
    ? new Date(role.credentialUpdatedAt).getTime()
    : 0;
  if (Date.now() - updatedAt < tolerance) return role;

  try {
    const fetched = await fetchCredentialFromUrl(role.sourceUrl);
    const encrypted = encryptCredential(fetched.credential);
    db.update(roles)
      .set({
        credentialEnc: encrypted.enc,
        credentialIv: encrypted.iv,
        credentialTag: encrypted.tag,
        credentialUpdatedAt: nowIso(),
        credentialStatus: "valid",
        credentialError: null,
        // 曾因凭据失效被自动停用的角色，刷新成功后恢复启用
        ...(role.credentialStatus === "invalid" ? { enabled: true } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(roles.id, role.id))
      .run();
    log.info(`角色 ${role.name} 凭据已从来源地址刷新`);
    return (
      getRole(role.ownerId, role.id) ?? {
        ...role,
        credential: fetched.credential,
        credentialStatus: "valid",
      }
    );
  } catch (error) {
    log.warn(
      `角色 ${role.name} 凭据刷新失败，继续使用旧凭据：${(error as Error).message}`,
    );
    return role;
  }
}

/**
 * 用保存的 BIN 原件重新兑换凭据。
 * BIN 是长期有效的登录材料，备份导入的 roleToken 很容易过期，
 * 因此只要角色还保存着 BIN，就优先用它换一份新鲜凭据。
 */
async function refreshCredentialFromBin(
  role: RoleRecord,
): Promise<RoleRecord | null> {
  if (!role.binBase64) return null;
  try {
    const { credential } = await exchangeCredentialFromBin(
      role.binBase64,
      role.serverId,
    );
    const encrypted = encryptCredential(credential);
    db.update(roles)
      .set({
        credentialEnc: encrypted.enc,
        credentialIv: encrypted.iv,
        credentialTag: encrypted.tag,
        credentialUpdatedAt: nowIso(),
        credentialStatus: "valid",
        credentialError: null,
        // 曾因凭据失效被自动停用的角色，刷新成功后恢复启用
        ...(role.credentialStatus === "invalid" ? { enabled: true } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(roles.id, role.id))
      .run();
    log.info(`角色 ${role.name} 已用 BIN 刷新凭据`);
    return getRole(role.ownerId, role.id) ?? {
      ...role,
      credential,
      credentialStatus: "valid",
    };
  } catch (error) {
    log.warn(
      `角色 ${role.name} 使用 BIN 刷新凭据失败：${(error as Error).message}`,
    );
    return null;
  }
}

async function waitForConnectSlot(delayMs: number): Promise<void> {
  const wait = lastConnectAt + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastConnectAt = Date.now();
}

interface RoleIdentity {
  name?: string;
  /** 真正的游戏角色 ID；如果服务器返回的是账号 uid，则为 undefined */
  roleId?: string;
  serverName?: string;
}

/** 从 role_getroleinfo 响应中提取角色身份 */
function extractIdentity(roleInfo: unknown): RoleIdentity {
  const role =
    (roleInfo as { role?: Record<string, unknown> } | undefined)?.role ??
    (roleInfo as Record<string, unknown> | undefined) ??
    {};
  const uid = role.uid === undefined ? undefined : String(role.uid);
  const rawRoleId =
    role.roleId === undefined ? undefined : String(role.roleId);
  return {
    name:
      typeof role.name === "string" && role.name ? role.name : undefined,
    // roleId 与 uid 相同说明是账号 ID，不能当角色 ID
    roleId: rawRoleId && rawRoleId !== uid ? rawRoleId : undefined,
    serverName:
      typeof role.serverName === "string" && role.serverName
        ? role.serverName
        : undefined,
  };
}

/**
 * 以服务器返回为准更新角色名与身份（区服 + 角色 ID）。
 * 如果该角色 ID 已属于另一条角色记录，说明凭据绑定错了账号，直接中止。
 */
function applyRoleIdentity(
  role: RoleRecord,
  roleInfo: unknown,
): RoleRecord {
  const identity = extractIdentity(roleInfo);
  const nextName = identity.name ?? role.name;
  const nextServer = identity.serverName ?? role.server;

  if (identity.roleId) {
    const conflicts = db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.ownerId, role.ownerId),
          eq(roles.gameRoleId, identity.roleId),
        ),
      )
      .all()
      .filter((row) => row.id !== role.id);
    if (conflicts.length > 0) {
      const other = conflicts[0];
      throw new Error(
        `凭据绑定错误：实际登录的是「${identity.name ?? other.name}」（${identity.serverName ?? other.server ?? "未知区服"} / ${identity.roleId}），` +
          `与角色记录「${role.name}」冲突，已中止执行。请重新导入正确的 BIN。`,
      );
    }
  }

  db.update(roles)
    .set({
      name: nextName,
      server: nextServer,
      ...(identity.roleId ? { gameRoleId: identity.roleId } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(roles.id, role.id))
    .run();

  log.info(
    `角色身份已按服务器更新：${nextName} / ${nextServer ?? "未知区服"} / ${identity.roleId ?? role.gameRoleId ?? "未知 ID"}`,
  );
  return {
    ...role,
    name: nextName,
    server: nextServer,
    gameRoleId: identity.roleId ?? role.gameRoleId,
  };
}

function saveSnapshot(role: RoleRecord, roleInfo: unknown): void {
  const payload =
    (roleInfo as { role?: unknown } | undefined)?.role ?? roleInfo;
  if (!payload) return;
  db.update(roles)
    .set({
      lastSnapshotJson: JSON.stringify(payload),
      lastSnapshotAt: nowIso(),
    })
    .where(eq(roles.id, role.id))
    .run();
}

async function sendWithRetry(
  client: GameClient,
  cmd: string,
  params: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await client.sendWithPromise(cmd, params, timeoutMs);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await sleep(800);
    return client.sendWithPromise(cmd, params, timeoutMs);
  }
}

async function runAction(
  runId: string,
  role: RoleRecord,
  actionKey: string,
  client: GameClient,
  settings: AppSettings,
): Promise<ActionResult> {
  const definition = ACTIONS[actionKey];
  if (!definition) {
    return { status: "failed", message: `未知动作 ${actionKey}` };
  }
  const rewards: RawReward[] = [];
  const ctx: ActionContext = {
    role,
    client,
    settings,
    commandDelay: settings.commandDelayMs,
    taskDelay: settings.taskDelayMs,
    send: async (cmd, params = {}, timeoutMs = 8000) => {
      const response = await sendWithRetry(client, cmd, params, timeoutMs);
      collectRewards(response, rewards);
      return response;
    },
    sleep,
    log: (message, level = "info") => {
      emitRunLog({
        runId,
        roleId: role.id,
        roleName: role.name,
        actionKey,
        level,
        message,
        at: nowIso(),
      });
    },
  };

  const startedAt = Date.now();
  try {
    const result = await definition.run(ctx);
    const gain = normalizeRewards(rewards);
    writeResult(
      runId,
      role,
      actionKey,
      result,
      Date.now() - startedAt,
      Object.keys(gain).length > 0 ? JSON.stringify(gain) : null,
    );
    emitRunLog({
      runId,
      roleId: role.id,
      roleName: role.name,
      actionKey,
      level: result.status === "failed" ? "error" : "success",
      message: result.message ?? definition.name,
      at: nowIso(),
    });
    if (Object.keys(gain).length > 0) {
      emitRunLog({
        runId,
        roleId: role.id,
        roleName: role.name,
        actionKey,
        level: "success",
        message: `获得资源：${formatGainText(gain)}`,
        at: nowIso(),
      });
    }
    return result;
  } catch (error) {
    const gameError =
      error instanceof GameError
        ? error
        : new GameError((error as Error)?.message ?? "未知错误");
    const result: ActionResult =
      gameError.kind === "skip"
        ? {
            status: "completed",
            message: `已完成：${gameError.message}`,
            errorCode: gameError.code,
          }
        : gameError.kind === "unavailable"
          ? {
              status: "skipped",
              message: `暂不可用，已跳过：${gameError.message}`,
              errorCode: gameError.code,
            }
          : {
              status: "failed",
              message: gameError.message,
              errorCode: gameError.code,
            };
    const gain = normalizeRewards(rewards);
    writeResult(
      runId,
      role,
      actionKey,
      result,
      Date.now() - startedAt,
      Object.keys(gain).length > 0 ? JSON.stringify(gain) : null,
    );
    emitRunLog({
      runId,
      roleId: role.id,
      roleName: role.name,
      actionKey,
      level: result.status === "failed" ? "error" : "success",
      message: result.message ?? "执行失败",
      at: nowIso(),
    });
    if (Object.keys(gain).length > 0) {
      emitRunLog({
        runId,
        roleId: role.id,
        roleName: role.name,
        actionKey,
        level: "success",
        message: `获得资源：${formatGainText(gain)}`,
        at: nowIso(),
      });
    }
    return result;
  }
}

async function runRole(
  runId: string,
  role: RoleRecord,
  actionKeys: string[],
  settings: AppSettings,
  refreshCredential: boolean,
): Promise<void> {
  // 长时间动作（如推关）通过 timeoutMs 申请额外时长
  const roleTimeoutMs =
    ROLE_TOTAL_TIMEOUT_MS +
    actionKeys.reduce(
      (total, key) => total + (ACTIONS[key]?.timeoutMs ?? 0),
      0,
    );
  const releaseLock = await roleLock.acquire(role.id);
  const releaseSlot = await semaphore.acquire();
  try {
    let currentRole = refreshCredential
      ? await maybeRefreshCredential(role, settings)
      : role;

    if (!currentRole.enabled) {
      for (const actionKey of actionKeys) {
        writeResult(
          runId,
          currentRole,
          actionKey,
          { status: "skipped", message: "角色已停用" },
          0,
        );
      }
      emitRunLog({
        runId,
        roleId: currentRole.id,
        roleName: currentRole.name,
        level: "warning",
        message: "角色已停用，跳过",
        at: nowIso(),
      });
      return;
    }

    // 有 BIN 原件时先换一份新凭据，避免使用过期 roleToken
    if (currentRole.binBase64) {
      const refreshed = await refreshCredentialFromBin(currentRole);
      if (refreshed) currentRole = refreshed;
    }

    await waitForConnectSlot(settings.connectionDelayMs);
    const client = new GameClient(currentRole.credential, {
      name: currentRole.name,
      onCommand: (entry) => {
        // 命令级明细只保留 30 天，且不记录报文内容
        db.insert(commandLogs)
          .values({
            id: newId(),
            runId,
            roleId: currentRole.id,
            cmd: entry.cmd,
            status: entry.status,
            errorCode:
              entry.code === undefined ? null : String(entry.code),
            message: entry.message ?? null,
            createdAt: nowIso(),
          })
          .run();
      },
    });
    let timedOut = false;
    let roleInfoSucceeded = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      client.disconnect();
    }, roleTimeoutMs);

    try {
      emitRunLog({
        runId,
        roleId: currentRole.id,
        roleName: currentRole.name,
        level: "info",
        message: "连接游戏服务器",
        at: nowIso(),
      });
      await client.connect(15_000);

      emitRunLog({
        runId,
        roleId: currentRole.id,
        roleName: currentRole.name,
        level: "info",
        message: "读取角色信息",
        at: nowIso(),
      });
      const roleInfo = await sendWithRetry(
        client,
        "role_getroleinfo",
        {
          clientVersion: settings.clientVersion,
          platform: settings.platform,
        },
        15_000,
      );
      // 名称与身份以服务器返回为准；若角色 ID 已被别的记录占用则中止
      currentRole = applyRoleIdentity(currentRole, roleInfo);
      saveSnapshot(currentRole, roleInfo);
      saveResourceSnapshot(
        currentRole.id,
        "run-start",
        extractResourceBag(roleInfo),
        runId,
      );
      roleInfoSucceeded = true;
      await client.refreshBattleVersion();

      for (const actionKey of actionKeys) {
        if (timedOut || !client.isConnected) {
          writeResult(
            runId,
            currentRole,
            actionKey,
            {
              status: "failed",
              message: timedOut
                ? `角色执行超过 ${Math.round(roleTimeoutMs / 60_000)} 分钟，已中断`
                : "连接已断开，剩余动作未执行",
            },
            0,
          );
          continue;
        }
        await runAction(runId, currentRole, actionKey, client, settings);
        await sleep(settings.taskDelayMs);
      }

      // 运行结束后再读一次角色信息，作为本次运行的资源收盘快照
      if (!timedOut && client.isConnected) {
        try {
          const finalInfo = await sendWithRetry(
            client,
            "role_getroleinfo",
            {
              clientVersion: settings.clientVersion,
              platform: settings.platform,
            },
            15_000,
          );
          saveSnapshot(currentRole, finalInfo);
          saveResourceSnapshot(
            currentRole.id,
            "run-end",
            extractResourceBag(finalInfo),
            runId,
          );
        } catch (error) {
          log.warn(
            `角色 ${currentRole.name} 结束快照失败：${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      // 只有"角色信息尚未读取成功"时的连接类失败才判定凭据失效，
      // 避免把运行中途的网络抖动误判成账号问题。
      if (!roleInfoSucceeded && isCredentialFailure(error)) {
        markCredentialInvalid(
          currentRole,
          (error as Error)?.message ?? "凭据失效",
        );
      }
      emitRunLog({
        runId,
        roleId: currentRole.id,
        roleName: currentRole.name,
        level: "error",
        message: `角色执行中断：${(error as Error)?.message ?? "未知错误"}`,
        at: nowIso(),
      });
      // 未执行的动作统一记为失败，保证运行结果完整
      const executed = db
        .select({ actionKey: runResults.actionKey })
        .from(runResults)
        .where(
          and(
            eq(runResults.runId, runId),
            eq(runResults.roleId, currentRole.id),
          ),
        )
        .all()
        .map((row) => row.actionKey);
      for (const actionKey of actionKeys) {
        if (executed.includes(actionKey)) continue;
        writeResult(
          runId,
          currentRole,
          actionKey,
          {
            status: "failed",
            message: `未执行：${(error as Error)?.message ?? "连接异常"}`,
          },
          0,
        );
      }
    } finally {
      clearTimeout(deadline);
      client.disconnect();
    }
  } finally {
    releaseSlot();
    releaseLock();
  }
}

export interface ExecuteOptions {
  ownerId: string;
  roleIds: string[];
  actionKeys: string[];
  scheduleId?: string | null;
  trigger: RunTrigger;
  runId?: string;
}

/**
 * 执行一次运行：创建运行记录，按角色并发执行，结束后汇总。
 * 同一计划的重叠由调用方判断；角色级互斥在这里保证。
 */
export async function executeRun(options: ExecuteOptions): Promise<string> {
  const settings = getSettings();
  semaphore.setMax(settings.maxConcurrentRoles);
  const actionKeys = orderActionKeys(options.actionKeys);
  const runId =
    options.runId ??
    createRun({
      ownerId: options.ownerId,
      scheduleId: options.scheduleId,
      trigger: options.trigger,
    });

  const roleList = getRolesByIds(options.ownerId, options.roleIds);
  if (roleList.length === 0) {
    finishRun(runId, "没有可执行的角色");
    return runId;
  }

  emitRunLog({
    runId,
    level: "info",
    message: `开始执行：${roleList.length} 个角色，动作 ${actionKeys.join(", ")}`,
    at: nowIso(),
  });

  try {
    await Promise.all(
      roleList.map((role) =>
        runRole(
          runId,
          role,
          actionKeys,
          settings,
          options.trigger === "scheduled",
        ).catch((error) => {
          log.error(`角色 ${role.name} 执行异常`, error);
          emitRunLog({
            runId,
            roleId: role.id,
            roleName: role.name,
            level: "error",
            message: `执行异常：${(error as Error)?.message ?? "未知错误"}`,
            at: nowIso(),
          });
        }),
      ),
    );
    finishRun(runId);
  } catch (error) {
    finishRun(runId, (error as Error)?.message ?? "未知错误");
  } finally {
    if (options.scheduleId) {
      db.update(schedules)
        .set({ lastRunAt: nowIso(), updatedAt: nowIso() })
        .where(eq(schedules.id, options.scheduleId))
        .run();
    }
  }
  return runId;
}

/** 计划是否正在执行（用于同计划重叠跳过） */
export function isScheduleRunning(scheduleId: string): boolean {
  return activeScheduleRuns.has(scheduleId);
}

/** 计划里的分组在执行时展开为当前成员，新增角色会自动纳入 */
function expandScheduleRoleIds(schedule: ScheduleRecord): string[] {
  const ids = new Set(schedule.roleIds);
  if (schedule.groupIds.length > 0) {
    const rows = db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.ownerId, schedule.ownerId),
          inArray(roles.groupId, schedule.groupIds),
        ),
      )
      .all();
    for (const row of rows) ids.add(row.id);
  }
  return [...ids];
}

function createSkippedRun(
  schedule: ScheduleRecord,
  trigger: RunTrigger,
): string {  const runId = createRun({
    ownerId: schedule.ownerId,
    scheduleId: schedule.id,
    trigger,
    status: "skipped",
  });
  emitRunLog({
    runId,
    level: "warning",
    message: "上一次运行尚未结束，本次触发已跳过",
    at: nowIso(),
  });
  return runId;
}

/**
 * 执行一个计划并等待完成（供调度器使用）。
 * 定时触发时若上一轮未结束，记录一条 skipped 运行并返回。
 */
export async function executeSchedule(
  schedule: ScheduleRecord,
  trigger: "scheduled" | "manual",
): Promise<string> {
  if (trigger === "scheduled" && activeScheduleRuns.has(schedule.id)) {
    return createSkippedRun(schedule, trigger);
  }

  activeScheduleRuns.add(schedule.id);
  try {
    return await executeRun({
      ownerId: schedule.ownerId,
      roleIds: expandScheduleRoleIds(schedule),
      actionKeys: schedule.actionKeys,
      scheduleId: schedule.id,
      trigger,
    });
  } finally {
    activeScheduleRuns.delete(schedule.id);
  }
}

/** 触发计划但不等待完成：立即返回 runId（供 HTTP 接口使用） */
export function startScheduleRun(
  schedule: ScheduleRecord,
  trigger: "scheduled" | "manual",
): string {
  if (trigger === "scheduled" && activeScheduleRuns.has(schedule.id)) {
    return createSkippedRun(schedule, trigger);
  }

  const runId = createRun({
    ownerId: schedule.ownerId,
    scheduleId: schedule.id,
    trigger,
  });
  activeScheduleRuns.add(schedule.id);
  void executeRun({
    ownerId: schedule.ownerId,
    roleIds: expandScheduleRoleIds(schedule),
    actionKeys: schedule.actionKeys,
    scheduleId: schedule.id,
    trigger,
    runId,
  }).finally(() => activeScheduleRuns.delete(schedule.id));
  return runId;
}

/** 手动执行单个角色，立即返回 runId */
export function startRoleRun(
  ownerId: string,
  roleId: string,
  actionKeys: string[],
): string {
  const runId = createRun({
    ownerId,
    trigger: "manual-role",
  });
  void executeRun({
    ownerId,
    roleIds: [roleId],
    actionKeys,
    trigger: "manual-role",
    runId,
  });
  return runId;
}

/** 手动刷新角色快照：按需连接、读取角色信息、保存并返回 */
export async function captureRoleSnapshot(
  role: RoleRecord,
): Promise<unknown> {
  const settings = getSettings();
  semaphore.setMax(settings.maxConcurrentRoles);
  const releaseLock = await roleLock.acquire(role.id);
  const releaseSlot = await semaphore.acquire();
  try {
    let currentRole = role;
    // 有 BIN 时先兑换新凭据，备份导入的旧 roleToken 往往已经过期
    if (currentRole.binBase64) {
      const refreshed = await refreshCredentialFromBin(currentRole);
      if (refreshed) currentRole = refreshed;
    }
    await waitForConnectSlot(settings.connectionDelayMs);
    const client = new GameClient(currentRole.credential, {
      name: currentRole.name,
    });
    try {
      await client.connect(15_000);
      const roleInfo = await sendWithRetry(
        client,
        "role_getroleinfo",
        {
          clientVersion: settings.clientVersion,
          platform: settings.platform,
        },
        15_000,
      );
      currentRole = applyRoleIdentity(currentRole, roleInfo);
      saveSnapshot(currentRole, roleInfo);
      saveResourceSnapshot(
        currentRole.id,
        "manual",
        extractResourceBag(roleInfo),
      );
      return roleInfo;
    } catch (error) {
      if (isCredentialFailure(error)) {
        markCredentialInvalid(
          currentRole,
          (error as Error)?.message ?? "凭据失效",
        );
      }
      throw error;
    } finally {
      client.disconnect();
    }
  } finally {
    releaseSlot();
    releaseLock();
  }
}

/** 手动执行单个角色（等待完成；HTTP 接口请使用 startRoleRun） */
export async function executeRoleManual(
  ownerId: string,
  roleId: string,
  actionKeys: string[],
): Promise<string> {
  return executeRun({
    ownerId,
    roleIds: [roleId],
    actionKeys,
    trigger: "manual-role",
  });
}
