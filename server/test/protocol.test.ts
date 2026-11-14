import test from "node:test";
import assert from "node:assert/strict";
import {
  bon,
  encode,
  getEnc,
  parse,
} from "../src/protocol/bonProtocol.js";

test("BON 编解码往返保持结构", () => {
  const value = {
    a: 1,
    b: "文本",
    c: [1, 2, 3],
    d: { nested: true, ratio: 0.5 },
    e: null,
  };
  const bytes = bon.encode(value) as Uint8Array;
  const decoded = bon.decode(bytes);
  assert.deepEqual(decoded, value);
});

test("加密通道 encode/parse 往返", () => {
  const raw = {
    cmd: "role_getroleinfo",
    ack: 0,
    seq: 1,
    time: Date.now(),
    body: bon.encode({ clientVersion: "test" }),
  };
  const packet = encode(raw, getEnc("x"));
  const message = parse(packet, getEnc("auto"));
  assert.equal(message.cmd, "role_getroleinfo");
  assert.equal(message.seq, 1);
  assert.deepEqual(message.rawData, { clientVersion: "test" });
});
