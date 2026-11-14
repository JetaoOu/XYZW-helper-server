import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { roles, scheduleRoles, schedules } from "../db/schema.js";
import { decryptCredential } from "../crypto/credentialCipher.js";
import type { RoleRecord, ScheduleRecord } from "../types.js";

type RoleRow = typeof roles.$inferSelect;
type ScheduleRow = typeof schedules.$inferSelect;

export function toRoleRecord(row: RoleRow): RoleRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    groupId: row.groupId,
    name: row.name,
    server: row.server,
    serverId: row.serverId,
    gameRoleId: row.gameRoleId,
    avatar: row.avatar,
    credential: decryptCredential({
      enc: row.credentialEnc,
      iv: row.credentialIv,
      tag: row.credentialTag,
    }),
    credentialHash: row.credentialHash,
    importMethod: row.importMethod,
    sourceUrl: row.sourceUrl,
    binBase64: row.binBlob,
    enabled: row.enabled,
    credentialStatus: row.credentialStatus as "valid" | "invalid",
    credentialError: row.credentialError,
    credentialUpdatedAt: row.credentialUpdatedAt,
    lastSnapshotJson: row.lastSnapshotJson,
    lastSnapshotAt: row.lastSnapshotAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listRoles(ownerId: string): RoleRecord[] {
  return db
    .select()
    .from(roles)
    .where(eq(roles.ownerId, ownerId))
    .all()
    .map(toRoleRecord);
}

export function getRole(ownerId: string, roleId: string): RoleRecord | null {
  const row = db
    .select()
    .from(roles)
    .where(and(eq(roles.ownerId, ownerId), eq(roles.id, roleId)))
    .get();
  return row ? toRoleRecord(row) : null;
}

export function getRoleRow(ownerId: string, roleId: string): RoleRow | null {
  return (
    db
      .select()
      .from(roles)
      .where(and(eq(roles.ownerId, ownerId), eq(roles.id, roleId)))
      .get() ?? null
  );
}

export function getRolesByIds(
  ownerId: string,
  roleIds: string[],
): RoleRecord[] {
  if (roleIds.length === 0) return [];
  return db
    .select()
    .from(roles)
    .where(and(eq(roles.ownerId, ownerId), inArray(roles.id, roleIds)))
    .all()
    .map(toRoleRecord);
}

export function toScheduleRecord(
  row: ScheduleRow,
  roleIds: string[],
): ScheduleRecord {
  let actionKeys: string[] = [];
  try {
    const parsed = JSON.parse(row.actionKeys);
    if (Array.isArray(parsed)) actionKeys = parsed.map(String);
  } catch {
    actionKeys = [];
  }
  let groupIds: string[] = [];
  try {
    const parsed = JSON.parse(row.groupIds || "[]");
    if (Array.isArray(parsed)) groupIds = parsed.map(String);
  } catch {
    groupIds = [];
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    cronExpr: row.cronExpr,
    timezone: row.timezone,
    actionKeys,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    roleIds,
    groupIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listSchedules(ownerId: string): ScheduleRecord[] {
  const rows = db
    .select()
    .from(schedules)
    .where(eq(schedules.ownerId, ownerId))
    .all();
  if (rows.length === 0) return [];
  const links = db
    .select()
    .from(scheduleRoles)
    .where(
      inArray(
        scheduleRoles.scheduleId,
        rows.map((row) => row.id),
      ),
    )
    .all();
  const bySchedule = new Map<string, string[]>();
  for (const link of links) {
    const list = bySchedule.get(link.scheduleId) ?? [];
    list.push(link.roleId);
    bySchedule.set(link.scheduleId, list);
  }
  return rows.map((row) => toScheduleRecord(row, bySchedule.get(row.id) ?? []));
}

export function getSchedule(
  ownerId: string,
  scheduleId: string,
): ScheduleRecord | null {
  const row = db
    .select()
    .from(schedules)
    .where(and(eq(schedules.ownerId, ownerId), eq(schedules.id, scheduleId)))
    .get();
  if (!row) return null;
  const links = db
    .select()
    .from(scheduleRoles)
    .where(eq(scheduleRoles.scheduleId, scheduleId))
    .all();
  return toScheduleRecord(
    row,
    links.map((link) => link.roleId),
  );
}

export function setScheduleRoles(
  scheduleId: string,
  roleIds: string[],
): void {
  db.delete(scheduleRoles)
    .where(eq(scheduleRoles.scheduleId, scheduleId))
    .run();
  for (const roleId of roleIds) {
    db.insert(scheduleRoles)
      .values({ scheduleId, roleId })
      .onConflictDoNothing()
      .run();
  }
}
