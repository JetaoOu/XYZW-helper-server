import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../config.js";
import * as schema from "./schema.js";

// 建表语句：启动时执行，幂等
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  group_id TEXT,
  name TEXT NOT NULL,
  server TEXT,
  server_id TEXT,
  game_role_id TEXT,
  avatar TEXT,
  credential_enc TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  credential_tag TEXT NOT NULL,
  credential_hash TEXT,
  import_method TEXT NOT NULL,
  source_url TEXT,
  bin_blob TEXT,
  bin_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  credential_status TEXT NOT NULL DEFAULT 'valid',
  credential_error TEXT,
  credential_updated_at TEXT,
  last_snapshot_json TEXT,
  last_snapshot_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  action_keys TEXT NOT NULL,
  group_ids TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule_roles (
  schedule_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (schedule_id, role_id)
);
CREATE TABLE IF NOT EXISTS role_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#1677ff',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT,
  owner_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE IF NOT EXISTS run_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_name TEXT,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  message TEXT,
  gain_json TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  role_id TEXT,
  cmd TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  message TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS run_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  role_id TEXT,
  role_name TEXT,
  action_key TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_daily_status (
  role_id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resource_snapshots (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  run_id TEXT,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_results_run ON run_results(run_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_run ON run_logs(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_run_logs_created ON run_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_role ON resource_snapshots(role_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_logs_created ON command_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;

/** 为旧数据库补充新增列（幂等） */
function ensureColumn(
  table: string,
  column: string,
  definition: string,
): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export const sqlite = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(SCHEMA_SQL);
ensureColumn("roles", "server_id", "TEXT");
ensureColumn("roles", "credential_hash", "TEXT");
ensureColumn("roles", "group_id", "TEXT");
ensureColumn("run_results", "gain_json", "TEXT");
ensureColumn("schedules", "group_ids", "TEXT NOT NULL DEFAULT '[]'");
sqlite.exec(
  "CREATE INDEX IF NOT EXISTS idx_roles_group ON roles(owner_id, group_id)",
);
sqlite.exec(
  "CREATE INDEX IF NOT EXISTS idx_roles_game_role ON roles(owner_id, game_role_id)",
);
sqlite.exec(
  "CREATE INDEX IF NOT EXISTS idx_roles_credential_hash ON roles(owner_id, credential_hash)",
);

export const db = drizzle(sqlite, { schema });

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
