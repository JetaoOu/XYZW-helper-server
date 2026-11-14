import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS,
  ACTION_ORDER,
  listActions,
  orderActionKeys,
} from "../src/actions/registry.js";

test("ACTION_ORDER 覆盖全部动作且无重复", () => {
  assert.equal(new Set(ACTION_ORDER).size, ACTION_ORDER.length);
  for (const key of ACTION_ORDER) {
    assert.ok(ACTIONS[key], `缺少动作定义: ${key}`);
  }
  for (const key of Object.keys(ACTIONS)) {
    assert.ok(ACTION_ORDER.includes(key), `动作未加入顺序: ${key}`);
  }
});

test("前端动作清单与注册表一致", () => {
  const list = listActions();
  assert.equal(list.length, ACTION_ORDER.length);
  for (const item of list) {
    assert.ok(item.name);
    assert.ok(item.description);
  }
});

test("计划中的动作按固定顺序排列", () => {
  const ordered = orderActionKeys(["fish", "daily", "tower", "unknown"]);
  assert.deepEqual(ordered, ["daily", "tower", "fish"]);
  assert.deepEqual(orderActionKeys([]), ["daily"]);
});
