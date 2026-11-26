import { getHangUpState } from "../daily/dailyTaskState.js";
import { GameError } from "../protocol/gameClient.js";
import type { ActionContext, ActionDefinition } from "./types.js";
import type { ActionResult } from "../types.js";
import { itemCount, readRoleInfo, roleOf } from "./roleResponse.js";

/** 上海时区的星期几（0=周日） */
function shanghaiDayOfWeek(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCDay();
}

const bottleReset: ActionDefinition = {
  key: "bottleReset",
  name: "重置盐罐",
  description: "停止并重新开始盐罐计时",
  category: "日常",
  async run(ctx) {
    await ctx.send("bottlehelper_stop");
    await ctx.sleep(500);
    await ctx.send("bottlehelper_start");
    return { status: "success", message: "盐罐已重置" };
  },
};

const bottleClaim: ActionDefinition = {
  key: "bottleClaim",
  name: "领取盐罐",
  description: "领取盐罐奖励",
  category: "日常",
  async run(ctx) {
    await ctx.send("bottlehelper_claim");
    return { status: "success", message: "盐罐奖励已领取" };
  },
};

const addHangUpTime: ActionDefinition = {
  key: "addHangUpTime",
  name: "一键加钟",
  description: "按服务器空余助力槽位补足挂机加钟",
  category: "日常",
  async run(ctx) {
    const info = await readRoleInfo(ctx);
    const serverTime = ctx.client.serverTime ?? Date.now();
    const before = getHangUpState(
      roleOf(info),
      serverTime,
    ) as { active: number; remaining: number };
    if (before.remaining <= 0) {
      return { status: "completed", message: "助力槽位已满，无需加钟" };
    }
    ctx.log(`空余助力槽位 ${before.remaining} 个，开始加钟`);
    for (let i = 0; i < before.remaining; i++) {
      await ctx.send(
        "system_mysharecallback",
        { isSkipShareCard: true, type: 2 },
        8000,
      );
      await ctx.sleep(500);
    }
    const after = await readRoleInfo(ctx);
    const afterState = getHangUpState(
      roleOf(after),
      ctx.client.serverTime ?? Date.now(),
    ) as { active: number; remaining: number };
    return {
      status: "success",
      message:
        afterState.remaining > 0
          ? `加钟完成，仍有 ${afterState.remaining} 个空槽位`
          : "挂机加钟已补满",
    };
  },
};

const collectionFree: ActionDefinition = {
  key: "collectionFree",
  name: "珍宝阁",
  description: "领取珍宝阁免费礼包",
  category: "日常",
  async run(ctx) {
    await ctx.send("collection_claimfreereward");
    return { status: "success", message: "珍宝阁免费礼包已领取" };
  },
};

const legacyClaim: ActionDefinition = {
  key: "legacyClaim",
  name: "功法领取",
  description: "领取功法挂机奖励",
  category: "功法",
  async run(ctx) {
    await ctx.send("legacy_claimhangup");
    return { status: "success", message: "功法奖励已领取" };
  },
};

const openBox: ActionDefinition = {
  key: "openBox",
  name: "开箱",
  description: "开启 50 个木质宝箱并领取宝箱积分",
  category: "资源",
  async run(ctx) {
    for (let i = 0; i < 5; i++) {
      await ctx.send(
        "item_openbox",
        { itemId: 2001, number: 10 },
        8000,
      );
      ctx.log(`开箱进度 ${(i + 1) * 10}/50`);
      await ctx.sleep(ctx.commandDelay);
    }
    try {
      await ctx.send("item_batchclaimboxpointreward");
    } catch {
      // 积分领取失败不影响开箱结果
    }
    return { status: "success", message: "开箱完成" };
  },
};

const boxPoint: ActionDefinition = {
  key: "boxPoint",
  name: "宝箱积分",
  description: "领取宝箱积分奖励",
  category: "资源",
  async run(ctx) {
    await ctx.send("item_batchclaimboxpointreward");
    return { status: "success", message: "宝箱积分已领取" };
  },
};

const recruit: ActionDefinition = {
  key: "recruit",
  name: "招募",
  description: "招募 50 次",
  category: "资源",
  async run(ctx) {
    for (let i = 0; i < 5; i++) {
      await ctx.send(
        "hero_recruit",
        { recruitType: 1, recruitNumber: 10 },
        8000,
      );
      ctx.log(`招募进度 ${(i + 1) * 10}/50`);
      await ctx.sleep(ctx.commandDelay);
    }
    return { status: "success", message: "招募完成" };
  },
};

