import { and, eq, inArray, sql } from "drizzle-orm";
import { db, newId, nowIso } from "../db/index.js";
import { roleGroups, roles } from "../db/schema.js";

export interface GroupView {
  id: string;
  name: string;
  color: string;
  roleCount: number;
  createdAt: string;
  updatedAt: string;
}

export function listGroups(ownerId: string): GroupView[] {
  const rows = db
    .select()
    .from(roleGroups)
    .where(eq(roleGroups.ownerId, ownerId))
    .orderBy(roleGroups.createdAt)
    .all();
  const counts = db
    .select({ groupId: roles.groupId, count: sql<number>`count(*)` })
    .from(roles)
    .where(eq(roles.ownerId, ownerId))
    .groupBy(roles.groupId)
    .all();
  const countMap = new Map(
    counts.map((row) => [row.groupId, Number(row.count)] as const),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    roleCount: countMap.get(row.id) ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function assertUniqueName(
  ownerId: string,
  name: string,
  excludeId?: string,
): void {
  const existing = db
    .select()
    .from(roleGroups)
    .where(
      and(
        eq(roleGroups.ownerId, ownerId),
        eq(roleGroups.name, name),
      ),
    )
    .all();
  if (existing.some((row) => row.id !== excludeId)) {
    throw new Error(`分组名称已存在：${name}`);
  }
}

export function createGroup(
  ownerId: string,
  name: string,
  color = "#1677ff",
): GroupView {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("分组名称不能为空");
  assertUniqueName(ownerId, trimmed);
  const id = newId();
  const timestamp = nowIso();
  db.insert(roleGroups)
    .values({
      id,
      ownerId,
      name: trimmed,
      color,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return {
    id,
    name: trimmed,
    color,
    roleCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateGroup(
  ownerId: string,
  groupId: string,
  patch: { name?: string; color?: string },
): void {
  const group = db
    .select()
    .from(roleGroups)
    .where(and(eq(roleGroups.ownerId, ownerId), eq(roleGroups.id, groupId)))
    .get();
  if (!group) throw new Error("分组不存在");
  const values: Record<string, unknown> = { updatedAt: nowIso() };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("分组名称不能为空");
    assertUniqueName(ownerId, trimmed, groupId);
    values.name = trimmed;
  }
  if (patch.color !== undefined) values.color = patch.color;
  db.update(roleGroups)
    .set(values)
    .where(eq(roleGroups.id, groupId))
    .run();
}

export function deleteGroup(ownerId: string, groupId: string): void {
  db.update(roles)
    .set({ groupId: null, updatedAt: nowIso() })
    .where(and(eq(roles.ownerId, ownerId), eq(roles.groupId, groupId)))
    .run();
  db.delete(roleGroups)
    .where(and(eq(roleGroups.ownerId, ownerId), eq(roleGroups.id, groupId)))
    .run();
}

/** 把一批角色移入分组；groupId 为 null 表示移出分组 */
export function assignRolesToGroup(
  ownerId: string,
  roleIds: string[],
  groupId: string | null,
): number {
  if (roleIds.length === 0) return 0;
  if (groupId) {
    const group = db
      .select()
      .from(roleGroups)
      .where(
        and(eq(roleGroups.ownerId, ownerId), eq(roleGroups.id, groupId)),
      )
      .get();
    if (!group) throw new Error("分组不存在");
  }
  const result = db
    .update(roles)
    .set({ groupId, updatedAt: nowIso() })
    .where(and(eq(roles.ownerId, ownerId), inArray(roles.id, roleIds)))
    .run();
  return result.changes;
}
