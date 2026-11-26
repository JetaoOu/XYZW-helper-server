<template>
  <div class="page">
    <div class="page-header">
      <h2>计划管理</h2>
      <n-space>
        <n-button @click="load" :loading="loading">刷新</n-button>
        <n-button type="primary" @click="openCreate">新建计划</n-button>
      </n-space>
    </div>

    <n-card size="small">
      <n-data-table
        :columns="columns"
        :data="schedules"
        :bordered="false"
        size="small"
        :row-key="(row: ScheduleView) => row.id"
      />
    </n-card>

    <n-modal
      v-model:show="showForm"
      preset="card"
      :title="editingId ? '编辑计划' : '新建计划'"
      style="width: 560px"
    >
      <n-form label-placement="top">
        <n-form-item label="计划名称">
          <n-input v-model:value="form.name" placeholder="例如：每日日常" />
        </n-form-item>
        <n-form-item label="cron 表达式（Asia/Shanghai）">
          <n-input
            v-model:value="form.cronExpr"
            placeholder="0 8 * * *"
          />
        </n-form-item>
        <p class="muted" style="margin: -8px 0 12px">
          5 段格式：分 时 日 月 周。例如每天 8 点：<code>0 8 * * *</code>；
          每小时：<code>0 * * * *</code>。
        </p>
        <n-form-item label="动作（按固定顺序执行，日常优先）">
          <div class="action-picker">
            <n-tabs v-model:value="actionTab" type="line" size="small">
              <n-tab-pane
                v-for="group in actionGroups"
                :key="group.name"
                :name="group.name"
                :tab="group.name"
              >
                <div class="picker-toolbar">
                  <n-button size="tiny" @click="selectGroup(group, true)">
                    全选
                  </n-button>
                  <n-button size="tiny" @click="selectGroup(group, false)">
                    全不选
                  </n-button>
                  <span class="muted">
                    已选 {{ selectedCount(group) }}/{{ group.actions.length }}
                  </span>
                </div>
                <n-checkbox-group v-model:value="form.actionKeys">
                  <div class="action-check-grid">
                    <n-checkbox
                      v-for="action in group.actions"
                      :key="action.key"
                      :value="action.key"
                      :label="action.name"
                    />
                  </div>
                </n-checkbox-group>
              </n-tab-pane>
            </n-tabs>
            <div class="muted" style="margin-top: 8px">
              共已选 {{ form.actionKeys.length }} 个动作
            </div>
          </div>
        </n-form-item>
        <n-form-item label="角色分组">
          <n-select
            v-model:value="form.groupIds"
            multiple
            :options="groupOptions"
            placeholder="选择分组（执行时展开为当前成员）"
          />
        </n-form-item>
        <n-form-item label="角色">
          <n-select
            v-model:value="form.roleIds"
            multiple
            filterable
            :options="roleOptions"
            placeholder="可额外选择单个角色"
          />
        </n-form-item>
        <p class="muted" style="margin: -8px 0 12px">
          分组会在每次执行时展开为该组当前的全部角色；单个角色与分组取并集。
        </p>
        <n-form-item label="启用">
          <n-switch v-model:value="form.enabled" />
        </n-form-item>
      </n-form>
      <div class="form-actions">
        <n-button @click="showForm = false">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="save">
          保存
        </n-button>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  useDialog,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import {
  api,
  formatTime,
  type ActionMeta,
  type GroupView,
  type RoleView,
  type ScheduleView,
} from "../api";

const message = useMessage();
const dialog = useDialog();
const router = useRouter();

const schedules = ref<ScheduleView[]>([]);
const roles = ref<RoleView[]>([]);
const groups = ref<GroupView[]>([]);
const actions = ref<ActionMeta[]>([]);
const loading = ref(false);
const submitting = ref(false);

const showForm = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  name: "",
  cronExpr: "0 8 * * *",
  actionKeys: ["daily"] as string[],
  roleIds: [] as string[],
  groupIds: [] as string[],
  enabled: true,
});

const groupOptions = computed(() =>
  groups.value.map((group) => ({
    label: `${group.name}（${group.roleCount}）`,
    value: group.id,
  })),
);

const actionTab = ref("");

const ACTION_GROUP_ORDER = ["日常", "副本", "怪异塔", "资源", "功法"];

const actionGroups = computed(() => {
  const categories = [
    ...new Set(actions.value.map((action) => action.category || "其他")),
  ].sort(
    (a, b) =>
      (ACTION_GROUP_ORDER.indexOf(a) + 1 || 99) -
      (ACTION_GROUP_ORDER.indexOf(b) + 1 || 99),
  );
  return categories
    .map((name) => ({
      name,
      actions: actions.value.filter(
        (action) => (action.category || "其他") === name,
      ),
    }))
    .filter((group) => group.actions.length > 0);
});

function selectedCount(group: { actions: ActionMeta[] }): number {
  return group.actions.filter((action) =>
    form.actionKeys.includes(action.key),
  ).length;
}

