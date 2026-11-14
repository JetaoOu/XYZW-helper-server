export interface RoleRecord {
  id: string;
  ownerId: string;
  groupId: string | null;
  name: string;
  server: string | null;
  serverId: string | null;
  gameRoleId: string | null;
  avatar: string | null;
  credential: string;
  credentialHash: string | null;
  importMethod: string;
  sourceUrl: string | null;
  binBase64: string | null;
  enabled: boolean;
  credentialStatus: "valid" | "invalid";
  credentialError: string | null;
  credentialUpdatedAt: string | null;
  lastSnapshotJson: string | null;
  lastSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRecord {
  id: string;
  ownerId: string;
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

export type ActionStatus = "success" | "completed" | "skipped" | "failed";

export interface ActionResult {
  status: ActionStatus;
  message?: string;
  errorCode?: number;
}

export type RunStatus =
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "skipped";

export type RunTrigger = "scheduled" | "manual" | "manual-role";
