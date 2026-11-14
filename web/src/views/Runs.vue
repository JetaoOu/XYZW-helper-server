<template>
  <div class="page">
    <div class="page-header">
      <h2>运行记录</h2>
      <n-space>
        <n-button @click="load" :loading="loading">刷新</n-button>
      </n-space>
    </div>

    <n-card size="small">
      <n-data-table
        :columns="columns"
        :data="runs"
        :bordered="false"
        size="small"
        :row-key="(row: RunView) => row.id"
      />
    </n-card>

    <n-drawer v-model:show="showDetail" :width="680" placement="right">
      <n-drawer-content title="运行详情" closable>
        <template v-if="detail">
          <n-descriptions :column="2" size="small" bordered>
            <n-descriptions-item label="计划">
              {{ detail.scheduleName ?? triggerText(detail.trigger) }}
            </n-descriptions-item>
            <n-descriptions-item label="状态">
              <n-tag :type="statusMeta[detail.status]?.type ?? 'default'" size="small">
                {{ statusMeta[detail.status]?.text ?? detail.status }}
              </n-tag>
            </n-descriptions-item>
            <n-descriptions-item label="开始">
              {{ formatTime(detail.startedAt) }}
            </n-descriptions-item>
            <n-descriptions-item label="结束">
              {{ formatTime(detail.finishedAt) }}
            </n-descriptions-item>
            <n-descriptions-item label="成功 / 失败 / 跳过">
              {{ detail.successCount }} / {{ detail.failedCount }} /
              {{ detail.skippedCount }}
            </n-descriptions-item>
            <n-descriptions-item label="错误">
              {{ detail.error ?? "—" }}
            </n-descriptions-item>
          </n-descriptions>

          <n-divider>执行日志</n-divider>
          <div ref="logBox" class="log-list">
            <div
              v-for="(line, index) in logs"
              :key="line.id ?? `${line.at}-${index}`"
              class="log-line"
              :class="line.level"
            >
              [{{ new Date(line.at).toLocaleTimeString("zh-CN", { hour12: false }) }}]
              <span v-if="line.roleName">{{ line.roleName }} · </span>
              {{ line.message }}
            </div>
            <div v-if="logs.length === 0" class="muted">
              {{
                detail.status === "running"
                  ? "等待日志…"
                  : "该运行没有保存日志（可能是旧版本记录的运行）"
              }}
            </div>
          </div>

          <n-divider>动作结果</n-divider>
          <n-data-table
            :columns="resultColumns"
            :data="results"
            :bordered="false"
            size="small"
            :row-key="(row: RunResultView) => row.id"
          />
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { h, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NDrawer,
  NDrawerContent,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import {
  api,
  formatTime,
  type RunLogView,
  type RunResultView,
  type RunView,
} from "../api";
import { formatGameAmount, resourceKeyLabel } from "../gameData";

interface LogLine {
  id?: string;
  at: string;
  level: string;
  message: string;
  roleName?: string | null;
  actionKey?: string | null;
}

const message = useMessage();
const route = useRoute();

const runs = ref<RunView[]>([]);
const results = ref<RunResultView[]>([]);
const logs = ref<LogLine[]>([]);
const loading = ref(false);
const showDetail = ref(false);
const detail = ref<RunView | null>(null);
const logBox = ref<HTMLElement | null>(null);

let source: EventSource | null = null;

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

const resultStatus: Record<string, { text: string; type: "success" | "warning" | "error" }> = {
  success: { text: "成功", type: "success" },
  completed: { text: "已完成", type: "success" },
  skipped: { text: "跳过", type: "warning" },
  failed: { text: "失败", type: "error" },
};

function triggerText(trigger: string): string {
  if (trigger === "scheduled") return "定时触发";
  if (trigger === "manual") return "手动执行";
  if (trigger === "manual-role") return "角色手动";
  return trigger;
}

const columns: DataTableColumns<RunView> = [
  {
    title: "开始时间",
    key: "startedAt",
    width: 170,
    render: (row) => formatTime(row.startedAt),
  },
  {
    title: "计划 / 触发",
    key: "scheduleName",
    minWidth: 150,
    render: (row) => row.scheduleName ?? triggerText(row.trigger),
  },
  {
    title: "状态",
    key: "status",
    width: 100,
    render: (row) =>
      h(
        NTag,
        { type: statusMeta[row.status]?.type ?? "default", size: "small" },
        () => statusMeta[row.status]?.text ?? row.status,
      ),
  },
  {
    title: "成功 / 失败 / 跳过",
    key: "counts",
    width: 150,
    render: (row) =>
      `${row.successCount} / ${row.failedCount} / ${row.skippedCount}`,
  },
  {
    title: "操作",
    key: "actions",
    width: 90,
    render: (row) =>
      h(
        NButton,
        { size: "tiny", onClick: () => openDetail(row.id) },
        () => "查看",
      ),
  },
];

const resultColumns: DataTableColumns<RunResultView> = [
  {
    title: "角色",
    key: "roleName",
    width: 120,
    render: (row) => row.roleName ?? row.roleId,
  },
  { title: "动作", key: "actionKey", width: 110 },
  {
    title: "状态",
    key: "status",
    width: 80,
    render: (row) =>
      h(
        NTag,
        { type: resultStatus[row.status]?.type ?? "default", size: "small" },
        () => resultStatus[row.status]?.text ?? row.status,
      ),
  },
  {
    title: "信息",
    key: "message",
    render: (row) =>
      row.message ?? (row.errorCode ? `错误码 ${row.errorCode}` : "—"),
  },
  {
    title: "获得资源",
    key: "gainJson",
    minWidth: 220,
    render: (row) => {
      if (!row.gainJson) return "—";
      try {
        const gain = JSON.parse(row.gainJson) as Record<string, number>;
        const text = Object.entries(gain)
          .filter(([, value]) => value !== 0)
          .map(
            ([key, value]) =>
              `${resourceKeyLabel(key)}+${formatGameAmount(value)}`,
          )
          .join("、");
        return text || "—";
      } catch {
        return "—";
      }
    },
  },
  {
    title: "耗时",
    key: "durationMs",
    width: 80,
    render: (row) =>
      row.durationMs === null ? "—" : `${(row.durationMs / 1000).toFixed(1)}s`,
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.get<{ runs: RunView[] }>("/api/runs?limit=100");
    runs.value = result.runs;
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

async function openDetail(runId: string): Promise<void> {
  closeStream();
  logs.value = [];
  results.value = [];
  showDetail.value = true;
  try {
    const result = await api.get<{
      run: RunView;
      results: RunResultView[];
      logs: RunLogView[];
    }>(`/api/runs/${runId}`);
    detail.value = result.run;
    results.value = result.results;
    logs.value = result.logs.map((line) => ({
      id: line.id,
      at: line.createdAt,
      level: line.level,
      message: line.message,
      roleName: line.roleName,
      actionKey: line.actionKey,
    }));
    scrollLogToBottom();
    openStream(runId);
  } catch (error) {
    message.error((error as Error).message);
  }
}

function openStream(runId: string): void {
  closeStream();
  source = new EventSource(`/api/runs/${runId}/stream`);
  source.addEventListener("snapshot", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as {
      run: Partial<RunView> & { id: string };
      results: RunResultView[];
    };
    results.value = payload.results;
    if (detail.value) {
      detail.value = { ...detail.value, ...payload.run } as RunView;
    }
    const status = payload.run.status;
    if (status && status !== "running") closeStream();
  });
  source.addEventListener("log", (event) => {
    const line = JSON.parse((event as MessageEvent).data) as LogLine;
    // 历史日志先加载过一次，避免 SSE 重连时重复追加
    if (line.id && logs.value.some((item) => item.id === line.id)) return;
    logs.value.push(line);
    scrollLogToBottom();
  });
  source.addEventListener("status", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as Partial<RunView>;
    if (detail.value) detail.value = { ...detail.value, ...payload };
    if (payload.status && payload.status !== "running") {
      closeStream();
      void load();
    }
  });
}

function closeStream(): void {
  if (source) {
    source.close();
    source = null;
  }
}

function scrollLogToBottom(): void {
  void nextTick(() => {
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
  });
}

watch(showDetail, (value) => {
  if (!value) closeStream();
});

onMounted(async () => {
  await load();
  const runId = route.query.run;
  if (typeof runId === "string" && runId) {
    await openDetail(runId);
  }
});

onBeforeUnmount(closeStream);
</script>
