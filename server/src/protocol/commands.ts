// 协议常量：命令默认参数、响应匹配、错误码分类

/** 错误码 → 可读描述（沿用旧项目） */
export const ERROR_CODE_MAP: Record<number, string> = {
  700010: "任务未达成完成条件",
  1400010: "没有购买该月卡，不能领取每日奖励",
  12000116: "今日已领取免费奖励",
  3300060: "扫荡条件不满足",
  1300050: "请修改您的采购次数",
  200020: "出了点小问题，请尝试重启游戏解决～",
  200160: "模块未开启",
  7500140: "请先输入密码",
  7500100: "密码输入错误",
  7500120: "密码输入错误次数已达上限",
  200400: "操作太快，请稍后再试",
  200760: "您当前看到的界面已发生变化，请重新登录",
  2300190: "今天已经签到过了",
  2300370: "俱乐部商品购买数量超出上限",
  400000: "物品不存在",
  1500020: "能量不足",
  2300070: "未加入俱乐部",
  3500020: "没有可领取的奖励",
  400190: "没有可领取的签到奖励",
  1000020: "今天已经领取过奖励了",
  3300050: "购买数量超出限制",
  700020: "已经领取过这个任务",
  12400000: "挂机奖励领取过于频繁",
  2300250: "俱乐部BOSS今日攻打次数已用完",
  400010: "物品数量不足",
  7900023: "已达到使用次数上限",
  12300040: "没有空格子了",
  12300080: "未达到解锁条件",
  200330: "无效的ID",
  1500040: "上座塔的奖励未领取",
  1500010: "已经全部通关",
  4800080: "不在规定时间内或未到报名阶段",
  4800040: "俱乐部没有报名",
  2100010: "活动未开放",
  12200020: "怪异塔存在未领取的章节奖励",
  1300040: "模块未解锁（黑市等）",
  400060: "未进阶，不能升级主公",
  400070: "未到进阶等级，不能进阶",
  400090: "咸将等级不能大于主公等级",
  400130: "咸将等阶不能大于主公等阶",
};

/**
 * 业务性"已完成"错误码：命中时视为已完成，不算失败。
 * 这些结果等于"这件事已经做过了"，重复执行是安全的。
 */
export const BENIGN_CODES = new Set([
  2300190, // 今天已经签到过了
  1000020, // 今天已经领取过奖励了
  700020, // 已经领取过这个任务
  12000116, // 今日已领取免费奖励
  3500020, // 没有可领取的奖励
  400190, // 没有可领取的签到奖励
  1500010, // 已经全部通关
  7900023, // 已达到使用次数上限
  3300050, // 购买数量超出限制
  2300370, // 俱乐部商品购买数量超出上限
  2300250, // 俱乐部BOSS今日攻打次数已用完
]);

/**
 * "暂不可用"错误码：模块未解锁、活动未开放、资源不足等。
 * 这不是任务失败，本次跳过即可，下次满足条件时会正常执行。
 */
export const UNAVAILABLE_CODES = new Set([
  200160, // 模块未开启
  200020, // 出了点小问题，请尝试重启游戏解决
  1300040, // 模块未解锁（黑市等）
  12300080, // 未达到解锁条件
  2100010, // 活动未开放
  4800080, // 不在规定时间内或未到报名阶段
  4800040, // 俱乐部没有报名
  2300070, // 未加入俱乐部
  1400010, // 没有购买月卡，领取不了
  1500020, // 能量不足
  400010, // 物品数量不足
  12300040, // 没有空格子了
  3300060, // 扫荡条件不满足
  400060, // 主公未进阶，暂时无法继续升级
  400070, // 未到进阶等级，暂时无法进阶
  400090, // 咸将等级不能大于主公等级
  400130, // 咸将等阶不能大于主公等阶
]);

/** 瞬时错误：可以重试一次 */
export const RETRYABLE_CODES = new Set([
  200400, // 操作太快
  12400000, // 领取过于频繁
]);

export type ErrorKind = "skip" | "unavailable" | "retry" | "fail";

