import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "../config.js";

// 用 CREDENTIAL_SECRET 派生 32 字节密钥；支持 hex 或任意字符串
const key = createHash("sha256")
  .update(config.credentialSecret, "utf8")
  .digest();

export interface EncryptedCredential {
  enc: string;
  iv: string;
  tag: string;
}

/**
 * 加密游戏凭据（AES-256-GCM）。
 * 密钥丢失后无法解密，这是有意的取舍：数据库或备份泄露也不会直接暴露账号。
 */
export function encryptCredential(plain: string): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  return {
    enc: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** 解密游戏凭据；数据被篡改或密钥不匹配时抛错 */
export function decryptCredential(
  payload: EncryptedCredential,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.enc, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
