import { and, eq, gte, lt } from "drizzle-orm";
import { db, newId, nowIso } from "../db/index.js";
import { resourceSnapshots } from "../db/schema.js";
import { dateKey } from "../core/time.js";

/** 身份牌统计的物品 ID（与前端 ITEM_RESOURCES 保持一致） */
export const RESOURCE_ITEM_IDS = [
  1011, 1012, 1013, 1017, 1001, 1006, 1023, 1003, 10002, 10003, 10101, 3001,
  3002, 3005, 3006, 3007, 3008, 3009, 3010, 3011, 3012, 3020, 3021, 3201,
  3302, 1019, 1016, 1020, 1021, 1022, 1033, 1035, 1007, 2001, 2002, 2003,
  2004, 2005, 35002, 35009, 1008, 1009, 1010, 1014, 1026, 2101,
];

export interface ResourceBag {
  gold: number;
  diamond: number;
  items: Record<string, number>;
}

function itemCount(items: unknown, id: number): number {
  if (!items || typeof items !== "object") return 0;
  const map = items as Record<string, unknown>;
  const node = map[String(id)];
  if (node == null) return 0;
  if (typeof node === "number") return node;
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>;
    return Number(record.quantity ?? record.num ?? record.count ?? 0) || 0;
  }
  return Number(node) || 0;
}

/** 从 role_getroleinfo 响应中提取资源全集 */
export function extractResourceBag(roleInfo: unknown): ResourceBag {
  const role =
    (roleInfo as { role?: Record<string, unknown> } | undefined)?.role ??
    (roleInfo as Record<string, unknown> | undefined) ??
    {};
  const items = role.items;
  const bag: ResourceBag = {
    gold: Number(role.gold ?? 0) || 0,
    diamond: Number(role.diamond ?? 0) || 0,
    items: {},
  };
  for (const id of RESOURCE_ITEM_IDS) {
    bag.items[String(id)] = itemCount(items, id);
  }
  return bag;
}

/** 保存一条资源快照（source: run-start / run-end / manual） */
export function saveResourceSnapshot(
  roleId: string,
  source: "run-start" | "run-end" | "manual",
  bag: ResourceBag,
  runId?: string | null,
): void {
  db.insert(resourceSnapshots)
    .values({
      id: newId(),
      roleId,
      runId: runId ?? null,
      source,
      capturedAt: nowIso(),
      data: JSON.stringify(bag),
    })
    .run();
}

export interface ResourceDelta {
  key: string;
  start: number;
  end: number;
  delta: number;
}

export interface GrowthDay {
  date: string;
  baselineAt: string | null;
  endAt: string | null;
  deltas: ResourceDelta[];
}

function bagValue(bag: ResourceBag, key: string): number {
  if (key === "gold") return bag.gold;
  if (key === "diamond") return bag.diamond;
  if (key.startsWith("item:")) {
    return bag.items[key.slice(5)] ?? 0;
  }
  return 0;
}

function allKeys(a: ResourceBag, b: ResourceBag): string[] {
  const itemKeys = new Set([
    ...Object.keys(a.items),
    ...Object.keys(b.items),
  ]);
  return ["gold", "diamond", ...[...itemKeys].map((id) => `item:${id}`)];
}

interface StoredSnapshot {
  capturedAt: string;
  bag: ResourceBag;
}

function parseSnapshotRow(row: {
  capturedAt: string;
  data: string;
}): StoredSnapshot | null {
  try {
    const bag = JSON.parse(row.data) as ResourceBag;
    if (!bag || typeof bag !== "object") return null;
    return { capturedAt: row.capturedAt, bag };
  } catch {
    return null;
  }
}

/**
 * 计算最近 N 天的资源净增长。
 * 每天取「当天最后一条快照」与「当天之前最后一条快照」做差；
 * 如果之前没有快照，就用当天第一条作为基线。
 */
export function getResourceGrowth(roleId: string, days = 7): GrowthDay[] {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - (days + 2) * 24 * 60 * 60 * 1000);
  const rows = db
    .select({
      capturedAt: resourceSnapshots.capturedAt,
      data: resourceSnapshots.data,
    })
    .from(resourceSnapshots)
    .where(
      and(
        eq(resourceSnapshots.roleId, roleId),
        gte(resourceSnapshots.capturedAt, rangeStart.toISOString()),
      ),
    )
    .orderBy(resourceSnapshots.capturedAt)
    .all();
  const snapshots = rows
    .map(parseSnapshotRow)
    .filter((item): item is StoredSnapshot => item !== null);

  const byDay = new Map<string, StoredSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = dateKey(new Date(snapshot.capturedAt));
    const list = byDay.get(key) ?? [];
    list.push(snapshot);
    byDay.set(key, list);
  }

  const result: GrowthDay[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = dateKey(day);
    const daySnapshots = byDay.get(key) ?? [];
    if (daySnapshots.length === 0) continue;

    const dayStart = new Date(`${key}T00:00:00+08:00`).getTime();
    const earlier = snapshots.filter(
      (snapshot) => new Date(snapshot.capturedAt).getTime() < dayStart,
    );
    const baseline =
      earlier.length > 0
        ? earlier[earlier.length - 1]
        : daySnapshots[0];
    const end = daySnapshots[daySnapshots.length - 1];
    if (!baseline || !end) continue;

    const deltas: ResourceDelta[] = [];
    for (const resourceKey of allKeys(baseline.bag, end.bag)) {
      const start = bagValue(baseline.bag, resourceKey);
      const value = bagValue(end.bag, resourceKey);
      // 只返回真正发生变化的资源
      if (start === value) continue;
      deltas.push({
        key: resourceKey,
        start,
        end: value,
        delta: value - start,
      });
    }
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    result.push({
      date: key,
      baselineAt: baseline.capturedAt,
      endAt: end.capturedAt,
      deltas,
    });
  }
  return result;
}

/** 清理过旧的资源快照（保留 90 天） */
export function cleanupResourceSnapshots(keepDays = 90): number {
  const cutoff = new Date(
    Date.now() - keepDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const result = db
    .delete(resourceSnapshots)
    .where(lt(resourceSnapshots.capturedAt, cutoff))
    .run();
  return result.changes;
}
