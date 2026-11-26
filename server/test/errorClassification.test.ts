import test from "node:test";
import assert from "node:assert/strict";
import { classifyErrorCode } from "../src/protocol/commands.js";

test("已知业务错误归为跳过", () => {
  assert.equal(classifyErrorCode(2300190), "skip");
  assert.equal(classifyErrorCode(1000020), "skip");
  assert.equal(classifyErrorCode(700020), "skip");
});

test("限流类与临时性服务器错误归为可重试", () => {
  assert.equal(classifyErrorCode(200400), "retry");
  assert.equal(classifyErrorCode(12400000), "retry");
  assert.equal(classifyErrorCode(200350), "retry");
});

test("模块未解锁/未开放归为暂不可用", () => {
  assert.equal(classifyErrorCode(200160), "unavailable");
  assert.equal(classifyErrorCode(200020), "unavailable");
  assert.equal(classifyErrorCode(1300040), "unavailable");
  assert.equal(classifyErrorCode(12300080), "unavailable");
  assert.equal(classifyErrorCode(2100010), "unavailable");
});

test("未知错误与空错误归为失败", () => {
  assert.equal(classifyErrorCode(999999), "fail");
  assert.equal(classifyErrorCode(undefined), "fail");
});