/** 根据错误码分类执行结果 */
export function classifyErrorCode(code: number | undefined): ErrorKind {
  if (code === undefined) return "fail";
  if (BENIGN_CODES.has(code)) return "skip";
  if (UNAVAILABLE_CODES.has(code)) return "unavailable";
  if (RETRYABLE_CODES.has(code)) return "retry";
  return "fail";
}

/** 战斗类命令需要自动注入 battleVersion */
export const BATTLE_COMMANDS = new Set([
  "fight_startareaarena",
  "fight_startpvp",
  "fight_starttower",
  "fight_startboss",
  "fight_startlegionboss",
  "fight_startdungeon",
  "fight_level",
]);

/** 命令默认参数：发送时与调用方参数合并 */
export const CMD_DEFAULTS: Record<string, Record<string, unknown>> = {
  role_getroleinfo: {
    clientVersion: "2.21.2-fa918e1997301834-wx",
    inviteUid: 0,
    platform: "hortor",
    platformExt: "mix",
    scene: "",
  },
  system_getdatabundlever: { isAudit: false },
  system_buygold: { buyNum: 1 },
  system_claimhangupreward: {},
  system_hangupupgrade: { upgradeNum: 1 },
  system_signinreward: {},
  system_mysharecallback: { isSkipShareCard: true, type: 2 },
  system_custom: { key: "", value: 0 },
  system_claimcdkreward: { key: "", platformType: "h5" },

  task_claimdailypoint: { taskId: 1 },
  task_claimdailyreward: { rewardId: 0 },
  task_claimweekreward: { rewardId: 0 },

  friend_batch: { friendId: 0 },
  hero_recruit: { byClub: false, recruitNumber: 1, recruitType: 3 },
  item_openbox: { itemId: 2001, number: 10 },
  item_batchclaimboxpointreward: {},
  item_openpack: {},
  item_consume: {},

  arena_startarea: {},
  arena_getareatarget: { refresh: false },
  arena_getarearank: {},
  fight_startlevel: {},
  fight_calcleveltime: {},
  fight_starttower: {},
  fight_startboss: {},
  fight_startlegionboss: {},
  fight_startdungeon: {},
  fight_startpvp: {},

  store_goodslist: { storeId: 1 },
  store_buy: { goodsId: 1 },
  store_purchase: { goodsId: 1 },
  store_refresh: { storeId: 1 },
  store_getpurchase: {},

  legion_getinfo: {},
  legion_signin: {},
  legion_getwarrank: {},

  mail_getlist: { category: [0, 4, 5], lastId: 0, size: 60 },
  mail_claimallattachment: { category: 0 },

  bottlehelper_claim: {},
  bottlehelper_start: { bottleType: -1 },
  bottlehelper_stop: { bottleType: -1 },

  artifact_lottery: { lotteryNumber: 1, newFree: true, type: 1 },

  genie_sweep: { genieId: 1 },
  genie_buysweep: {},

  discount_claimreward: { discountId: 1 },
  collection_claimfreereward: {},
  collection_goodslist: {},
  card_claimreward: { cardId: 1 },

  gacha_drawreward: { num: 1, isGroup: false },

  tower_getinfo: {},
  tower_claimreward: {},

  presetteam_getinfo: {},
  presetteam_setteam: {},
  presetteam_saveteam: { teamId: 1 },
  role_gettargetteam: {},

  dungeon_selecthero: {},
  activity_recyclewarorderrewardclaim: { actId: 1 },
  activity_get: {},

  legacy_getinfo: {},
  legacy_claimhangup: {},

  bosstower_getinfo: {},
  bosstower_startboss: {},
  bosstower_startbox: {},
  matchteam_getroleteaminfo: {},

  // 怪异塔
  evotower_getinfo: {},
  evotower_fight: { battleNum: 1, winNum: 1 },
  evotower_readyfight: {},
  evotower_claimreward: {},
  evotower_claimtask: { taskId: 1 },

  // 营地挑战
  club_getinfo: {},
  club_taskclaim: { confId: 1 },
  club_attack: {},
  club_attackmonster: {},
  club_gettargetteam: {},

  // 军团商店
  legion_storebuygoods: { id: 6 },
};

