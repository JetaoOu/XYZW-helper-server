import test from "node:test";
import assert from "node:assert/strict";
import { computeNextRun, validateCron } from "../src/core/cron.js";

test("合法的 cron 表达式被接受", () => {
  assert.equal(validateCron("0 8 * * *"), true);
  assert.equal(validateCron("*/15 * * * *"), true);
});

test("非法 cron 表达式被拒绝", () => {
  assert.equal(validateCron("not-a-cron"), false);
  assert.equal(validateCron(""), false);
});

test("按 Asia/Shanghai 计算下一次运行时间", () => {
  // 2026-11-13 16:00 UTC == 2026-11-14 00:00 Asia/Shanghai
  const next = computeNextRun(
    "0 8 * * *",
    new Date("2026-11-13T16:00:00.000Z"),
  );
  assert.equal(next, "2026-11-14T00:00:00.000Z");
});

test("非法表达式不返回时间", () => {
  assert.equal(computeNextRun("bad"), null);
});
