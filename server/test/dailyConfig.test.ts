import test from "node:test";
import assert from "node:assert/strict";
import {
  getClaimablePointRewards,
  getDailyTaskStates,
  validateDailyTaskConfig,
} from "../src/daily/dailyTaskState.js";

const config = {
  DailyTaskConf: {
    1: { id: 1, completeCondition: 5, completeValue: 2 },
    2: { id: 2, completeCondition: 6, completeValue: 3 },
  },
  DayLimitConf: {
    1: { id: 1, limit: 10 },
    2: { id: 2, limit: 20 },
  },
  WeekLimitConf: {
    1: { id: 1, limit: 50 },
  },
  ConstantConf: { stayRewardTime: 60 },
};

test("官方配置校验通过并带出挂机间隔", () => {
  const validated = validateDailyTaskConfig(config);
  assert.equal(validated.tasks.length, 2);
  assert.equal(validated.dailyRewards.length, 2);
  assert.equal(validated.weeklyRewards.length, 1);
  assert.equal(validated.hangUpClaimInterval, 60_000);
});

test("缺少任务的配置会被拒绝", () => {
  assert.throws(() =>
    validateDailyTaskConfig({ DailyTaskConf: {}, DayLimitConf: {}, WeekLimitConf: {} }),
  );
});

test("任务状态区分已领奖、可领奖与未完成", () => {
  const validated = validateDailyTaskConfig(config);
  const states = getDailyTaskStates(
    {
      dailyTask: {
        dailyTime: 1_700_000_000,
        complete: { 5: -1, 6: 1 },
      },
    },
    validated,
  );
  const first = states.find((state) => state.condition === 5);
  const second = states.find((state) => state.condition === 6);
  assert.equal(first?.status, "claimed");
  assert.equal(second?.status, "pending");
  assert.equal(second?.remaining, 2);
});

test("服务器缺少任务进度时按 0 处理", () => {
  const validated = validateDailyTaskConfig(config);
  const states = getDailyTaskStates(
    { dailyTask: { dailyTime: 1, complete: {} } },
    validated,
  );
  assert.ok(states.every((state) => state.progress === 0));
  assert.ok(states.every((state) => state.status === "pending"));
});

test("只返回达到积分门槛且未领取的奖励", () => {
  const ids = getClaimablePointRewards(
    { dailyPoint: 25, dailyReward: { 1: true } },
    Object.values(config.DayLimitConf),
    false,
  );
  assert.deepEqual(ids, [2]);
});

test("积分奖励状态缺失时抛错", () => {
  assert.throws(() =>
    getClaimablePointRewards({}, Object.values(config.DayLimitConf), false),
  );
});
