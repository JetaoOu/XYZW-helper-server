import type { ActionContext } from "./types.js";

/** 读取角色信息；响应形如 `{ role: {...} }` */
export async function readRoleInfo(ctx: ActionContext): Promise<unknown> {
  return ctx.send(
    "role_getroleinfo",
    {
      clientVersion: ctx.settings.clientVersion,
      platform: ctx.settings.platform,
    },
    15_000,
  );
}

/** 从响应中取出 role 对象；缺失时返回空对象 */
export function roleOf(response: unknown): Record<string, unknown> {
  return (
    ((response as { role?: Record<string, unknown> } | undefined)?.role ??
      {}) as Record<string, unknown>
  );
}

/** 读取物品数量；兼容 { quantity } / { num } / { count } / 纯数字 */
export function itemCount(role: Record<string, unknown>, id: number): number {
  const items = role.items as Record<string, unknown> | undefined;
  if (!items) return 0;
  const node = items[String(id)] as
    | { quantity?: number; num?: number; count?: number }
    | number
    | undefined;
  if (node == null) return 0;
  if (typeof node === "number") return node;
  return Number(node.quantity ?? node.num ?? node.count ?? 0) || 0;
}
