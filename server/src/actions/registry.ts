import { GameError } from "../protocol/gameClient.js";
import { DailyTaskRunner } from "../daily/dailyTaskRunner.js";
import { saveDailyStatus } from "../services/dailyStatus.js";
import { EXTRA_ACTIONS } from "./extra.js";
import type { ActionContext, ActionDefinition } from "./types.js";
import type { ActionResult } from "../types.js";

/** 从竞技场目标响应中提取 targetId */
function pickArenaTargetId(targets: unknown): string | number | null {
  if (!targets) return null;
  const data = targets as Record<string, unknown>;
  if (Array.isArray(targets)) {
    const candidate = targets[0] as Record<string, unknown> | undefined;
    return (
      (candidate?.roleId as string | number) ??
      (candidate?.id as string | number) ??
      (candidate?.targetId as string | number) ??
      null
    );
  }
  const candidate = (data.rankList ??
    data.roleList ??
    data.targets ??
    data.targetList ??
    data.list) as Array<Record<string, unknown>> | undefined;
  const first = candidate?.[0];
  if (first) {
    return (
      (first.roleId as string | number) ??
      (first.id as string | number) ??
      (first.targetId as string | number) ??
      null
    );
  }
  return (
    (data.roleId as string | number) ??
    (data.id as string | number) ??
    (data.targetId as string | number) ??
    null
  );
}

/** 单命令动作的公共包装：成功即 success，业务性错误由上层归类为 skipped */
function simpleAction(
  key: string,
  name: string,
  description: string,
  category: string,
  commands: Array<{
    cmd: string;
    params?: Record<string, unknown>;
    timeoutMs?: number;
  }>,
): ActionDefinition {
  return {
    key,
    name,
    description,
    category,
    async run(ctx: ActionContext): Promise<ActionResult> {
      for (const command of commands) {
        ctx.log(`${name}: ${command.cmd}`);
        await ctx.send(command.cmd, command.params, command.timeoutMs);
        await ctx.sleep(ctx.commandDelay);
      }
      return { status: "success", message: `${name} 完成` };
    },
  };
}

const signIn = simpleAction(
  "signIn",
  "签到",
  "领取游戏内签到奖励",
  "日常",
  [{ cmd: "system_signinreward" }],
);

const hangup = simpleAction(
  "hangup",
  "挂机奖励",
  "领取挂机奖励",
  "日常",
  [{ cmd: "system_claimhangupreward" }],
);

const mail = simpleAction(
  "mail",
  "邮件",
  "领取全部邮件附件",
  "日常",
  [{ cmd: "mail_claimallattachment", params: { category: 0 } }],
);

const legionSignIn = simpleAction(
  "legionSignIn",
  "军团签到",
  "军团/俱乐部签到",
  "日常",
  [{ cmd: "legion_getinfo" }, { cmd: "legion_signin" }],
);

const tower: ActionDefinition = {
  key: "tower",
  name: "爬塔",
  description: "消耗体力循环爬咸将塔，并处理未领取的层奖励",
  category: "副本",
  async run(ctx) {
    const readRole = () =>
      ctx.send(
        "role_getroleinfo",
        {
          clientVersion: ctx.settings.clientVersion,
          platform: ctx.settings.platform,
        },
        15_000,
      );

    const roleInfo = (await readRole()) as {
      role?: { tower?: { id?: number; energy?: number } };
    };
    let energy = Number(roleInfo?.role?.tower?.energy ?? 0);
    let towerId = Number(roleInfo?.role?.tower?.id ?? 0);
    ctx.log(`当前爬塔层数 ${towerId}，体力 ${energy}`);

    const MAX_CLIMB = 100;
    let count = 0;

    while (energy > 0 && count < MAX_CLIMB) {
      try {
        await ctx.send("fight_starttower", {}, 8000);
        count++;
        energy--;
        ctx.log(`爬塔第 ${count} 次`);

        if (count % 5 === 0) {
          const refreshed = (await readRole()) as {
            role?: { tower?: { id?: number; energy?: number } };
          };
          energy = Number(refreshed?.role?.tower?.energy ?? energy);
          towerId = Number(refreshed?.role?.tower?.id ?? towerId);
        }
        await ctx.sleep(1000);
      } catch (error) {
        const code =
          error instanceof GameError ? error.code : undefined;
        // 操作太快：等待后重试，不消耗次数
        if (code === 200400) {
          ctx.log("操作过快，等待 5 秒后重试", "warning");
          await ctx.sleep(5000);
          continue;
        }
        // 上一层的奖励未领取：先补领再继续
        if (code === 1500040) {
          const rewardFloor = Math.floor(towerId / 10);
          ctx.log(
            `上座塔奖励未领取，尝试领取第 ${rewardFloor} 层奖励`,
            "warning",
          );
          if (rewardFloor > 0) {
            try {
              await ctx.send("tower_claimreward", {
                rewardId: rewardFloor,
              });
            } catch {
              // 领奖失败则停止爬塔，交由上层记录
            }
          }
          await ctx.sleep(3000);
          const refreshed = (await readRole()) as {
            role?: { tower?: { id?: number; energy?: number } };
          };
          energy = Number(refreshed?.role?.tower?.energy ?? energy);
          towerId = Number(refreshed?.role?.tower?.id ?? towerId);
          continue;
        }
        throw error;
      }
    }

    return {
      status: "success",
      message: `爬塔完成，共 ${count} 次，剩余体力 ${energy}`,
    };
  },
};

