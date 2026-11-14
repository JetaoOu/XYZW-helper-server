import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, newId, nowIso } from "../db/index.js";
import { roles } from "../db/schema.js";
import {
  encryptCredential,
  decryptCredential,
} from "../crypto/credentialCipher.js";
import { getRole, toRoleRecord } from "./repositories.js";
import type { RoleRecord } from "../types.js";

/** 凭据指纹：同一份凭据重复导入时用于去重 */
export function credentialFingerprint(credential: string): string {
  return createHash("sha256").update(credential).digest("hex");
}

export interface DuplicateLookup {
  gameRoleId?: string | null;
  credentialHash?: string | null;
  name?: string | null;
  server?: string | null;
}

/**
 * 查找可能重复的角色。
 * 唯一身份 = 区服 + 游戏角色 ID；没有角色 ID 时退回凭据指纹、名称。
 * 若同一个 gameRoleId 被多个角色共享（历史上把账号 uid 当成了角色 ID），
 * 则忽略该 ID，避免把所有角色判成同一个。
 */
export function findRoleDuplicate(
  ownerId: string,
  lookup: DuplicateLookup,
): RoleRecord | null {
  if (lookup.gameRoleId) {
    const matches = db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.ownerId, ownerId),
          eq(roles.gameRoleId, lookup.gameRoleId),
        ),
      )
      .all();
    if (matches.length === 1) {
      const match = matches[0];
      // 只有区服也一致（或任一方未记录区服）才视为同一角色
      const sameServer =
        !lookup.server || !match.server || match.server === lookup.server;
      if (sameServer) return toRoleRecord(match);
    }
  }
  if (lookup.credentialHash) {
    const row = db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.ownerId, ownerId),
          eq(roles.credentialHash, lookup.credentialHash),
        ),
      )
      .get();
    if (row) return toRoleRecord(row);
  }
  if (lookup.name) {
    const row = db
      .select()
      .from(roles)
      .where(and(eq(roles.ownerId, ownerId), eq(roles.name, lookup.name)))
      .get();
    if (row) return toRoleRecord(row);
  }
  return null;
}

export interface NewRoleInput {
  name?: string;
  server?: string | null;
  serverId?: string | number | null;
  gameRoleId?: string | null;
  groupId?: string | null;
  avatar?: string | null;
  credential: string;
  importMethod: string;
  sourceUrl?: string | null;
  binBase64?: string | null;
  binName?: string | null;
}

/** 新建角色：凭据加密后入库 */
export function createRole(
  ownerId: string,
  input: NewRoleInput,
): ReturnType<typeof getRole> {
  const id = newId();
  const encrypted = encryptCredential(input.credential);
  const timestamp = nowIso();
  db.insert(roles)
    .values({
      id,
      ownerId,
      groupId: input.groupId ?? null,
      name: input.name?.trim() || "未命名角色",
      server: input.server ?? null,
      serverId:
        input.serverId === undefined || input.serverId === null
          ? null
          : String(input.serverId),
      gameRoleId: input.gameRoleId ?? null,
      avatar: input.avatar ?? null,
      credentialEnc: encrypted.enc,
      credentialIv: encrypted.iv,
      credentialTag: encrypted.tag,
      credentialHash: credentialFingerprint(input.credential),
      importMethod: input.importMethod,
      sourceUrl: input.sourceUrl ?? null,
      binBlob: input.binBase64 ?? null,
      binName: input.binName ?? null,
      enabled: true,
      credentialStatus: "valid",
      credentialUpdatedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return getRole(ownerId, id);
}

export interface RolePatch {
  name?: string;
  server?: string | null;
  serverId?: string | number | null;
  gameRoleId?: string | null;
  groupId?: string | null;
  enabled?: boolean;
  credential?: string;
  credentialStatus?: "valid" | "invalid";
  credentialError?: string | null;
  sourceUrl?: string | null;
  binBase64?: string | null;
}

/** 更新角色；传入 credential 时重新加密 */
export function updateRole(
  ownerId: string,
  roleId: string,
  patch: RolePatch,
): boolean {
  const values: Record<string, unknown> = { updatedAt: nowIso() };
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.server !== undefined) values.server = patch.server;
  if (patch.serverId !== undefined) {
    values.serverId =
      patch.serverId === null ? null : String(patch.serverId);
  }
  if (patch.gameRoleId !== undefined) values.gameRoleId = patch.gameRoleId;
  if (patch.groupId !== undefined) values.groupId = patch.groupId;
  if (patch.enabled !== undefined) values.enabled = patch.enabled;
  if (patch.credentialStatus !== undefined) {
    values.credentialStatus = patch.credentialStatus;
  }
  if (patch.credentialError !== undefined) {
    values.credentialError = patch.credentialError;
  }
  if (patch.sourceUrl !== undefined) values.sourceUrl = patch.sourceUrl;
  if (patch.binBase64 !== undefined) values.binBlob = patch.binBase64;
  if (patch.credential !== undefined) {
    const encrypted = encryptCredential(patch.credential);
    values.credentialEnc = encrypted.enc;
    values.credentialIv = encrypted.iv;
    values.credentialTag = encrypted.tag;
    values.credentialHash = credentialFingerprint(patch.credential);
    values.credentialUpdatedAt = nowIso();
  }
  db.update(roles)
    .set(values)
    .where(and(eq(roles.ownerId, ownerId), eq(roles.id, roleId)))
    .run();
  return true;
}

export function deleteRole(ownerId: string, roleId: string): void {
  db.delete(roles)
    .where(and(eq(roles.ownerId, ownerId), eq(roles.id, roleId)))
    .run();
}

/** 对外返回的角色视图：不含凭据，只含摘要与快照 */
export function toRoleView(role: NonNullable<ReturnType<typeof getRole>>) {
  let credentialSummary: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(role.credential) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      credentialSummary = {
        roleId: parsed.roleId ?? null,
        isRestore: parsed.isRestore ?? null,
      };
    }
  } catch {
    credentialSummary = null;
  }

  let snapshot: unknown = null;
  if (role.lastSnapshotJson) {
    try {
      snapshot = JSON.parse(role.lastSnapshotJson);
    } catch {
      snapshot = null;
    }
  }

  return {
    id: role.id,
    groupId: role.groupId,
    name: role.name,
    server: role.server,
    gameRoleId: role.gameRoleId,
    avatar: role.avatar,
    importMethod: role.importMethod,
    sourceUrl: role.sourceUrl,
    enabled: role.enabled,
    credentialStatus: role.credentialStatus,
    credentialError: role.credentialError,
    credentialUpdatedAt: role.credentialUpdatedAt,
    hasBin: Boolean(role.binBase64),
    credentialSummary,
    snapshot,
    lastSnapshotAt: role.lastSnapshotAt,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/** 供内部使用：读取并解密（保留接口，避免路由层直接碰加密字段） */
export function decryptRoleRow(row: {
  credentialEnc: string;
  credentialIv: string;
  credentialTag: string;
}): string {
  return decryptCredential({
    enc: row.credentialEnc,
    iv: row.credentialIv,
    tag: row.credentialTag,
  });
}
