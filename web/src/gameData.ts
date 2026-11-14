// 游戏静态数据：英雄字典与物品映射，提取自旧项目 xyzw_web_helper

export const HERO_DICT: Record<
  number,
  { name: string; type?: string; avatar?: string }
> = {
  101: { name: "司马懿", type: "魏国", avatar: "/team/simayi.png" },
  102: { name: "郭嘉", type: "魏国", avatar: "/team/guojia.png" },
  103: { name: "关羽", type: "蜀国", avatar: "/team/guanyu.png" },
  104: { name: "诸葛亮", type: "蜀国", avatar: "/team/zhugeliang.png" },
  105: { name: "周瑜", type: "吴国", avatar: "/team/zhouyu.png" },
  106: { name: "太史慈", type: "吴国", avatar: "/team/taishici.png" },
  107: { name: "吕布", type: "群雄", avatar: "/team/lvbu.png" },
  108: { name: "华佗", type: "群雄", avatar: "/team/huatuo.png" },
  109: { name: "甄姬", type: "魏国", avatar: "/team/zhenji.png" },
  110: { name: "黄月英", type: "蜀国", avatar: "/team/huangyueying.png" },
  111: { name: "孙策", type: "吴国", avatar: "/team/sunce.png" },
  112: { name: "贾诩", type: "群雄", avatar: "/team/jiaxu.png" },
  113: { name: "曹仁", type: "魏国", avatar: "/team/caoren.png" },
  114: { name: "姜维", type: "蜀国", avatar: "/team/jiangwei.png" },
  115: { name: "孙坚", type: "吴国", avatar: "/team/sunjian.png" },
  116: { name: "公孙瓒", type: "群雄", avatar: "/team/gongsunzan.png" },
  117: { name: "典韦", type: "魏国", avatar: "/team/dianwei.png" },
  118: { name: "赵云", type: "蜀国", avatar: "/team/zhaoyun.png" },
  119: { name: "大乔", type: "吴国", avatar: "/team/daqiao.png" },
  120: { name: "张角", type: "群雄", avatar: "/team/zhangjiao.png" },
  121: { name: "鲁肃", type: "吴国", avatar: "/team/lusu.png" },
  201: { name: "徐晃", type: "魏国", avatar: "/team/xuhuang.png" },
  202: { name: "荀彧", type: "魏国", avatar: "/team/xunyu.png" },
  203: { name: "典韦", type: "魏国", avatar: "/team/xiaodianwei.png" },
  204: { name: "张飞", type: "蜀国", avatar: "/team/zhangfei.png" },
  205: { name: "赵云", type: "蜀国", avatar: "/team/xiaozhaoyun.png" },
  206: { name: "庞统", type: "蜀国", avatar: "/team/pangtong.png" },
  207: { name: "鲁肃", type: "吴国", avatar: "/team/xiaolusu.png" },
  208: { name: "陆逊", type: "吴国", avatar: "/team/luxun.png" },
  209: { name: "甘宁", type: "吴国", avatar: "/team/ganning.png" },
  210: { name: "貂蝉", type: "群雄", avatar: "/team/diaochan.png" },
  211: { name: "董卓", type: "群雄", avatar: "/team/dongzhuo.png" },
  212: { name: "张角", type: "群雄", avatar: "/team/xiaozhangjiao.png" },
  213: { name: "张辽", type: "魏国", avatar: "/team/zhangliao.png" },
  214: { name: "夏侯惇", type: "魏国", avatar: "/team/xiahoudun.png" },
  215: { name: "许褚", type: "魏国", avatar: "/team/xuzhu.png" },
  216: { name: "夏侯渊", type: "魏国", avatar: "/team/xiahouyuan.png" },
  217: { name: "魏延", type: "蜀国", avatar: "/team/weiyan.png" },
  218: { name: "黄忠", type: "蜀国", avatar: "/team/huangzhong.png" },
  219: { name: "马超", type: "蜀国", avatar: "/team/machao.png" },
  220: { name: "马岱", type: "蜀国", avatar: "/team/madai.png" },
  221: { name: "吕蒙", type: "吴国", avatar: "/team/lvmeng.png" },
  222: { name: "黄盖", type: "吴国", avatar: "/team/huanggai.png" },
  223: { name: "蔡文姬", type: "魏国", avatar: "/team/caiwenji.png" },
  224: { name: "小乔", type: "吴国", avatar: "/team/xiaoqiao.png" },
  225: { name: "袁绍", type: "群雄", avatar: "/team/yuanshao.png" },
  226: { name: "华雄", type: "群雄", avatar: "/team/huaxiong.png" },
  227: { name: "颜良", type: "群雄", avatar: "/team/yanliang.png" },
  228: { name: "文丑", type: "群雄", avatar: "/team/wenchou.png" },
  301: { name: "周泰", type: "吴国", avatar: "/team/zhoutai.png" },
  302: { name: "许攸", type: "魏国", avatar: "/team/xuyou.png" },
  303: { name: "于禁", type: "魏国", avatar: "/team/yujin.png" },
  304: { name: "张星彩", type: "蜀国", avatar: "/team/zhangxingcai.png" },
  305: { name: "关银屏", type: "蜀国", avatar: "/team/guanyinping.png" },
  306: { name: "关平", type: "蜀国", avatar: "/team/guanping.png" },
  307: { name: "程普", type: "吴国", avatar: "/team/chengpu.png" },
  308: { name: "张昭", type: "吴国", avatar: "/team/zhangzhao.png" },
  309: { name: "陆绩", type: "吴国", avatar: "/team/luji.png" },
  310: { name: "吕玲绮", type: "群雄", avatar: "/team/lvlingqi.png" },
  311: { name: "潘凤", type: "群雄", avatar: "/team/panfeng.png" },
  312: { name: "邢道荣", type: "群雄", avatar: "/team/xingdaorong.png" },
  313: { name: "祝融夫人", type: "蜀国", avatar: "/team/zhurongfuren.png" },
  314: { name: "孟获", type: "蜀国", avatar: "/team/menghuo.png" },
};

