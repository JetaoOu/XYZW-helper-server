import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptCredential,
  encryptCredential,
} from "../src/crypto/credentialCipher.js";

test("凭据可加密后解密恢复", () => {
  const plain = JSON.stringify({
    roleToken: "abc",
    roleId: 123,
    sessId: 1,
    connId: 2,
    isRestore: 0,
  });
  const encrypted = encryptCredential(plain);
  assert.notEqual(encrypted.enc, plain);
  assert.ok(encrypted.iv.length > 0);
  assert.ok(encrypted.tag.length > 0);
  assert.equal(decryptCredential(encrypted), plain);
});

test("密文被篡改时解密失败", () => {
  const encrypted = encryptCredential("secret");
  const tampered = {
    ...encrypted,
    enc: Buffer.from("tampered").toString("base64"),
  };
  assert.throws(() => decryptCredential(tampered));
});

test("相同明文每次得到不同密文（随机 IV）", () => {
  const first = encryptCredential("same");
  const second = encryptCredential("same");
  assert.notEqual(first.enc, second.enc);
  assert.notEqual(first.iv, second.iv);
});