const fish: ActionDefinition = {
  key: "fish",
  name: "钓鱼",
  description: "使用 30 个普通鱼竿钓鱼",
  category: "资源",
  async run(ctx) {
    const info = await readRoleInfo(ctx);
    const rods = itemCount(roleOf(info), 1011);
    if (rods <= 0) {
      return { status: "completed", message: "没有普通鱼竿" };
    }
    const total = Math.min(rods, 30);
    const rounds = Math.ceil(total / 10);
    for (let i = 0; i < rounds; i++) {
      const number = Math.min(10, total - i * 10);
      if (number <= 0) break;
      await ctx.send(
        "artifact_lottery",
        { type: 1, lotteryNumber: number, newFree: true },
        8000,
      );
      ctx.log(`钓鱼进度 ${Math.min((i + 1) * 10, total)}/${total}`);
      await ctx.sleep(ctx.commandDelay);
    }
    return { status: "success", message: `钓鱼完成，共 ${total} 次` };
  },
};

const genieSweep: ActionDefinition = {
  key: "genieSweep",
  name: "灯神扫荡",
  description: "使用扫荡券扫荡进度最高的灯神",
  category: "资源",
  async run(ctx) {
    const info = await readRoleInfo(ctx);
    const role = roleOf(info);
    const tickets = itemCount(role, 1021);
    if (tickets <= 0) {
      return { status: "completed", message: "没有扫荡券" };
    }
    const genie = (role.genie ?? {}) as Record<string, unknown>;
    let bestId = -1;
    let maxLayer = -1;
    for (let i = 1; i <= 4; i++) {
      if (genie[i] === undefined) continue;
      const layer = Number(genie[i]) + 1;
      if (layer > maxLayer) {
        maxLayer = layer;
        bestId = i;
      }
    }
    if (bestId === -1) {
      return { status: "completed", message: "未找到可扫荡的灯神" };
    }
    let remaining = tickets;
    while (remaining > 0) {
      const sweepCnt = Math.min(remaining, 20);
      const response = (await ctx.send(
        "genie_sweep",
        { genieId: bestId, sweepCnt },
        8000,
      )) as { role?: Record<string, unknown> };
      ctx.log(`扫荡 ${sweepCnt} 次`);
      const next = itemCount(response?.role ?? {}, 1021);
      if (next <= 0) break;
      remaining = next;
      await ctx.sleep(ctx.commandDelay);
    }
    return { status: "success", message: "灯神扫荡完成" };
  },
};

const freeEnergy: ActionDefinition = {
  key: "freeEnergy",
  name: "免费道具",
  description: "领取怪异塔免费道具",
  category: "资源",
  async run(ctx) {
    const info = (await ctx.send(
      "mergebox_getinfo",
      { actType: 1 },
      8000,
    )) as { mergeBox?: { freeEnergy?: number } };
    const free = Number(info?.mergeBox?.freeEnergy ?? 0);
    if (free <= 0) {
      return { status: "completed", message: "没有可领取的免费道具" };
    }
    await ctx.send("mergebox_claimfreeenergy", { actType: 1 }, 8000);
    return { status: "success", message: `已领取 ${free} 个免费道具` };
  },
};

const legionStoreBuy: ActionDefinition = {
  key: "legionStoreBuy",
  name: "四圣碎片",
  description: "在军团商店购买四圣碎片",
  category: "资源",
  async run(ctx) {
    await ctx.send("legion_storebuygoods", { id: 6 }, 8000);
    return { status: "success", message: "四圣碎片购买请求已提交" };
  },
};

const arena3: ActionDefinition = {
  key: "arena3",
  name: "竞技场3次",
  description: "使用咸神门票进行最多 3 次竞技场战斗",
  category: "副本",
  async run(ctx) {
    const info = await readRoleInfo(ctx);
    const tickets = itemCount(roleOf(info), 1007);
    if (tickets <= 0) {
      return { status: "completed", message: "咸神门票不足" };
    }
    const fights = Math.min(3, tickets);
    for (let i = 0; i < fights; i++) {
      await ctx.send("arena_startarea");
      await ctx.sleep(ctx.commandDelay);
      const targets = await ctx.send("arena_getareatarget");
      await ctx.sleep(ctx.commandDelay);
      const targetId = pickTargetId(targets);
      if (targetId === null) {
        return { status: "skipped", message: "未找到竞技场目标" };
      }
      await ctx.send("fight_startareaarena", { targetId }, 10_000);
      ctx.log(`竞技场战斗 ${i + 1}/${fights}`);
      await ctx.sleep(1000);
    }
    return { status: "success", message: `竞技场战斗完成，共 ${fights} 次` };
  },
};

const dream: ActionDefinition = {
  key: "dream",
  name: "咸王梦境",
  description: "在开放日进入咸王梦境",
  category: "副本",
  async run(ctx) {
    const weekDay = shanghaiDayOfWeek();
    if (![0, 1, 3, 4].includes(weekDay)) {
      return { status: "skipped", message: "今天不是咸王梦境开放日" };
    }
    await ctx.send("dungeon_selecthero", { battleTeam: { 0: 107 } }, 8000);
    return { status: "success", message: "咸王梦境已进入" };
  },
};