const arena: ActionDefinition = {
  key: "arena",
  name: "竞技场",
  description: "打一场竞技场（6:00–22:00 之外跳过）",
  category: "副本",
  async run(ctx) {
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      return {
        status: "skipped",
        message: "当前时间不在 6:00–22:00，跳过竞技场",
      };
    }
    await ctx.send("arena_startarea");
    await ctx.sleep(ctx.commandDelay);

    const targets = await ctx.send("arena_getareatarget");
    await ctx.sleep(ctx.commandDelay);
    const targetId = pickArenaTargetId(targets);
    if (targetId === null) {
      return { status: "skipped", message: "未找到竞技场目标" };
    }
    await ctx.send("fight_startareaarena", { targetId }, 10_000);
    await ctx.sleep(ctx.commandDelay);
    return { status: "success", message: "竞技场战斗完成" };
  },
};

/** 日常执行结果（与 JS 版 runner 的返回结构对齐） */
interface DailySummary {
  completed?: number;
  skipped?: number;
  failed?: number;
  deferred?: number;
  incomplete?: number;
}

type DailyRunnerLike = {
  run: (
    roleId: string,
    callbacks: Record<string, unknown>,
    settings?: unknown,
  ) => Promise<DailySummary>;
};

/** 日常动作：移植旧项目「读官方配置 + 服务器状态补差」逻辑 */
const daily: ActionDefinition = {
  key: "daily",
  name: "日常",
  description: "按官方任务配置与服务器当前状态补做未完成的任务",
  category: "日常",
  async run(ctx) {
    const adapter = createRunnerAdapter(ctx);
    // JS 版 runner 没有可用的类型声明，这里按实际使用面收窄
    const Runner = DailyTaskRunner as unknown as new (
      store: unknown,
      delays: unknown,
      options?: unknown,
    ) => DailyRunnerLike;
    const runner = new Runner(
      adapter,
      {
        commandDelay: ctx.commandDelay,
        taskDelay: ctx.taskDelay,
      },
      {
        settingsProvider: () => null,
      },
    );

    const summary = await runner.run(ctx.role.id, {
      onLog: (entry: {
        time: string;
        message: string;
        type: "info" | "success" | "warning" | "error";
      }) => {
        ctx.log(entry.message, entry.type);
      },
      onTaskStates: (tasks: unknown) => {
        saveDailyStatus(
          ctx.role.id,
          tasks as Parameters<typeof saveDailyStatus>[1],
        );
      },
      shouldStop: () => false,
    });

    const failed = summary?.failed ?? 0;
    const incomplete = summary?.incomplete ?? 0;
    if (failed > 0) {
      return {
        status: "failed",
        message: `日常执行完成，${failed} 个步骤失败，${incomplete} 个未确认`,
      };
    }
    return {
      status: "success",
      message:
        incomplete > 0
          ? `日常执行完成，${incomplete} 个步骤未确认完成`
          : "日常执行完成",
    };
  },
};

/**
 * 为 DailyTaskRunner 提供它要求的 tokenStore 形状。
 * 只实现 runner 实际使用的方法，底层是单个 GameClient。
 */
function createRunnerAdapter(ctx: ActionContext) {
  const client = ctx.client;
  const roleId = ctx.role.id;
  const clientProxy = {
    get serverTime() {
      return client.serverTime ?? Date.now();
    },
  };
  return {
    gameTokens: [{ id: roleId, name: ctx.role.name }],
    get wsConnections() {
      return { [roleId]: { client: clientProxy } };
    },
    getWebSocketStatus() {
      return client.isConnected ? "connected" : "disconnected";
    },
    getServerTime() {
      return client.serverTime ?? Date.now();
    },
    sendMessageWithPromise(
      _tokenId: string,
      cmd: string,
      params: Record<string, unknown> = {},
      timeout = 8000,
    ) {
      return ctx.send(cmd, params, timeout);
    },
    sendGetRoleInfo(
      _tokenId: string,
      params: Record<string, unknown> = {},
    ) {
      return ctx.send(
        "role_getroleinfo",
        {
          clientVersion: ctx.settings.clientVersion,
          platform: ctx.settings.platform,
          ...params,
        },
        15_000,
      );
    },
  };
}

/** 第一版动作注册表 + 从原项目迁移的任务 */
export const ACTIONS: Record<string, ActionDefinition> = {
  daily,
  signIn,
  hangup,
  tower,
  arena,
  mail,
  legionSignIn,
  ...EXTRA_ACTIONS,
};

export const ACTION_ORDER = [
  "daily",
  "signIn",
  "hangup",
  "addHangUpTime",
  "mail",
  "legionSignIn",
  "collectionFree",
  "legacyClaim",
  "bottleReset",
  "bottleClaim",
  "tower",
  "arena",
  "arena3",
  "weirdTower",
  "dream",
  "campTasks",
  "openBox",
  "boxPoint",
  "recruit",
  "fish",
  "genieSweep",
  "freeEnergy",
  "legionStoreBuy",
];

/** 返回给前端的动作清单 */
export function listActions(): Array<{
  key: string;
  name: string;
  description: string;
  category: string;
}> {
  return ACTION_ORDER.map((key) => ({
    key,
    name: ACTIONS[key].name,
    description: ACTIONS[key].description,
    category: ACTIONS[key].category,
  }));
}

/** 按固定顺序排列并去重动作，日常永远排在最前 */
export function orderActionKeys(keys: string[]): string[] {
  const wanted = new Set(keys.filter((key) => key in ACTIONS));
  const ordered = ACTION_ORDER.filter((key) => wanted.has(key));
  return ordered.length > 0 ? ordered : ["daily"];
}

export { GameError };