function selectGroup(
  group: { actions: ActionMeta[] },
  selected: boolean,
): void {
  const keys = group.actions.map((action) => action.key);
  if (selected) {
    form.actionKeys = [
      ...new Set([...form.actionKeys, ...keys]),
    ];
  } else {
    form.actionKeys = form.actionKeys.filter(
      (key) => !keys.includes(key),
    );
  }
}
const roleOptions = computed(() =>
  roles.value.map((role) => ({
    label: `${role.name}${role.server ? `（${role.server}）` : ""}`,
    value: role.id,
  })),
);
const roleNameMap = computed(
  () => new Map(roles.value.map((role) => [role.id, role.name] as const)),
);
const groupNameMap = computed(
  () => new Map(groups.value.map((group) => [group.id, group.name] as const)),
);
const actionNameMap = computed(
  () => new Map(actions.value.map((action) => [action.key, action.name] as const)),
);

const columns: DataTableColumns<ScheduleView> = [
  { title: "名称", key: "name", minWidth: 130 },
  {
    title: "cron",
    key: "cronExpr",
    width: 130,
    render: (row) => h("code", row.cronExpr),
  },
  {
    title: "动作",
    key: "actionKeys",
    minWidth: 200,
    render: (row) =>
      row.actionKeys
        .map((key) => actionNameMap.value.get(key) ?? key)
        .join("、"),
  },
  {
    title: "角色",
    key: "roleIds",
    minWidth: 160,
    render: (row) => {
      const parts = [
        ...row.groupIds.map(
          (id) => `分组：${groupNameMap.value.get(id) ?? "已删除分组"}`,
        ),
        ...row.roleIds.map(
          (id) => roleNameMap.value.get(id) ?? "已删除角色",
        ),
      ];
      return parts.length > 0 ? parts.join("、") : "—";
    },
  },
  {
    title: "下次运行",
    key: "nextRunAt",
    width: 165,
    render: (row) => formatTime(row.nextRunAt),
  },
  {
    title: "启用",
    key: "enabled",
    width: 80,
    render: (row) =>
      h(NSwitch, {
        value: row.enabled,
        size: "small",
        "onUpdate:value": (value: boolean) => toggleEnabled(row, value),
      }),
  },
  {
    title: "操作",
    key: "actions",
    width: 220,
    render: (row) =>
      h(NSpace, { size: 4 }, () => [
        h(
          NButton,
          { size: "tiny", type: "primary", onClick: () => runNow(row) },
          () => "立即执行",
        ),
        h(
          NButton,
          { size: "tiny", onClick: () => openEdit(row) },
          () => "编辑",
        ),
        h(
          NButton,
          { size: "tiny", type: "error", onClick: () => removeSchedule(row) },
          () => "删除",
        ),
      ]),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [scheduleResult, roleResult, groupResult, actionResult] =
      await Promise.all([
        api.get<{ schedules: ScheduleView[] }>("/api/schedules"),
        api.get<{ roles: RoleView[] }>("/api/roles"),
        api.get<{ groups: GroupView[] }>("/api/groups"),
        api.get<{ actions: ActionMeta[] }>("/api/actions"),
      ]);
    schedules.value = scheduleResult.schedules;
    roles.value = roleResult.roles;
    groups.value = groupResult.groups;
    actions.value = actionResult.actions;
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingId.value = null;
  form.name = "";
  form.cronExpr = "0 8 * * *";
  form.actionKeys = ["daily"];
  form.roleIds = [];
  form.groupIds = [];
  form.enabled = true;
  actionTab.value = actionGroups.value[0]?.name ?? "";
  showForm.value = true;
}

function openEdit(schedule: ScheduleView): void {
  editingId.value = schedule.id;
  form.name = schedule.name;
  form.cronExpr = schedule.cronExpr;
  form.actionKeys = [...schedule.actionKeys];
  form.roleIds = [...schedule.roleIds];
  form.groupIds = [...schedule.groupIds];
  form.enabled = schedule.enabled;
  const selectedGroup = actionGroups.value.find((group) =>
    group.actions.some((action) => schedule.actionKeys.includes(action.key)),
  );
  actionTab.value = selectedGroup?.name ?? actionGroups.value[0]?.name ?? "";
  showForm.value = true;
}

async function save(): Promise<void> {
  if (!form.name.trim() || !form.cronExpr.trim()) {
    message.warning("请填写计划名称和 cron 表达式");
    return;
  }
  if (form.roleIds.length === 0 && form.groupIds.length === 0) {
    message.warning("请选择至少一个角色或分组");
    return;
  }
  submitting.value = true;
  try {
    if (editingId.value) {
      await api.patch(`/api/schedules/${editingId.value}`, { ...form });
    } else {
      await api.post("/api/schedules", { ...form });
    }
    message.success("已保存");
    showForm.value = false;
    await load();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

async function toggleEnabled(
  schedule: ScheduleView,
  enabled: boolean,
): Promise<void> {
  try {
    await api.patch(`/api/schedules/${schedule.id}`, { enabled });
    schedule.enabled = enabled;
    message.success(enabled ? "已启用" : "已停用");
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function runNow(schedule: ScheduleView): Promise<void> {
  try {
    const result = await api.post<{ runId: string }>(
      `/api/schedules/${schedule.id}/run`,
    );
    message.success("已开始执行");
    void router.push({ path: "/runs", query: { run: result.runId } });
  } catch (error) {
    message.error((error as Error).message);
  }
}

function removeSchedule(schedule: ScheduleView): void {
  dialog.warning({
    title: "删除计划",
    content: `确定删除「${schedule.name}」吗？已有的运行记录会保留。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await api.delete(`/api/schedules/${schedule.id}`);
        message.success("已删除");
        await load();
      } catch (error) {
        message.error((error as Error).message);
      }
    },
  });
}

onMounted(load);
</script>
