export interface RoleView {
  id: string;
  groupId: string | null;
  name: string;
  server: string | null;
  gameRoleId: string | null;
  avatar: string | null;
  importMethod: string;
  sourceUrl: string | null;
  enabled: boolean;
  credentialStatus: "valid" | "invalid";
  credentialError: string | null;
  credentialUpdatedAt: string | null;
  hasBin: boolean;
  credentialSummary: { roleId?: string | number; isRestore?: unknown } | null;
  snapshot: Record<string, unknown> | null;
  lastSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleView {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  actionKeys: string[];
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  roleIds: string[];
  groupIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RunView {
  id: string;
  scheduleId: string | null;
  scheduleName?: string | null;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  error: string | null;
}

export interface RunResultView {
  id: string;
  runId: string;
  roleId: string;
  roleName: string | null;
  actionKey: string;
  status: string;
  errorCode: string | null;
  message: string | null;
  gainJson: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ResourceDelta {
  key: string;
  start: number;
  end: number;
  delta: number;
}

export interface GrowthDay {
  date: string;
  baselineAt: string | null;
  endAt: string | null;
  deltas: ResourceDelta[];
}

export interface RunLogView {
  id: string;
  runId: string;
  roleId: string | null;
  roleName: string | null;
  actionKey: string | null;
  level: string;
  message: string;
  createdAt: string;
}

export interface ActionStatusView {
  actionKey: string;
  status: string;
  message: string | null;
  errorCode: string | null;
  createdAt: string;
}

export interface RoleLogEntry {
  id: string;
  level: string;
  message: string;
  actionKey: string | null;
  createdAt: string;
}

export interface RoleLogGroup {
  runId: string;
  status: string;
  trigger: string;
  startedAt: string;
  logs: RoleLogEntry[];
}

export interface DailyTaskStateView {
  id: number;
  condition: number;
  label: string;
  progress: number;
  required: number;
  remaining: number;
  status: "pending" | "claimable" | "claimed";
}

export interface DailyStatusView {
  updatedAt: string;
  tasks: DailyTaskStateView[];
}

export interface ActionMeta {
  key: string;
  name: string;
  description: string;
  category: string;
}

export interface GroupView {
  id: string;
  name: string;
  color: string;
  roleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  maxConcurrentRoles: number;
  connectionDelayMs: number;
  commandDelayMs: number;
  taskDelayMs: number;
  clientVersion: string;
  platform: string;
  credentialRefreshHours: number;
  webhookUrl: string;
}

export interface ApiError extends Error {
  status?: number;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  // 只有带 body 时才声明 JSON，否则 Fastify 会拒绝空的 JSON 请求体
  if (options.body !== undefined && options.body !== null) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers,
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    const error = new Error(
      (data as { error?: string } | null)?.error ||
        `请求失败（${response.status}）`,
    ) as ApiError;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export interface WechatQr {
  uuid: string;
  imageUrl: string;
}

export type WechatScanStatus = "waiting" | "scanned" | "confirmed" | "expired";

export interface WechatScanResult {
  status: WechatScanStatus;
  code?: string;
  nickname?: string;
}

export interface WechatRole {
  serverId: string;
  roleId: string | null;
  name: string;
  power: number | null;
  levelId: number | null;
  serverName: string | null;
}

export interface WechatSessionView {
  sessionId: string;
  nickname: string;
  roles: WechatRole[];
}