/** 响应命令 → 原始请求命令（兼容按 cmd 匹配的旧协议） */
export const RESP_MAP: Record<string, string | string[]> = {
  role_getroleinforesp: "role_getroleinfo",
  system_claimhanguprewardresp: "system_claimhangupreward",
  system_signinrewardresp: "system_signinreward",
  system_getdatabundleverresp: "system_getdatabundlever",
  system_mysharecallbackresp: "system_mysharecallback",
  task_claimdailyrewardresp: "task_claimdailyreward",
  task_claimdailypointresp: "task_claimdailypoint",
  task_claimweekrewardresp: "task_claimweekreward",
  tower_getinforesp: "tower_getinfo",
  tower_claimrewardresp: "tower_claimreward",
  evotower_claimrewardresp: "evotower_claimreward",
  arena_startarearesp: "arena_startarea",
  arena_getareatargetresp: "arena_getareatarget",
  arena_getarearankresp: "arena_getarearank",
  fight_startareaarenaresp: "fight_startareaarena",
  fight_startlevelresp: "fight_startlevel",
  fight_calcleveltimeresp: "fight_calcleveltime",
  fight_levelresp: "fight_level",
  fight_starttowerresp: "fight_starttower",
  fight_startbossresp: "fight_startboss",
  fight_startlegionbossresp: "fight_startlegionboss",
  fight_startdungeonresp: "fight_startdungeon",
  fight_startpvpresp: "fight_startpvp",
  item_openboxresp: ["item_openbox", "item_batchclaimboxpointreward"],
  item_openpackresp: "item_openpack",
  item_consumeresp: "item_consume",
  bottlehelper_claimresp: "bottlehelper_claim",
  bottlehelper_startresp: "bottlehelper_start",
  bottlehelper_stopresp: "bottlehelper_stop",
  legacy_getinforesp: "legacy_getinfo",
  legacy_claimhangupresp: "legacy_claimhangup",
  hero_recruitresp: "hero_recruit",
  friend_batchresp: "friend_batch",
  fight_startareanaresp: "arena_startarea",
  store_buyresp: "store_purchase",
  store_getpurchaseresp: "store_getpurchase",
  legion_getinforesp: "legion_getinfo",
  legion_signinresp: "legion_signin",
  mail_claimallattachmentresp: "mail_claimallattachment",
  presetteam_getinforesp: "presetteam_getinfo",
  presetteam_saveteamresp: "presetteam_saveteam",
  artifact_lotteryresp: "artifact_lottery",
  genie_sweepresp: "genie_sweep",
  genie_buysweepresp: "genie_buysweep",
  discount_claimrewardresp: "discount_claimreward",
  collection_goodslistresp: "collection_goodslist",
  collection_claimfreerewardresp: "collection_claimfreereward",
  card_claimrewardresp: "card_claimreward",
  gacha_drawrewardresp: "gacha_drawreward",
  activity_recyclewarorderrewardclaimresp:
    "activity_recyclewarorderrewardclaim",
  activity_getresp: "activity_get",
  bosstower_getinforesp: "bosstower_getinfo",
  bosstower_startbossresp: "bosstower_startboss",
  bosstower_startboxresp: "bosstower_startbox",
  evotower_readyfightresp: "evotower_readyfight",
  evotower_claimtaskresp: "evotower_claimtask",
  club_getinforesp: "club_getinfo",
  club_taskclaimresp: "club_taskclaim",
  club_attackresp: "club_attack",
  club_attackmonsterresp: "club_attackmonster",
  club_gettargetteamresp: "club_gettargetteam",
  legion_storebuygoodsresp: "legion_storebuygoods",
  item_batchclaimboxpointrewardresp: "item_batchclaimboxpointreward",
  matchteam_getroleteaminforesp: "matchteam_getroleteaminfo",
  dungeon_selectheroresp: "dungeon_selecthero",
  studyresp: "study_startgame",
  syncrewardresp: [
    "system_buygold",
    "system_signinreward",
    "discount_claimreward",
  ],
  syncpushresp: ["system_mysharecallback"],
};
