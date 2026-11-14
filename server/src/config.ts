import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(import.meta.dirname, "../../.env"),
];
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`缺少必需的环境变量 ${name}`);
  }
  return value;
}

const databasePath = path.resolve(
  process.env.DATABASE_PATH || "./data/xyzw.db",
);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const config = {
  port: Number.parseInt(process.env.PORT || "3000", 10),
  databasePath,
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: required(
    "ADMIN_PASSWORD",
    process.env.NODE_ENV === "production" ? undefined : "change-me-please",
  ),
  credentialSecret: required(
    "CREDENTIAL_SECRET",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ),
  sessionDays: Number.parseInt(process.env.SESSION_DAYS || "30", 10),
  dataDir: path.dirname(databasePath),
  webDist: path.resolve(import.meta.dirname, "../../web/dist"),
  timezone: "Asia/Shanghai",
};
