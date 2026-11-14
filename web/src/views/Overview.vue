<template>
  <div class="page">
    <div class="page-header">
      <h2>总览</h2>
      <n-button :loading="loading" @click="load">刷新</n-button>
    </div>

    <div class="stat-grid">
      <n-card size="small">
        <div class="muted">角色</div>
        <div class="stat-value">{{ roles.length }}</div>
        <div class="muted">
          启用 {{ enabledRoles }} · 失效 {{ invalidRoles }}
        </div>
      </n-card>
      <n-card size="small">
        <div class="muted">计划</div>
        <div class="stat-value">{{ enabledSchedules }}</div>
        <div class="muted">共 {{ schedules.length }} 个</div>
      </n-card>
      <n-card size="small">
        <div class="muted">今日运行</div>
        <div class="stat-value">{{ todayRuns.length }}</div>
        <div class="muted">
          成功 {{ todaySuccess }} · 失败 {{ todayFailed }}
        </div>
      </n-card>
      <n-card size="small">
        <div class="muted">下次运行</div>
        <div class="stat-value" style="font-size: 18px">
          {{ nextRunText }}
        </div>
        <div class="muted">{{ nextRunName }}</div>
      </n-card>
    </div>

    <n-card size="small" title="最近运行">
      <n-data-table
        :columns="columns"
        :data="runs"
        :bordered="false"
        size="small"
        :row-key="(row: RunView) => row.id"
        @update:checked-row-keys="() => undefined"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";
import {
  NCard,
  NDataTable,
  NButton,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import {
  api,
  formatTime,
  type RoleView,
  type RunView,
  type ScheduleView,
} from "../api";

const message = useMessage();
const loading = ref(false);
const roles = ref<RoleView[]>([]);
const schedules = ref<ScheduleView[]>([]);
const runs = ref<RunView[]>([]);

const enabledRoles = computed(
  () => roles.value.filter((role) => role.enabled).length,
);
const invalidRoles = computed(
  () => roles.value.filter((role) => role.credentialStatus === "invalid").length,
);
const enabledSchedules = computed(
  () => schedules.value.filter((item) => item.enabled).length,
);

const todayRuns = computed(() => {
  const today = new Date().toDateString();
  return runs.value.filter(
    (run) => new Date(run.startedAt).toDateString() === today,
  );
});
const todaySuccess = computed(
  () =>
    todayRuns.value.filter((run) => run.status === "success").length,
);
const todayFailed = computed(
  () => todayRuns.value.filter((run) => run.status === "failed").length,
);

const nextSchedule = computed(() => {
  const upcoming = schedules.value
    .filter((item) => item.enabled && item.nextRunAt)
    .sort((a, b) =>
      String(a.nextRunAt).localeCompare(String(b.nextRunAt)),
    );
  return upcoming[0] ?? null;
});
const nextRunText = computed(() =>
  nextSchedule.value ? formatTime(nextSchedule.value.nextRunAt) : "—",
);
const nextRunName = computed(() => nextSchedule.value?.name ?? "");

const statusMeta: Record<
  string,
  { text: string; type: "success" | "warning" | "error" | "info" | "default" }
> = {
  running: { text: "运行中", type: "info" },
  success: { text: "成功", type: "success" },
  partial: { text: "部分失败", type: "warning" },
  failed: { text: "失败", type: "error" },
  skipped: { text: "已跳过", type: "default" },
};

const columns: DataTableColumns<RunView> = [
  {
    title: "开始时间",
    key: "startedAt",
    width: 170,
    render: (row) => formatTime(row.startedAt),
  },
  {
    title: "计划",
    key: "scheduleName",
    render: (row) => row.scheduleName ?? triggerText(row.trigger),
  },
  {
    title: "状态",
    key: "status",
    width: 110,
    render: (row) => {
      const meta = statusMeta[row.status] ?? statusMeta.running;
      return h(NTag, { type: meta.type, size: "small" }, () => meta.text);
    },
  },
  {
    title: "成功/失败/跳过",
    key: "counts",
    width: 150,
    render: (row) =>
      `${row.successCount} / ${row.failedCount} / ${row.skippedCount}`,
  },
  {
    title: "耗时",
    key: "duration",
    width: 100,
    render: (row) =>
      row.finishedAt
        ? `${Math.max(
            0,
            Math.round(
              (new Date(row.finishedAt).getTime() -
                new Date(row.startedAt).getTime()) /
                1000,
            ),
          )}s`
        : "—",
  },
];

function triggerText(trigger: string): string {
  if (trigger === "scheduled") return "定时触发";
  if (trigger === "manual") return "手动执行";
  if (trigger === "manual-role") return "角色手动";
  return trigger;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [roleResult, scheduleResult, runResult] = await Promise.all([
      api.get<{ roles: RoleView[] }>("/api/roles"),
      api.get<{ schedules: ScheduleView[] }>("/api/schedules"),
      api.get<{ runs: RunView[] }>("/api/runs?limit=30"),
    ]);
    roles.value = roleResult.roles;
    schedules.value = scheduleResult.schedules;
    runs.value = runResult.runs;
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
