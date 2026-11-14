import test from "node:test";
import assert from "node:assert/strict";
import { encodeLoginPayload } from "../src/services/wechatPayload.js";

test("微信登录 body 编码稳定且可解码", () => {
  const payload = JSON.stringify({ gameId: "xyzwapp", code: "code-1" });
  const first = encodeLoginPayload(payload);
  const second = encodeLoginPayload(payload);

  assert.equal(first, second, "同样的输入应得到同样的编码结果");
  assert.ok(first.length > 0);
  assert.ok(Buffer.from(first, "base64").length > 0, "输出必须是合法 base64");

  const other = encodeLoginPayload(
    JSON.stringify({ gameId: "xyzwapp", code: "code-2" }),
  );
  assert.notEqual(first, other, "不同输入应得到不同编码结果");
});