export const LEGACY_COLORS: Record<
  number,
  { name: string; value: string }
> = {
  1: { name: "虾米", value: "green" },
  2: { name: "入门", value: "blue" },
  3: { name: "高手", value: "purple" },
  4: { name: "宗师", value: "orange" },
  5: { name: "泰斗", value: "red" },
  6: { name: "至尊", value: "gold" },
  7: { name: "珍·至尊", value: "gold" },
};

export interface ItemResourceDef {
  id: number;
  label: string;
}

/** 身份牌资源项，顺序沿用旧项目 IdentityCard */
export const ITEM_RESOURCES: ItemResourceDef[] = [
  { id: 1011, label: "普通鱼竿" },
  { id: 1012, label: "金鱼竿" },
  { id: 1013, label: "珍珠" },
  { id: 1017, label: "复活丹" },
  { id: 1001, label: "招募令" },
  { id: 1006, label: "精铁" },
  { id: 1023, label: "彩玉" },
  { id: 1003, label: "进阶石" },
  { id: 10002, label: "蓝玉" },
  { id: 10003, label: "红玉" },
  { id: 10101, label: "四圣宝珠碎片" },
  { id: 3001, label: "金币袋子" },
  { id: 3002, label: "金砖袋子" },
  { id: 3005, label: "紫色随机碎片" },
  { id: 3006, label: "橙色随机碎片" },
  { id: 3007, label: "红色随机碎片" },
  { id: 3008, label: "精铁袋子" },
  { id: 3009, label: "进阶袋子" },
  { id: 3010, label: "梦魇袋子" },
  { id: 3011, label: "白玉袋子" },
  { id: 3012, label: "扳手袋子" },
  { id: 3020, label: "聚宝盆" },
  { id: 3021, label: "豪华聚宝盆" },
  { id: 3201, label: "红色万能碎片" },
  { id: 3302, label: "橙色万能碎片" },
  { id: 1019, label: "盐靛" },
  { id: 1016, label: "晶石" },
  { id: 1020, label: "皮肤币" },
  { id: 1021, label: "扫荡魔毯" },
  { id: 1022, label: "白玉" },
  { id: 1033, label: "贝壳" },
  { id: 1035, label: "金盐靛" },
  { id: 1007, label: "竞技场门票" },
  { id: 2001, label: "木制宝箱" },
  { id: 2002, label: "青铜宝箱" },
  { id: 2003, label: "黄金宝箱" },
  { id: 2004, label: "铂金宝箱" },
  { id: 2005, label: "钻石宝箱" },
  { id: 35002, label: "刷新券" },
  { id: 35009, label: "零件" },
  { id: 1008, label: "木柴火把" },
  { id: 1009, label: "青铜火把" },
  { id: 1010, label: "咸神火把" },
  { id: 1014, label: "军团币" },
  { id: 1026, label: "扳手" },
  { id: 2101, label: "助威币" },
];

/** 从快照的 items 结构中读取某件物品的数量 */
export function getItemCount(items: unknown, id: number): number {
  if (!items) return 0;
  if (Array.isArray(items)) {
    const found = items.find(
      (it) =>
        Number(
          (it as Record<string, unknown>)?.id ??
            (it as Record<string, unknown>)?.itemId,
        ) === id,
    ) as Record<string, unknown> | undefined;
    if (!found) return 0;
    return Number(found.num ?? found.count ?? found.quantity ?? 0);
  }
  const map = items as Record<string, unknown>;
  const node = map[String(id)] ?? map[id];
  if (node == null) {
    const match = Object.values(map).find(
      (value) =>
        Number(
          (value as Record<string, unknown>)?.itemId ??
            (value as Record<string, unknown>)?.id,
        ) === id,
    ) as Record<string, unknown> | undefined;
    if (!match) return 0;
    return Number(match.num ?? match.count ?? match.quantity ?? 0);
  }
  if (typeof node === "number") return node;
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>;
    return Number(record.num ?? record.count ?? record.quantity ?? 0);
  }
  return Number(node) || 0;
}

/** 大数字格式化：亿 / 万 */
export function formatGameAmount(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const abs = Math.abs(num);
  if (abs >= 1e8) return (num / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return (num / 1e4).toFixed(2) + "万";
  return num.toLocaleString("zh-CN");
}

/** 资源 key（gold / diamond / item:<id>）转中文名 */
export function resourceKeyLabel(key: string): string {
  if (key === "gold") return "金币";
  if (key === "diamond") return "金砖";
  if (key.startsWith("item:")) {
    const id = Number(key.slice(5));
    return ITEM_RESOURCES.find((item) => item.id === id)?.label ?? `物品${id}`;
  }
  return key;
}

/** 三周循环活动：黑市周 → 招募周 → 宝箱周 */
export function getCurrentActivityWeek(now: Date = new Date()): string | null {
  const start = new Date("2025-12-12T12:00:00");
  const week = 7 * 24 * 60 * 60 * 1000;
  const cycle = 3 * week;
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 0) return null;
  const position = elapsed % cycle;
  if (position < week) return "黑市周";
  if (position < 2 * week) return "招募周";
  return "宝箱周";
}
