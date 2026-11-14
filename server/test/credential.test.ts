import test from "node:test";
import assert from "node:assert/strict";
import { g_utils } from "../src/protocol/bonProtocol.js";
import {
  buildRoleBin,
  deriveServerLabel,
  getBinPayload,
} from "../src/services/credential.js";

test("BIN 重新打包返回 ArrayBuffer 且可再次解析", () => {
  const original = g_utils.encode(
    { roleToken: "token", roleId: 1, serverId: 27 },
    "lx",
  ) as ArrayBuffer;
  const payload = getBinPayload(original);
  assert.equal(payload.serverId, 27);

  const rebuilt = buildRoleBin(payload, 28);
  assert.ok(rebuilt instanceof ArrayBuffer);
  assert.ok(rebuilt.byteLength > 0);

  const reparsed = getBinPayload(rebuilt);
  assert.equal(reparsed.serverId, 28);
  assert.equal(reparsed.roleToken, "token");
});

test("同一份 BIN 可以重复解析（解密不得破坏原数据）", () => {
  const bin = g_utils.encode(
    { roleToken: "token", roleId: 1, serverId: 27 },
    "lx",
  ) as ArrayBuffer;
  const first = getBinPayload(bin);
  const second = getBinPayload(bin);
  assert.equal(first.serverId, 27);
  assert.equal(second.serverId, 27);
  assert.equal(second.roleToken, "token");
});

test("BIN 内容为空时抛出明确错误", () => {
  assert.throws(() => getBinPayload(new ArrayBuffer(0)));
});

test("由 serverId 推导区服显示名", () => {
  // 与旧项目 BinTokenForm 的规则一致
  assert.equal(deriveServerLabel(1_023_158), "23131服");
  assert.equal(deriveServerLabel(1_000_027), "0服");
  assert.equal(deriveServerLabel(2_000_500), "473服");
  assert.equal(deriveServerLabel(500), "473服");
  assert.equal(deriveServerLabel(Number.NaN), null);
});