const campTasks: ActionDefinition = {
  key: "campTasks",
  name: "营地任务",
  description: "领取营地任务奖励",
  category: "副本",
  async run(ctx) {
    await ctx.send("club_getinfo", {}, 15_000);
    let claimed = 0;
    for (const confId of [1, 2, 3, 4]) {
      try {
        await ctx.send("club_taskclaim", { confId }, 8000);
        claimed++;
      } catch {
        // 未完成或已领取，跳过
      }
      await ctx.sleep(ctx.commandDelay);
    }
    return {
      status: "success",
      message: `营地任务奖励领取完成，共 ${claimed} 个`,
    };
  },
};

const weirdTower: ActionDefinition = {
  key: "weirdTower",
  name: "怪异塔",
  description: "消耗能量爬怪异塔，并补领章节与每日任务奖励",
  category: "怪异塔",
  async run(ctx) {
    const info = (await ctx.send("evotower_getinfo", {}, 8000)) as {
      evoTower?: Record<string, unknown>;
    };
    let evo = (info?.evoTower ?? {}) as Record<string, unknown>;
    let energy = Number(evo.energy ?? 0);
    ctx.log(`怪异塔初始能量 ${energy}`);

    const claimPendingRewards = async (): Promise<void> => {
      const towerId = Number(evo.towerId ?? 0);
      const rewardTowerId = Number(evo.rewardTowerId ?? 0);
      let pending = Math.floor(towerId / 10) - rewardTowerId;
      while (pending > 0) {
        try {
          await ctx.send("evotower_claimreward", {}, 5000);
          pending--;
          await ctx.sleep(300);
        } catch {
          break;
        }
      }
    };
    await claimPendingRewards();

    const maxClimb = 30;
    let count = 0;
    while (energy > 0 && count < maxClimb) {
      try {
        await ctx.send("evotower_readyfight", {}, 8000);
        await ctx.send(
          "evotower_fight",
          { battleNum: 1, winNum: 1 },
          10_000,
        );
      } catch (error) {
        // 章节奖励未领取时服务器会拒绝开战，先补领再重试
        if (error instanceof GameError && error.code === 12200020) {
          ctx.log("存在未领取的章节奖励，先补领", "warning");
          await claimPendingRewards();
          await ctx.sleep(500);
          continue;
        }
        throw error;
      }
      count++;
      ctx.log(`怪异塔第 ${count} 次`);
      await ctx.sleep(500);

      const refreshed = (await ctx.send("evotower_getinfo", {}, 8000)) as {
        evoTower?: Record<string, unknown>;
      };
      evo = (refreshed?.evoTower ?? evo) as Record<string, unknown>;
      energy = Number(evo.energy ?? 0);

      const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const dateKey = `${String(now.getUTCFullYear()).slice(2)}${String(
        now.getUTCMonth() + 1,
      ).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
      const claimMap = (evo.taskClaimMap ?? {}) as Record<
        string,
        Record<string, boolean>
      >;
      const daily = claimMap[dateKey] ?? {};
      for (const taskId of [1, 2, 3]) {
        if (!daily[taskId]) {
          try {
            await ctx.send("evotower_claimtask", { taskId }, 3000);
          } catch {
            // 任务未完成
          }
          await ctx.sleep(200);
        }
      }
      await claimPendingRewards();
    }

    return {
      status: "success",
      message: `怪异塔完成，共 ${count} 次，剩余能量 ${energy}`,
    };
  },
};

/** 从竞技场目标响应中提取 targetId */
function pickTargetId(targets: unknown): string | number | null {
  if (!targets) return null;
  if (Array.isArray(targets)) {
    const first = targets[0] as Record<string, unknown> | undefined;
    return (
      (first?.roleId as string | number) ??
      (first?.id as string | number) ??
      (first?.targetId as string | number) ??
      null
    );
  }
  const data = targets as Record<string, unknown>;
  const list = (data.rankList ??
    data.roleList ??
    data.targets ??
    data.targetList ??
    data.list) as Array<Record<string, unknown>> | undefined;
  const first = list?.[0];
  return (
    (first?.roleId as string | number) ??
    (first?.id as string | number) ??
    (first?.targetId as string | number) ??
    (data.roleId as string | number) ??
    null
  );
}

/** 追加迁移的原项目任务 */
export const EXTRA_ACTIONS: Record<string, ActionDefinition> = {
  bottleReset,
  bottleClaim,
  addHangUpTime,
  collectionFree,
  legacyClaim,
  openBox,
  boxPoint,
  recruit,
  fish,
  genieSweep,
  freeEnergy,
  legionStoreBuy,
  arena3,
  dream,
  campTasks,
  weirdTower,
};
