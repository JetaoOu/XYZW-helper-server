import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// 用户（单用户场景下只有一条记录，owner_id 为将来扩展预留）
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

// 登录会话
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

// 账号分组
export const roleGroups = sqliteTable("role_groups", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#1677ff"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// 角色：一条记录持有加密后的游戏凭据
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  groupId: text("group_id"),
  name: text("name").notNull(),
  server: text("server"),
  serverId: text("server_id"),
  gameRoleId: text("game_role_id"),
  avatar: text("avatar"),
  credentialEnc: text("credential_enc").notNull(),
  credentialIv: text("credential_iv").notNull(),
  credentialTag: text("credential_tag").notNull(),
  credentialHash: text("credential_hash"),
  importMethod: text("import_method").notNull(),
  sourceUrl: text("source_url"),
  binBlob: text("bin_blob"),
  binName: text("bin_name"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  credentialStatus: text("credential_status").notNull().default("valid"),
  credentialError: text("credential_error"),
  credentialUpdatedAt: text("credential_updated_at"),
  lastSnapshotJson: text("last_snapshot_json"),
  lastSnapshotAt: text("last_snapshot_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// 计划：唯一的调度单元
export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  cronExpr: text("cron_expr").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  actionKeys: text("action_keys").notNull(),
  groupIds: text("group_ids").notNull().default("[]"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// 计划与角色的关联
export const scheduleRoles = sqliteTable(
  "schedule_roles",
  {
    scheduleId: text("schedule_id").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scheduleId, table.roleId] })],
);

// 运行：计划或手动触发的一次执行
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id"),
  ownerId: text("owner_id").notNull(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  successCount: integer("success_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  error: text("error"),
});

// 动作结果：一次运行中，某角色执行某动作的结果
export const runResults = sqliteTable("run_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  roleId: text("role_id").notNull(),
  roleName: text("role_name"),
  actionKey: text("action_key").notNull(),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  message: text("message"),
  gainJson: text("gain_json"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").notNull(),
});

// 命令级明细日志，保留 30 天
export const commandLogs = sqliteTable("command_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id"),
  roleId: text("role_id"),
  cmd: text("cmd").notNull(),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  message: text("message"),
  createdAt: text("created_at").notNull(),
});

// 运行日志：执行过程中的可读日志，供历史查看，保留 30 天
export const runLogs = sqliteTable("run_logs", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  roleId: text("role_id"),
  roleName: text("role_name"),
  actionKey: text("action_key"),
  level: text("level").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

// 角色最近一次的官方日常任务进度（结构化展示用）
export const roleDailyStatus = sqliteTable("role_daily_status", {
  roleId: text("role_id").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  payload: text("payload").notNull(),
});

// 角色资源快照：用于计算每日资源增长
export const resourceSnapshots = sqliteTable("resource_snapshots", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull(),
  runId: text("run_id"),
  source: text("source").notNull(),
  capturedAt: text("captured_at").notNull(),
  data: text("data").notNull(),
});

// 运行时设置（并发、间隔、协议参数等）
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
