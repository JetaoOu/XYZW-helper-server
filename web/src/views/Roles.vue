<template>
  <div class="page">
    <div class="page-header">
      <h2>角色管理</h2>
      <n-space>
        <n-button @click="load" :loading="loading">刷新</n-button>
        <n-button @click="showGroupModal = true">分组管理</n-button>
        <n-button type="primary" @click="showAdd = true">添加角色</n-button>
      </n-space>
    </div>

    <div class="filter-row">
      <n-select
        v-model:value="groupFilter"
        :options="groupFilterOptions"
        size="small"
        style="width: 220px"
      />
      <span class="muted">共 {{ filteredRoles.length }} 个角色</span>
    </div>

    <div v-if="checkedRowKeys.length > 0" class="batch-bar">
      <div class="batch-info">
        <span>已选 {{ checkedRowKeys.length }} 个角色</span>
        <span v-if="batchProgress" class="muted">{{ batchProgress }}</span>
      </div>
      <n-space>
        <n-dropdown
          :options="runActionOptions"
          trigger="click"
          @select="batchRun"
        >
          <n-button size="small">批量执行</n-button>
        </n-dropdown>
        <n-dropdown
          :options="groupAssignOptions"
          trigger="click"
          @select="batchAssignGroup"
        >
          <n-button size="small">移入分组</n-button>
        </n-dropdown>
        <n-button
          size="small"
          :loading="batchBusy === 'snapshot'"
          @click="batchSnapshot"
        >
          批量快照
        </n-button>
        <n-button
          size="small"
          :loading="batchBusy === 'refresh'"
          @click="batchRefresh"
        >
          批量刷新凭据
        </n-button>
        <n-button size="small" @click="batchEnable(true)">启用</n-button>
        <n-button size="small" @click="batchEnable(false)">停用</n-button>
        <n-button size="small" type="error" @click="batchDelete">
          删除
        </n-button>
        <n-button size="small" quaternary @click="checkedRowKeys = []">
          取消选择
        </n-button>
      </n-space>
    </div>

    <n-card size="small">
      <n-data-table
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="filteredRoles"
        :bordered="false"
        size="small"
        :row-key="(row: RoleView) => row.id"
      />
    </n-card>

    <!-- 添加角色 -->
    <n-modal
      v-model:show="showAdd"
      preset="card"
      title="添加角色"
      style="width: 620px"
    >
      <n-tabs v-model:value="addTab" type="line">
        <n-tab-pane name="manual" tab="手动粘贴">
          <n-form label-placement="top">
            <n-form-item label="名称">
              <n-input v-model:value="manualForm.name" placeholder="角色名称" />
            </n-form-item>
            <n-form-item label="区服（可选）">
              <n-input v-model:value="manualForm.server" placeholder="区服" />
            </n-form-item>
            <n-form-item label="凭据">
              <n-input
                v-model:value="manualForm.token"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 8 }"
                placeholder="支持 Base64、JSON，或直接粘贴 roleToken JSON"
              />
            </n-form-item>
          </n-form>
          <div class="form-actions">
            <n-button @click="showAdd = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="importManual">
              导入
            </n-button>
          </div>
        </n-tab-pane>

        <n-tab-pane name="url" tab="URL 导入">
          <n-form label-placement="top">
            <n-form-item label="名称（可选）">
              <n-input v-model:value="urlForm.name" placeholder="角色名称" />
            </n-form-item>
            <n-form-item label="来源地址">
              <n-input
                v-model:value="urlForm.url"
                placeholder="返回 { token, server?, name? } 的地址"
              />
            </n-form-item>
          </n-form>
          <div class="form-actions">
            <n-button @click="showAdd = false">取消</n-button>
            <n-button type="primary" :loading="submitting" @click="importUrl">
              导入
            </n-button>
          </div>
        </n-tab-pane>

        <n-tab-pane name="bin" tab="BIN 文件">
          <n-space vertical>
            <input type="file" accept=".bin" @change="handleBinFile" />
            <n-form-item label="名称（可选）">
              <n-input v-model:value="binForm.name" placeholder="留空则使用 BIN 内角色名" />
            </n-form-item>
            <n-form-item v-if="binRoles.length" label="选择区服">
              <n-select
                v-model:value="binForm.index"
                :options="binRoleOptions"
                placeholder="选择要导入的角色"
              />
            </n-form-item>
            <n-alert v-if="binError" type="error" :bordered="false">
              {{ binError }}
            </n-alert>
          </n-space>
          <div class="form-actions">
            <n-button @click="showAdd = false">取消</n-button>
            <n-button
              type="primary"
              :disabled="binForm.index === null"
              :loading="submitting"
              @click="importBin"
            >
              导入
            </n-button>
          </div>
        </n-tab-pane>

        <n-tab-pane name="wx" tab="微信扫码">
          <n-space vertical>
            <n-alert type="info" :bordered="false">
              用微信扫码后，会列出该微信号下的所有角色，勾选即可批量导入。
              二维码约 2 分钟有效。
            </n-alert>
            <div v-if="!wxQr" class="wx-qr-placeholder" @click="fetchWxQr">
              点击获取微信登录二维码
            </div>
            <div v-else class="wx-qr-box">
              <img :src="wxQr.imageUrl" alt="微信登录二维码" class="wx-qr-image" />
              <n-button size="small" @click="fetchWxQr">刷新二维码</n-button>
            </div>
            <div v-if="wxStatusText" class="wx-qr-status">
              {{ wxStatusText }}
              <span v-if="wxQr && wxCountdown > 0" class="muted">
                （剩余 {{ wxCountdown }} 秒）
              </span>
            </div>
            <n-alert v-if="wxError" type="error" :bordered="false">
              {{ wxError }}
            </n-alert>
            <n-space v-if="wxRoles.length" vertical>
              <div class="muted">
                共 {{ wxRoles.length }} 个角色，已选 {{ wxSelected.length }} 个
              </div>
              <n-checkbox-group v-model:value="wxSelected">
                <n-space vertical>
                  <n-checkbox
                    v-for="role in wxRoles"
                    :key="role.serverId"
                    :value="role.serverId"
                  >
                    {{ role.name }}
                    <span class="muted">
                      · {{ role.serverName || role.serverId + "服" }}
                      <template v-if="role.power"> · 战力 {{ role.power }}</template>
                    </span>
                  </n-checkbox>
                </n-space>
              </n-checkbox-group>
            </n-space>
          </n-space>
          <div class="form-actions">
            <n-button @click="showAdd = false">关闭</n-button>
            <n-button v-if="!wxQr" type="primary" :loading="wxLoading" @click="fetchWxQr">
              获取二维码
            </n-button>
            <n-button
              v-else
              type="primary"
              :loading="submitting"
              :disabled="!wxSessionId || wxSelected.length === 0"
              @click="importWxSelected"
            >
              导入选中（{{ wxSelected.length }}）
            </n-button>
          </div>
        </n-tab-pane>

        <n-tab-pane name="backup" tab="旧备份">
          <n-space vertical>
            <p class="muted">
              选择旧项目导出的完整备份 JSON，将导入其中的 token 列表（不导入 BIN 原件）。
            </p>
            <input type="file" accept=".json,application/json" @change="handleBackupFile" />
            <n-alert v-if="backupResult" type="info" :bordered="false">
              已导入 {{ backupResult.imported }} 个角色，更新
              {{ backupResult.updated }} 个，失败
              {{ backupResult.failed.length }} 个。
            </n-alert>
          </n-space>
          <div class="form-actions">
            <n-button @click="showAdd = false">关闭</n-button>
            <n-button type="primary" :loading="submitting" @click="importBackup">
              开始导入
            </n-button>
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-modal>

    <!-- 分组管理 -->
    <n-modal
      v-model:show="showGroupModal"
      preset="card"
      title="分组管理"
      style="width: 580px"
    >
      <n-space align="center" style="margin-bottom: 16px">
        <n-input
          v-model:value="newGroupName"
          placeholder="新分组名称"
          style="width: 200px"
        />
        <n-color-picker
          v-model:value="newGroupColor"
          :show-alpha="false"
          style="width: 130px"
        />
        <n-button type="primary" @click="createGroup">新建分组</n-button>
      </n-space>
      <div v-if="groups.length === 0" class="muted">还没有分组</div>
      <template v-for="group in groups" :key="group.id">
        <div v-if="groupDrafts[group.id]" class="group-row">
          <n-color-picker
            v-model:value="groupDrafts[group.id].color"
            :show-alpha="false"
            size="small"
            style="width: 120px"
          />
          <n-input
            v-model:value="groupDrafts[group.id].name"
            size="small"
            style="flex: 1"
          />
          <span class="muted">{{ group.roleCount }} 个角色</span>
          <n-button size="tiny" @click="saveGroup(group)">保存</n-button>
          <n-button size="tiny" type="error" @click="removeGroup(group)">
            删除
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- 角色详情 -->
    <n-drawer v-model:show="showDetail" :width="720" placement="right">
      <n-drawer-content :title="detailRole?.name ?? '角色详情'" closable>
        <n-tabs v-model:value="detailTab" type="line" animated>
          <n-tab-pane name="overview" tab="概览">
            <template v-if="snapshot">
              <div class="identity-card">
                <div class="identity-title">
                  <span class="identity-icon">🏷️</span>
                  <div>
                    <div class="identity-title-main">身份牌</div>
                    <div class="muted">角色与资源概览</div>
                  </div>
                </div>
                <div class="identity-body">
                  <img
                    v-if="snapshot.headImg"
                    class="identity-avatar"
                    :src="String(snapshot.headImg)"
                    alt=""
                  />
                  <div class="identity-main">
                    <div class="identity-name">
                      {{ snapshot.name ?? detailRole?.name }}
                      <span
                        v-if="legacyInfo"
                        class="legacy-tag"
                        :class="`legacy-${legacyInfo.value}`"
                      >
                        {{ legacyInfo.name }}
                      </span>
                    </div>
                    <div class="identity-meta">
                      <span>Lv.{{ snapshot.level ?? "?" }}</span>
                      <span>战力 {{ formatGameAmount(snapshot.power) }}</span>
                      <span>
                        {{
                          snapshot.serverName ??
                          detailRole?.server ??
                          "未知区服"
                        }}
                      </span>
                      <span v-if="snapshot.legionId">
                        军团 {{ snapshot.legionId }}
                      </span>
                      <span v-if="activityWeek">本周活动：{{ activityWeek }}</span>
                    </div>
                    <div class="muted">
                      快照时间：{{ formatTime(detailRole?.lastSnapshotAt) }}
                    </div>
                  </div>
                </div>
                <div class="resource-grid">
                  <div
                    v-for="item in visibleResources"
                    :key="item.key"
                    class="resource-chip"
                  >
                    <span class="resource-label">{{ item.label }}</span>
                    <span class="resource-value">{{ item.text }}</span>
                  </div>
                </div>
                <n-button
                  v-if="resources.length > 8"
                  text
                  size="small"
                  @click="showAllResources = !showAllResources"
                >
                  {{ showAllResources ? "收起" : "展开全部" }}
                </n-button>
              </div>

              <div class="feature-grid">
                <div class="feature-card">
                  <div class="feature-title">📅 每日任务</div>
                  <n-progress
                    type="line"
                    :percentage="dailyPercent"
                    :height="10"
                  />
                  <div class="feature-line">
                    已完成 {{ dailyClaimed }}/{{ dailyTotal }} · 日积分
                    {{ dailyPoint }}
                  </div>
                  <div class="feature-line muted">
                    周积分 {{ weekPoint }} · 月积分 {{ monthPoint }}
                  </div>
                </div>

                <div class="feature-card">
                  <div class="feature-title">⏰ 挂机</div>
                  <div class="feature-big">{{ hangUpText }}</div>
                  <div class="feature-line">助力槽位 {{ helpCount }}/4</div>
                </div>

                <div class="feature-card">
                  <div class="feature-title">🗼 咸将塔</div>
                  <div class="feature-big">第 {{ tower.id ?? "—" }} 层</div>
                  <div class="feature-line">能量 {{ tower.energy ?? "—" }}</div>
                </div>

                <div class="feature-card">
                  <div class="feature-title">
                    ⚔️ 阵容 · {{ teamHeroes.length }} 名上阵
                  </div>
                  <div class="hero-row">
                    <div
                      v-for="hero in teamHeroes"
                      :key="hero.id"
                      class="hero-item"
                    >
                      <img
                        v-if="hero.avatar"
                        class="hero-avatar"
                        :src="hero.avatar"
                        :alt="hero.name"
                      />
                      <span class="hero-name">{{ hero.name }}</span>
                    </div>
                  </div>
                  <div class="feature-line muted">
                    共拥有 {{ heroCount }} 名英雄
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="muted">
              尚无快照，点击右侧「快照」按钮采集角色信息。
            </div>
          </n-tab-pane>

          <n-tab-pane name="info" tab="信息">
            <n-descriptions v-if="detailRole" :column="1" size="small" bordered>
              <n-descriptions-item label="区服">
                {{ detailRole.server ?? "—" }}
              </n-descriptions-item>
              <n-descriptions-item label="分组">
                <n-select
                  :value="detailRole.groupId"
                  :options="roleGroupOptions"
                  size="small"
                  clearable
                  placeholder="未分组"
                  style="width: 160px"
                  @update:value="updateRoleGroup"
                />
              </n-descriptions-item>
              <n-descriptions-item label="游戏角色 ID">
                {{ detailRole.gameRoleId ?? "—" }}
              </n-descriptions-item>
              <n-descriptions-item label="导入方式">
                {{ detailRole.importMethod }}
              </n-descriptions-item>
              <n-descriptions-item label="凭据状态">
                <n-tag
                  :type="
                    detailRole.credentialStatus === 'valid' ? 'success' : 'error'
                  "
                  size="small"
                >
                  {{ detailRole.credentialStatus === "valid" ? "有效" : "失效" }}
                </n-tag>
                <span v-if="detailRole.credentialError" class="muted">
                  {{ detailRole.credentialError }}
                </span>
              </n-descriptions-item>
              <n-descriptions-item label="快照时间">
                {{ formatTime(detailRole.lastSnapshotAt) }}
              </n-descriptions-item>
            </n-descriptions>

            <n-divider>修改信息</n-divider>
            <n-space align="center">
              <n-input
                v-model:value="editName"
                placeholder="名称"
                style="width: 180px"
              />
              <n-input
                v-model:value="editServer"
                placeholder="区服，例如 23131服"
                style="width: 170px"
              />
              <n-button size="small" type="primary" @click="saveRoleInfo">
                保存
              </n-button>
            </n-space>

            <div class="form-actions" style="justify-content: flex-start">
              <n-button
                size="small"
                :loading="refreshingCredential"
                :disabled="!detailRole?.hasBin && !detailRole?.sourceUrl"
                @click="refreshCredential"
              >
                刷新凭据
              </n-button>
              <span class="muted">
                {{
                  detailRole?.hasBin
                    ? "使用 BIN 原件重新兑换"
                    : detailRole?.sourceUrl
                      ? "从来源地址重新拉取"
                      : "没有 BIN 或来源地址，无法刷新"
                }}
              </span>
            </div>

            <n-divider>快照</n-divider>
            <pre class="json">{{
              detailRole?.snapshot
                ? JSON.stringify(detailRole.snapshot, null, 2)
                : "尚无快照，点击右侧“快照”按钮刷新"
            }}</pre>
          </n-tab-pane>

          <n-tab-pane name="actions" tab="功能">
            <div v-if="dailyStatus" class="daily-status-card">
              <div class="daily-status-head">
                <span>日常任务进度</span>
                <span class="muted">
                  更新于 {{ formatTime(dailyStatus.updatedAt) }}
                </span>
              </div>
              <div class="daily-task-grid">
                <div
                  v-for="task in dailyStatus.tasks"
                  :key="task.condition"
                  class="daily-task-row"
                >
                  <span class="daily-task-label">{{ task.label }}</span>
                  <span class="daily-task-progress">
                    {{ task.progress }}/{{ task.required }}
                  </span>
                  <n-tag size="tiny" :type="dailyTagType(task.status)">
                    {{ dailyStatusText(task) }}
                  </n-tag>
                </div>
              </div>
            </div>
            <div v-else class="muted" style="margin-bottom: 12px">
              尚无日常任务进度，执行一次「日常」后显示。
            </div>

            <div class="toolbar-row">
              <span class="muted">
                勾选后点「执行所选」，或点卡片右侧的 ▶ 单独执行
              </span>
              <n-button
                size="small"
                type="primary"
                :loading="runningSelected"
                @click="runSelected"
              >
                执行所选
              </n-button>
            </div>

            <div
              v-for="group in actionGroups"
              :key="group.name"
              class="action-group"
            >
              <div class="group-title">{{ group.name }}</div>
              <div class="action-grid">
                <div
                  v-for="action in group.actions"
                  :key="action.key"
                  class="action-card"
                >
                  <div class="action-icon">{{ action.icon }}</div>
                  <div class="action-main">
                    <div class="action-name">{{ action.name }}</div>
                    <div class="action-status" :class="statusClass(action.key)">
                      {{ statusText(action.key) }}
                    </div>
                  </div>
                  <button
                    class="action-play"
                    :disabled="!detailRole?.enabled"
                    title="执行该动作"
                    @click="runAction(action.key)"
                  >
                    ▶
                  </button>
                  <n-switch
                    v-model:value="selectedActions[action.key]"
                    size="small"
                  />
                </div>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="logs" tab="日志">
            <div class="day-row">
              <button
                v-for="day in days"
                :key="day.date"
                class="day-tile"
                :class="{ active: logDate === day.date }"
                @click="selectDay(day.date)"
              >
                <span class="day-label">{{ day.label }}</span>
                <span class="day-date">{{ day.short }}</span>
              </button>
            </div>

            <div v-if="logLoading" class="muted">加载中…</div>
            <div v-else-if="logGroups.length === 0" class="muted">
              当天没有执行日志
            </div>
            <template v-else>
              <div class="log-toolbar">
                <span class="muted">共 {{ logGroups.length }} 次运行</span>
                <n-button text size="small" @click="toggleAllRuns">
                  {{ allRunsExpanded ? "全部收起" : "全部展开" }}
                </n-button>
              </div>
              <div
                v-for="group in logGroups"
                :key="group.runId"
                class="log-group"
              >
                <div
                  class="log-group-head clickable"
                  @click="toggleRun(group.runId)"
                >
                  <span class="log-group-title">
                    <span
                      class="chevron"
                      :class="{ open: expandedRuns[group.runId] }"
                      >▸</span
                    >
                    {{ triggerText(group.trigger) }} ·
                    {{ formatTime(group.startedAt) }}
                    <span class="muted"
                      >（{{ group.logs.length }} 条）</span
                    >
                  </span>
                  <n-tag
                    size="tiny"
                    :type="statusMeta[group.status]?.type ?? 'default'"
                  >
                    {{ statusMeta[group.status]?.text ?? group.status }}
                  </n-tag>
                </div>
                <div v-show="expandedRuns[group.runId]">
                  <div
                    v-for="line in group.logs"
                    :key="line.id"
                    class="log-entry"
                  >
                    <span class="log-entry-time">
                      {{
                        new Date(line.createdAt).toLocaleTimeString("zh-CN", {
                          hour12: false,
                        })
                      }}
                    </span>
                    <span class="log-entry-msg" :class="line.level">
                      {{ line.message }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </n-tab-pane>

          <n-tab-pane name="growth" tab="资源">
            <div class="day-row">
              <button
                v-for="day in days"
                :key="day.date"
                class="day-tile"
                :class="{ active: growthDate === day.date }"
                @click="growthDate = day.date"
              >
                <span class="day-label">{{ day.label }}</span>
                <span class="day-date">{{ day.short }}</span>
              </button>
            </div>

            <div v-if="growthLoading" class="muted">加载中…</div>
            <template v-else-if="currentGrowth">
              <div class="growth-head">
                <span>{{ currentGrowth.date }}</span>
                <span class="muted">
                  {{ formatTime(currentGrowth.baselineAt) }} →
                  {{ formatTime(currentGrowth.endAt) }}
                </span>
              </div>
              <div
                v-if="currentGrowth.deltas.length === 0"
                class="muted"
              >
                当天没有资源变化
              </div>
              <div v-else class="growth-grid">
                <div
                  v-for="item in currentGrowth.deltas"
                  :key="item.key"
                  class="growth-item"
                >
                  <div class="growth-main">
                    <span class="growth-label">
                      {{ resourceKeyLabel(item.key) }}
                    </span>
                    <span
                      class="growth-value"
                      :class="item.delta >= 0 ? 'up' : 'down'"
                    >
                      {{ item.delta >= 0 ? "+" : ""
                      }}{{ formatGameAmount(item.delta) }}
                    </span>
                  </div>
                  <div class="muted">
                    {{ formatGameAmount(item.start) }} →
                    {{ formatGameAmount(item.end) }}
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="muted">
              暂无资源快照，执行一次任务或手动刷新快照后开始统计。
            </div>
          </n-tab-pane>
        </n-tabs>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NColorPicker,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NProgress,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import {
  api,
  formatTime,
  type ActionMeta,
  type ActionStatusView,
  type DailyStatusView,
  type DailyTaskStateView,
  type GroupView,
  type GrowthDay,
  type RoleLogGroup,
  type RoleView,
  type WechatQr,
  type WechatRole,
  type WechatScanResult,
  type WechatSessionView,
} from "../api";
import {
  HERO_DICT,
  ITEM_RESOURCES,
  LEGACY_COLORS,
  formatGameAmount,
  getCurrentActivityWeek,
  getItemCount,
  resourceKeyLabel,
} from "../gameData";

const message = useMessage();
const dialog = useDialog();
const router = useRouter();

const roles = ref<RoleView[]>([]);
const groups = ref<GroupView[]>([]);
const actions = ref<ActionMeta[]>([]);
const loading = ref(false);
const submitting = ref(false);
const checkedRowKeys = ref<Array<string | number>>([]);
const batchBusy = ref("");
const batchProgress = ref("");
const groupFilter = ref("all");
const showGroupModal = ref(false);
const newGroupName = ref("");
const newGroupColor = ref("#1677ff");
const groupDrafts = reactive<
  Record<string, { name: string; color: string }>
>({});

const showAdd = ref(false);
const addTab = ref("manual");

// 微信扫码导入
const wxQr = ref<WechatQr | null>(null);
const wxLoading = ref(false);
const wxStatusText = ref("");
const wxError = ref("");
const wxRoles = ref<WechatRole[]>([]);
const wxSelected = ref<string[]>([]);
const wxSessionId = ref("");
const wxCountdown = ref(0);
/** 轮询代次：重新获取二维码或关闭弹窗时 +1，让旧循环退出 */
let wxPollToken = 0;
let wxCountdownTimer: ReturnType<typeof setInterval> | null = null;
const manualForm = reactive({ name: "", server: "", token: "" });
const urlForm = reactive({ name: "", url: "" });
const binForm = reactive({
  name: "",
  index: null as number | null,
  binBase64: "",
  binName: "",
});
const binRoles = ref<Array<Record<string, unknown>>>([]);
const binError = ref("");
const backupJson = ref<unknown>(null);
const backupResult = ref<{
  imported: number;
  updated: number;
  failed: unknown[];
} | null>(null);

const showDetail = ref(false);
const detailRole = ref<RoleView | null>(null);
const editName = ref("");
const editServer = ref("");
const refreshingCredential = ref(false);

// 角色面板：功能 / 日志
const detailTab = ref("info");
const actionStatuses = ref<Record<string, ActionStatusView>>({});
const selectedActions = reactive<Record<string, boolean>>({});
const runningSelected = ref(false);
const days = ref<Array<{ date: string; label: string; short: string }>>([]);
const logDate = ref("");
const logGroups = ref<RoleLogGroup[]>([]);
const logLoading = ref(false);
const expandedRuns = reactive<Record<string, boolean>>({});
const allRunsExpanded = computed(
  () =>
    logGroups.value.length > 0 &&
    logGroups.value.every((group) => expandedRuns[group.runId]),
);
const dailyStatus = ref<DailyStatusView | null>(null);
const growthDays = ref<GrowthDay[]>([]);
const growthDate = ref("");
const growthLoading = ref(false);
const showAllResources = ref(false);
let pollTimer: number | null = null;

type SnapshotData = Record<string, any>;
const snapshot = computed<SnapshotData | null>(
  () => (detailRole.value?.snapshot as SnapshotData | null) ?? null,
);

const resources = computed(() => {
  const data = snapshot.value;
  if (!data) return [];
  const list: Array<{ key: string; label: string; value: number }> = [
    { key: "gold", label: "金币", value: Number(data.gold ?? 0) },
    { key: "diamond", label: "金砖", value: Number(data.diamond ?? 0) },
    ...ITEM_RESOURCES.map((item) => ({
      key: `item-${item.id}`,
      label: item.label,
      value: getItemCount(data.items, item.id),
    })),
    { key: "boxPoint", label: "宝箱积分", value: Number(data.boxPoint ?? 0) },
    { key: "hallEnergy", label: "大厅能量", value: Number(data.hallEnergy ?? 0) },
  ];
  // 非零资源排前面，零值放后面，与旧项目身份牌一致
  const nonZero = list.filter((item) => item.value > 0);
  const zero = list.filter((item) => item.value === 0);
  return [...nonZero, ...zero].map((item) => ({
    key: item.key,
    label: item.label,
    text: formatGameAmount(item.value),
  }));
});

const visibleResources = computed(() =>
  showAllResources.value ? resources.value : resources.value.slice(0, 12),
);

const currentGrowth = computed(
  () =>
    growthDays.value.find((day) => day.date === growthDate.value) ?? null,
);

const dailyData = computed(
  () =>
    (snapshot.value?.dailyTask ?? {}) as {
      complete?: Record<string, number>;
      dailyPoint?: number;
      weekPoint?: number;
      monthPoint?: number;
    },
);
const dailyTotal = computed(() => Object.keys(dailyData.value.complete ?? {}).length);
const dailyClaimed = computed(
  () =>
    Object.values(dailyData.value.complete ?? {}).filter((value) => value === -1)
      .length,
);
const dailyPercent = computed(() =>
  dailyTotal.value === 0
    ? 0
    : Math.round((dailyClaimed.value / dailyTotal.value) * 100),
);
const dailyPoint = computed(() => dailyData.value.dailyPoint ?? 0);
const weekPoint = computed(() => dailyData.value.weekPoint ?? 0);
const monthPoint = computed(() => dailyData.value.monthPoint ?? 0);

const tower = computed(
  () => (snapshot.value?.tower ?? {}) as { id?: number; energy?: number },
);

const hangUpText = computed(() => {
  const data = (snapshot.value?.hangUp ?? {}) as { hangUpTime?: number };
  return formatDuration(Number(data.hangUpTime ?? 0));
});
const helpCount = computed(() => {
  const data = (snapshot.value?.hangUp ?? {}) as { helpFriend?: unknown[] };
  return Array.isArray(data.helpFriend) ? data.helpFriend.length : 0;
});
const teamHeroIds = computed(() => {
  const team = (snapshot.value?.battleTeam ?? {}) as Record<
    string,
    { heroId?: number }
  >;
  return Object.values(team)
    .map((slot) => slot?.heroId)
    .filter((id): id is number => typeof id === "number");
});
const teamHeroes = computed(() =>
  teamHeroIds.value.map((id) => ({
    id,
    name: HERO_DICT[id]?.name ?? `英雄 ${id}`,
    avatar: HERO_DICT[id]?.avatar ?? "",
  })),
);
const heroCount = computed(
  () =>
    Object.keys((snapshot.value?.heroes ?? {}) as Record<string, unknown>)
      .length,
);
const activityWeek = computed(() => getCurrentActivityWeek());
const legacyInfo = computed(() => {
  const legacyId = Number(
    (snapshot.value as { legacy?: { color?: number } } | null)?.legacy
      ?.color ?? 0,
  );
  return LEGACY_COLORS[legacyId] ?? null;
});

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "未挂机";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分钟`;
}

const selectedRoles = computed(() =>
  roles.value.filter((role) => checkedRowKeys.value.includes(role.id)),
);

const groupMap = computed(
  () => new Map(groups.value.map((group) => [group.id, group] as const)),
);
const ungroupedCount = computed(
  () => roles.value.filter((role) => !role.groupId).length,
);
const filteredRoles = computed(() => {
  if (groupFilter.value === "all") return roles.value;
  if (groupFilter.value === "ungrouped") {
    return roles.value.filter((role) => !role.groupId);
  }
  return roles.value.filter((role) => role.groupId === groupFilter.value);
});
const groupFilterOptions = computed(() => [
  { label: `全部（${roles.value.length}）`, value: "all" },
  { label: `未分组（${ungroupedCount.value}）`, value: "ungrouped" },
  ...groups.value.map((group) => ({
    label: `${group.name}（${group.roleCount}）`,
    value: group.id,
  })),
]);
const groupAssignOptions = computed(() => [
  { label: "移出分组", key: "__none__" },
  ...groups.value.map((group) => ({
    label: group.name,
    key: group.id,
  })),
]);
const roleGroupOptions = computed(() =>
  groups.value.map((group) => ({
    label: group.name,
    value: group.id,
  })),
);

const runActionOptions = computed(() => {
  const preferred = ["daily", "signIn", "hangup", "tower", "arena", "mail", "legionSignIn"];
  return [...actions.value]
    .sort(
      (a, b) =>
        (preferred.indexOf(a.key) + 1 || 99) -
        (preferred.indexOf(b.key) + 1 || 99),
    )
    .map((action) => ({ label: action.name, key: action.key }));
});

const ACTION_ICONS: Record<string, string> = {
  daily: "📅",
  signIn: "✅",
  hangup: "⏰",
  addHangUpTime: "⏳",
  mail: "✉️",
  legionSignIn: "🏰",
  collectionFree: "🏛️",
  legacyClaim: "📜",
  bottleReset: "🧂",
  bottleClaim: "🍶",
  tower: "🗼",
  arena: "⚔️",
  arena3: "🏟️",
  weirdTower: "🌀",
  bosstower13: "🏰",
  bosstower45: "🏯",
  dream: "💭",
  campTasks: "⛺",
  openBox: "📦",
  boxPoint: "🎁",
  recruit: "🎴",
  fish: "🎣",
  genieSweep: "🧞",
  freeEnergy: "💎",
  legionStoreBuy: "🛒",
};

const ACTION_GROUP_ORDER = ["日常", "副本", "怪异塔", "资源", "功法"];

const actionGroups = computed(() => {
  const categories = [
    ...new Set(actions.value.map((action) => action.category)),
  ].sort(
    (a, b) =>
      (ACTION_GROUP_ORDER.indexOf(a) + 1 || 99) -
      (ACTION_GROUP_ORDER.indexOf(b) + 1 || 99),
  );
  return categories
    .map((name) => ({
      name,
      actions: actions.value
        .filter((action) => action.category === name)
        .map((action) => ({
          ...action,
          icon: ACTION_ICONS[action.key] ?? "•",
        })),
    }))
    .filter((group) => group.actions.length > 0);
});

const statusMeta: Record<
  string,
  { text: string; type: "success" | "warning" | "error" | "info" | "default" }
> = {
  running: { text: "运行中", type: "info" },
  success: { text: "成功", type: "success" },
  completed: { text: "已完成", type: "success" },
  partial: { text: "部分失败", type: "warning" },
  failed: { text: "失败", type: "error" },
  skipped: { text: "跳过", type: "default" },
};

function dailyTagType(
  status: DailyTaskStateView["status"],
): "success" | "warning" | "default" {
  if (status === "claimed") return "success";
  if (status === "claimable") return "warning";
  return "default";
}

function dailyStatusText(task: DailyTaskStateView): string {
  if (task.status === "claimed") return "已完成";
  if (task.status === "claimable") return "待领奖";
  return `未完成，剩 ${task.remaining}`;
}

function statusText(actionKey: string): string {
  const status = actionStatuses.value[actionKey];
  if (!status) return "未执行";
  const label = statusMeta[status.status]?.text ?? status.status;
  return `${label} · ${new Date(status.createdAt).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function statusClass(actionKey: string): string {
  return actionStatuses.value[actionKey]?.status ?? "none";
}

function triggerText(trigger: string): string {
  if (trigger === "scheduled") return "定时触发";
  if (trigger === "manual") return "计划手动";
  if (trigger === "manual-role") return "角色手动";
  return trigger;
}

function buildDays(): Array<{ date: string; label: string; short: string }> {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const weekFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  });
  const list: Array<{ date: string; label: string; short: string }> = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const date = dateFormatter.format(day);
    list.push({
      date,
      label: i === 0 ? "今天" : i === 1 ? "昨天" : weekFormatter.format(day),
      short: date.slice(5).replace("-", "/"),
    });
  }
  return list;
}

const binRoleOptions = computed(() =>
  binRoles.value.map((role, index) => ({
    label: `${String(role.name ?? role.roleId ?? "未知")} · 区服 ${String(role.serverId ?? "?")}`,
    value: index,
  })),
);

const columns: DataTableColumns<RoleView> = [
  { type: "selection" },
  {
    title: "名称",
    key: "name",
    minWidth: 140,
    render: (row) => row.name,
  },
  {
    title: "分组",
    key: "groupId",
    width: 110,
    render: (row) => {
      const group = row.groupId ? groupMap.value.get(row.groupId) : null;
      if (!group) return "—";
      return h(
        "span",
        {
          class: "group-chip",
          style: {
            color: group.color,
            borderColor: `${group.color}66`,
            backgroundColor: `${group.color}1a`,
          },
        },
        group.name,
      );
    },
  },
  {
    title: "区服",
    key: "server",
    width: 100,
    render: (row) => row.server ?? "—",
  },
  {
    title: "凭据",
    key: "credentialStatus",
    width: 90,
    render: (row) =>
      h(
        NTag,
        {
          type: row.credentialStatus === "valid" ? "success" : "error",
          size: "small",
        },
        () => (row.credentialStatus === "valid" ? "有效" : "失效"),
      ),
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
    title: "快照",
    key: "lastSnapshotAt",
    width: 165,
    render: (row) => formatTime(row.lastSnapshotAt),
  },
  {
    title: "操作",
    key: "actions",
    width: 220,
    render: (row) =>
      h(NSpace, { size: 4 }, () => [
        h(
          NButton,
          { size: "tiny", onClick: () => openDetail(row) },
          () => "详情",
        ),
        h(
          NButton,
          { size: "tiny", onClick: () => refreshSnapshot(row) },
          () => "快照",
        ),
        h(
          NButton,
          { size: "tiny", type: "error", onClick: () => removeRole(row) },
          () => "删除",
        ),
      ]),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [roleResult, actionResult, groupResult] = await Promise.all([
      api.get<{ roles: RoleView[] }>("/api/roles"),
      api.get<{ actions: ActionMeta[] }>("/api/actions"),
      api.get<{ groups: GroupView[] }>("/api/groups"),
    ]);
    roles.value = roleResult.roles;
    actions.value = actionResult.actions;
    groups.value = groupResult.groups;
    for (const group of groups.value) {
      groupDrafts[group.id] = { name: group.name, color: group.color };
    }
    checkedRowKeys.value = checkedRowKeys.value.filter((key) =>
      roles.value.some((role) => role.id === key),
    );
    if (detailRole.value) {
      const openId = detailRole.value.id;
      if (roles.value.some((item) => item.id === openId)) {
        void loadRoleDetail(openId);
      } else {
        detailRole.value = null;
      }
    }
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

/** 列表接口不返回完整快照，打开详情时单独拉一次 */
async function loadRoleDetail(roleId: string): Promise<void> {
  try {
    const result = await api.get<{ role: RoleView | null }>(
      `/api/roles/${roleId}`,
    );
    if (result.role && detailRole.value?.id === roleId) {
      detailRole.value = result.role;
    }
  } catch {
    // 详情拉取失败不阻塞抽屉，列表数据仍可用
  }
}

function openDetail(role: RoleView): void {
  detailRole.value = role;
  editName.value = role.name;
  editServer.value = role.server ?? "";
  detailTab.value = "overview";
  actionStatuses.value = {};
  for (const action of actions.value) selectedActions[action.key] = true;
  days.value = buildDays();
  logDate.value = days.value[0].date;
  logGroups.value = [];
  dailyStatus.value = null;
  growthDays.value = [];
  growthDate.value = days.value[0].date;
  showDetail.value = true;
  void loadRoleDetail(role.id);
  void loadActionStatus(role.id);
  void loadDailyStatus(role.id);
  void loadGrowth(role.id);
  void loadLogs(role.id, logDate.value);
}

async function refreshCredential(): Promise<void> {
  if (!detailRole.value) return;
  refreshingCredential.value = true;
  try {
    const result = await api.post<{ role: RoleView | null }>(
      `/api/roles/${detailRole.value.id}/refresh`,
    );
    if (result.role) detailRole.value = result.role;
    message.success("凭据已刷新");
    await load();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    refreshingCredential.value = false;
  }
}

async function saveRoleInfo(): Promise<void> {  if (!detailRole.value) return;
  try {
    const result = await api.patch<{ role: RoleView | null }>(
      `/api/roles/${detailRole.value.id}`,
      {
        name: editName.value,
        server: editServer.value,
      },
    );
    if (result.role) {
      detailRole.value = result.role;
      editName.value = result.role.name;
      editServer.value = result.role.server ?? "";
    }
    message.success("已保存");
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function toggleEnabled(role: RoleView, enabled: boolean): Promise<void> {
  try {
    await api.patch(`/api/roles/${role.id}`, { enabled });
    role.enabled = enabled;
    message.success(enabled ? "已启用" : "已停用");
  } catch (error) {
    message.error((error as Error).message);
  }
}

function removeRole(role: RoleView): void {
  dialog.warning({
    title: "删除角色",
    content: `确定删除「${role.name}」吗？凭据将一并删除。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await api.delete(`/api/roles/${role.id}`);
        message.success("已删除");
        await load();
      } catch (error) {
        message.error((error as Error).message);
      }
    },
  });
}

async function refreshSnapshot(role: RoleView): Promise<void> {
  message.info("正在连接游戏服务器读取快照…");
  try {
    const result = await api.post<{ role: RoleView | null }>(
      `/api/roles/${role.id}/snapshot`,
    );
    if (result.role) detailRole.value = result.role;
    message.success("快照已更新");
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function runAction(actionKey: string): Promise<void> {
  if (!detailRole.value) return;
  await startRun([actionKey]);
}

async function runSelected(): Promise<void> {
  const keys = actions.value
    .filter((action) => selectedActions[action.key])
    .map((action) => action.key);
  if (keys.length === 0) {
    message.warning("请至少勾选一个动作");
    return;
  }
  await startRun(keys);
}

async function startRun(actionKeys: string[]): Promise<void> {
  if (!detailRole.value) return;
  const roleId = detailRole.value.id;
  runningSelected.value = true;
  try {
    const result = await api.post<{ runId: string }>(
      `/api/roles/${roleId}/run`,
      { actionKeys },
    );
    message.success("已开始执行");
    detailTab.value = "logs";
    pollRun(result.runId, roleId);
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    runningSelected.value = false;
  }
}

async function loadActionStatus(roleId: string): Promise<void> {
  try {
    const result = await api.get<{ statuses: ActionStatusView[] }>(
      `/api/roles/${roleId}/action-status`,
    );
    const map: Record<string, ActionStatusView> = {};
    for (const status of result.statuses) map[status.actionKey] = status;
    actionStatuses.value = map;
  } catch {
    // 状态展示失败不阻塞面板
  }
}

async function loadGrowth(roleId: string): Promise<void> {
  growthLoading.value = true;
  try {
    const result = await api.get<{ growth: GrowthDay[] }>(
      `/api/roles/${roleId}/resource-growth?days=7`,
    );
    growthDays.value = result.growth;
  } catch {
    growthDays.value = [];
  } finally {
    growthLoading.value = false;
  }
}

async function loadDailyStatus(roleId: string): Promise<void> {  try {
    const result = await api.get<{ dailyStatus: DailyStatusView | null }>(
      `/api/roles/${roleId}/daily-status`,
    );
    dailyStatus.value = result.dailyStatus;
  } catch {
    dailyStatus.value = null;
  }
}

async function loadLogs(roleId: string, date: string): Promise<void> {  logLoading.value = true;
  try {
    const result = await api.get<{ groups: RoleLogGroup[] }>(
      `/api/roles/${roleId}/logs?date=${date}`,
    );
    logGroups.value = result.groups;
    // 默认只展开最新一次运行，其余收起
    result.groups.forEach((group, index) => {
      if (!(group.runId in expandedRuns)) {
        expandedRuns[group.runId] = index === 0;
      }
    });
  } catch (error) {
    message.error((error as Error).message);
    logGroups.value = [];
  } finally {
    logLoading.value = false;
  }
}

function selectDay(date: string): void {
  logDate.value = date;
  if (detailRole.value) void loadLogs(detailRole.value.id, date);
}

function toggleRun(runId: string): void {
  expandedRuns[runId] = !expandedRuns[runId];
}

function toggleAllRuns(): void {
  const target = !allRunsExpanded.value;
  for (const group of logGroups.value) {
    expandedRuns[group.runId] = target;
  }
}

/** 轮询运行状态，结束后刷新动作状态与当日日志 */
function pollRun(runId: string, roleId: string): void {
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  const startedAt = Date.now();
  const tick = async (): Promise<void> => {
    if (!showDetail.value || detailRole.value?.id !== roleId) return;
    let finished = false;
    try {
      const result = await api.get<{ run: { status: string } }>(
        `/api/runs/${runId}`,
      );
      finished = result.run.status !== "running";
    } catch {
      finished = true;
    }
    if (!finished && Date.now() - startedAt < 120_000) {
      pollTimer = window.setTimeout(tick, 2000);
      return;
    }
    await Promise.all([
      loadActionStatus(roleId),
      loadDailyStatus(roleId),
      loadGrowth(roleId),
      loadLogs(roleId, days.value[0]?.date ?? logDate.value),
      load(),
    ]);
  };
  pollTimer = window.setTimeout(tick, 1500);
}

watch(showDetail, (value) => {
  if (!value && pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
});

async function importManual(): Promise<void> {
  if (!manualForm.token.trim()) {
    message.warning("请粘贴凭据");
    return;
  }
  submitting.value = true;
  try {
    await api.post("/api/roles/manual", {
      name: manualForm.name,
      server: manualForm.server,
      token: manualForm.token,
    });
    message.success("导入成功");
    manualForm.name = "";
    manualForm.server = "";
    manualForm.token = "";
    showAdd.value = false;
    await load();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

async function importUrl(): Promise<void> {
  if (!urlForm.url.trim()) {
    message.warning("请填写来源地址");
    return;
  }
  submitting.value = true;
  try {
    await api.post("/api/roles/url", {
      name: urlForm.name,
      url: urlForm.url,
    });
    message.success("导入成功");
    urlForm.name = "";
    urlForm.url = "";
    showAdd.value = false;
    await load();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function handleBinFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  binError.value = "";
  binRoles.value = [];
  binForm.index = null;
  binForm.binName = file.name;
  try {
    const base64 = await readFileAsBase64(file);
    binForm.binBase64 = base64;
    const result = await api.post<{ servers: Array<Record<string, unknown>> }>(
      "/api/roles/bin/servers",
      { binBase64: base64 },
    );
    binRoles.value = result.servers;
    if (result.servers.length === 1) binForm.index = 0;
  } catch (error) {
    binError.value = (error as Error).message;
  }
}

async function importBin(): Promise<void> {
  if (binForm.index === null) {
    message.warning("请选择区服");
    return;
  }
  const role = binRoles.value[binForm.index];
  submitting.value = true;
  try {
    const result = await api.post<{ role: RoleView | null; updated?: boolean }>(
      "/api/roles/bin",
      {
        name: binForm.name || String(role.name ?? ""),
        binBase64: binForm.binBase64,
        binName: binForm.binName,
        serverId: role.serverId,
        roleId: role.roleId,
      },
    );
    message.success(result.updated ? "已更新已有角色" : "导入成功");
    showAdd.value = false;
    binForm.name = "";
    await load();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

async function handleBackupFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    backupJson.value = JSON.parse(await readFileAsText(file));
    backupResult.value = null;
  } catch {
    message.error("备份文件不是合法 JSON");
  }
}

async function importBackup(): Promise<void> {
  if (!backupJson.value) {
    message.warning("请先选择备份文件");
    return;
  }
  submitting.value = true;
  try {
    backupResult.value = await api.post<{
      imported: number;
      updated: number;
      failed: unknown[];
    }>("/api/roles/import-backup", { backup: backupJson.value });
    message.success(
      `已导入 ${backupResult.value.imported} 个，更新 ${backupResult.value.updated} 个角色`,
    );
    await load();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

/** 限制并发地处理一批角色 */
async function runLimited<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        await task(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function batchSnapshot(): Promise<void> {
  const list = selectedRoles.value;
  if (list.length === 0) return;
  batchBusy.value = "snapshot";
  let ok = 0;
  let failed = 0;
  try {
    await runLimited(list, 2, async (role, index) => {
      batchProgress.value = `快照 ${index + 1}/${list.length}：${role.name}`;
      try {
        await api.post(`/api/roles/${role.id}/snapshot`);
        ok++;
      } catch {
        failed++;
      }
    });
    message.success(`快照完成：成功 ${ok} 个，失败 ${failed} 个`);
    await load();
  } finally {
    batchBusy.value = "";
    batchProgress.value = "";
  }
}

async function batchRefresh(): Promise<void> {
  const targets = selectedRoles.value.filter(
    (role) => role.hasBin || role.sourceUrl,
  );
  const skipped = selectedRoles.value.length - targets.length;
  if (targets.length === 0) {
    message.warning("选中的角色都没有 BIN 或来源地址，无法刷新凭据");
    return;
  }
  batchBusy.value = "refresh";
  let ok = 0;
  let failed = 0;
  try {
    await runLimited(targets, 2, async (role, index) => {
      batchProgress.value = `刷新凭据 ${index + 1}/${targets.length}：${role.name}`;
      try {
        await api.post(`/api/roles/${role.id}/refresh`);
        ok++;
      } catch {
        failed++;
      }
    });
    message.success(
      `刷新凭据完成：成功 ${ok} 个，失败 ${failed} 个${
        skipped > 0 ? `，跳过 ${skipped} 个（无来源）` : ""
      }`,
    );
    await load();
  } finally {
    batchBusy.value = "";
    batchProgress.value = "";
  }
}

async function batchEnable(enabled: boolean): Promise<void> {
  const list = selectedRoles.value;
  if (list.length === 0) return;
  const results = await Promise.allSettled(
    list.map((role) =>
      api.patch(`/api/roles/${role.id}`, { enabled }),
    ),
  );
  const failed = results.filter((item) => item.status === "rejected").length;
  message.success(
    `${enabled ? "启用" : "停用"}完成：${list.length - failed} 个${
      failed > 0 ? `，失败 ${failed} 个` : ""
    }`,
  );
  await load();
}

function batchDelete(): void {
  const list = selectedRoles.value;
  if (list.length === 0) return;
  dialog.warning({
    title: "批量删除角色",
    content: `确定删除选中的 ${list.length} 个角色吗？凭据将一并删除。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      const results = await Promise.allSettled(
        list.map((role) => api.delete(`/api/roles/${role.id}`)),
      );
      const failed = results.filter((item) => item.status === "rejected").length;
      message.success(
        `删除完成：${list.length - failed} 个${
          failed > 0 ? `，失败 ${failed} 个` : ""
        }`,
      );
      checkedRowKeys.value = [];
      await load();
    },
  });
}

async function batchRun(actionKey: string | number): Promise<void> {
  const list = selectedRoles.value;
  const key = String(actionKey);
  if (list.length === 0) return;
  batchBusy.value = "run";
  let ok = 0;
  let failed = 0;
  try {
    await runLimited(list, 2, async (role, index) => {
      batchProgress.value = `执行 ${index + 1}/${list.length}：${role.name}`;
      try {
        await api.post(`/api/roles/${role.id}/run`, {
          actionKeys: [key],
        });
        ok++;
      } catch {
        failed++;
      }
    });
    message.success(
      `已开始执行：${ok} 个角色${failed > 0 ? `，${failed} 个提交失败` : ""}`,
    );
    if (ok > 0) void router.push("/runs");
  } finally {
    batchBusy.value = "";
    batchProgress.value = "";
  }
}

async function createGroup(): Promise<void> {
  if (!newGroupName.value.trim()) {
    message.warning("请填写分组名称");
    return;
  }
  try {
    await api.post("/api/groups", {
      name: newGroupName.value,
      color: newGroupColor.value,
    });
    message.success("分组已创建");
    newGroupName.value = "";
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function saveGroup(group: GroupView): Promise<void> {
  const draft = groupDrafts[group.id];
  if (!draft) return;
  try {
    await api.patch(`/api/groups/${group.id}`, {
      name: draft.name,
      color: draft.color,
    });
    message.success("分组已保存");
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}

function removeGroup(group: GroupView): void {
  dialog.warning({
    title: "删除分组",
    content: `确定删除分组「${group.name}」吗？组内角色会变为未分组。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        await api.delete(`/api/groups/${group.id}`);
        if (groupFilter.value === group.id) groupFilter.value = "all";
        message.success("已删除");
        await load();
      } catch (error) {
        message.error((error as Error).message);
      }
    },
  });
}

async function batchAssignGroup(groupId: string | number): Promise<void> {
  const ids = checkedRowKeys.value.map(String);
  if (ids.length === 0) return;
  try {
    const result = await api.post<{ updated: number }>("/api/groups/assign", {
      roleIds: ids,
      groupId: groupId === "__none__" ? null : String(groupId),
    });
    message.success(`已更新 ${result.updated} 个角色`);
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function updateRoleGroup(value: string | null): Promise<void> {
  if (!detailRole.value) return;
  try {
    const result = await api.patch<{ role: RoleView | null }>(
      `/api/roles/${detailRole.value.id}`,
      { groupId: value ?? null },
    );
    if (result.role) detailRole.value = result.role;
    message.success("分组已更新");
    await load();
  } catch (error) {
    message.error((error as Error).message);
  }
}



function stopWxPolling(): void {
  wxPollToken += 1;
}

function stopWxCountdown(): void {
  if (wxCountdownTimer) clearInterval(wxCountdownTimer);
  wxCountdownTimer = null;
  wxCountdown.value = 0;
}

/** 二维码有效期约 2 分钟，本地倒计时到点就提示重新获取 */
function startWxCountdown(): void {
  stopWxCountdown();
  wxCountdown.value = 120;
  wxCountdownTimer = setInterval(() => {
    wxCountdown.value = Math.max(0, wxCountdown.value - 1);
    if (wxCountdown.value === 0) {
      stopWxCountdown();
      wxQr.value = null;
      wxStatusText.value = "二维码已过期，请重新获取";
    }
  }, 1000);
}

function resetWx(): void {
  stopWxPolling();
  stopWxCountdown();
  wxQr.value = null;
  wxStatusText.value = "";
  wxError.value = "";
  wxRoles.value = [];
  wxSelected.value = [];
  wxSessionId.value = "";
}

async function fetchWxQr(): Promise<void> {
  resetWx();
  wxLoading.value = true;
  try {
    const qr = await api.post<WechatQr>("/api/wx/qrcode");
    wxQr.value = qr;
    wxStatusText.value = "等待扫码…";
    startWxCountdown();
    void pollWxScan(qr.uuid, ++wxPollToken);
  } catch (error) {
    wxError.value = (error as Error).message;
  } finally {
    wxLoading.value = false;
  }
}

/** 顺序轮询：服务端长轮询约 15 秒返回一次，不要用 setInterval 叠请求 */
async function pollWxScan(uuid: string, token: number): Promise<void> {
  while (token === wxPollToken && wxQr.value?.uuid === uuid) {
    let result: WechatScanResult;
    try {
      result = await api.get<WechatScanResult>(
        `/api/wx/status?uuid=${encodeURIComponent(uuid)}`,
      );
    } catch (error) {
      wxError.value = (error as Error).message;
      return;
    }
    if (token !== wxPollToken) return;

    if (result.status === "expired") {
      stopWxCountdown();
      wxQr.value = null;
      wxStatusText.value = "二维码已过期，请重新获取";
      return;
    }
    if (result.status === "scanned") {
      wxStatusText.value = "已扫码，请在微信中确认";
    } else if (result.status === "confirmed" && result.code) {
      stopWxCountdown();
      wxStatusText.value = "已确认，正在登录…";
      try {
        const session = await api.post<WechatSessionView>(
          "/api/wx/complete",
          { code: result.code, nickname: result.nickname },
        );
        wxSessionId.value = session.sessionId;
        wxRoles.value = session.roles;
        wxSelected.value = session.roles.map((role) => role.serverId);
        wxStatusText.value = session.nickname
          ? `登录成功：${session.nickname}`
          : "登录成功，请勾选要导入的角色";
      } catch (error) {
        wxError.value = (error as Error).message;
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function importWxSelected(): Promise<void> {
  if (!wxSessionId.value || wxSelected.value.length === 0) return;
  submitting.value = true;
  try {
    const selected = wxRoles.value.filter((role) =>
      wxSelected.value.includes(role.serverId),
    );
    const result = await api.post<{
      created: number;
      updated: number;
      failed: number;
    }>("/api/wx/import", {
      sessionId: wxSessionId.value,
      roles: selected.map((role) => ({
        serverId: role.serverId,
        roleId: role.roleId,
        name: role.name,
      })),
    });
    message.success(
      `导入完成：新增 ${result.created}，更新 ${result.updated}，失败 ${result.failed}`,
    );
    await load();
    showAdd.value = false;
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

watch(showAdd, (open) => {
  if (!open) resetWx();
});

onMounted(load);
</script>

<style scoped>
.identity-card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 18px 20px;
  background: linear-gradient(135deg, #ffffff, #f8fafc);
  margin-bottom: 16px;
}

.identity-title {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.identity-icon {
  font-size: 22px;
}

.identity-title-main {
  font-weight: 600;
  font-size: 15px;
}

.identity-body {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}

.identity-avatar {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.identity-name {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 6px;
}

.legacy-tag {
  margin-left: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
  vertical-align: middle;
  font-weight: 500;
}

.legacy-green {
  background: #22c55e;
}

.legacy-blue {
  background: #3b82f6;
}

.legacy-purple {
  background: #8b5cf6;
}

.legacy-orange {
  background: #f59e0b;
}

.legacy-red {
  background: #ef4444;
}

.legacy-gold {
  background: linear-gradient(135deg, #fbbf24, #d97706);
}

.hero-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 8px;
}

.hero-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 56px;
}

.hero-avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: cover;
  background: #f3f4f6;
}

.hero-name {
  font-size: 11px;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 56px;
}

.identity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #374151;
  margin-bottom: 4px;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.resource-chip {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.resource-label {
  color: #6b7280;
}

.resource-value {
  font-weight: 600;
  color: #111827;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.feature-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
}

.feature-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 10px;
}

.feature-big {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 8px;
}

.feature-line {
  font-size: 12px;
  color: #374151;
  line-height: 1.8;
}

.batch-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
}

.batch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  min-width: 180px;
}

.toolbar-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.daily-status-card {
  border: 1px solid #d1fae5;
  background: #f0fdf4;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.daily-status-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #065f46;
  margin-bottom: 8px;
}

.daily-task-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;
}

.daily-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.daily-task-label {
  flex: 1;
  min-width: 0;
  color: #374151;
}

.daily-task-progress {
  color: #6b7280;
  font-family: Consolas, monospace;
}

.action-group {
  margin-bottom: 20px;
}

.group-title {
  font-weight: 600;
  font-size: 13px;
  margin: 8px 0 10px;
  color: #374151;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
}

.action-icon {
  font-size: 18px;
  line-height: 1;
}

.action-main {
  flex: 1;
  min-width: 0;
}

.action-name {
  font-weight: 500;
  font-size: 13px;
}

.action-status {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-status.success {
  color: #16a34a;
}

.action-status.completed {
  color: #16a34a;
}

.action-status.failed {
  color: #dc2626;
}

.action-status.skipped {
  color: #d97706;
}

.action-play {
  border: none;
  background: #f3f4f6;
  color: #374151;
  border-radius: 8px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  flex: 0 0 auto;
}

.action-play:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.day-row {
  display: flex;
  gap: 8px;
  overflow: auto;
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.day-tile {
  min-width: 64px;
  padding: 8px 6px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.day-tile.active {
  background: #10b981;
  border-color: #10b981;
  color: #fff;
}

.day-label {
  font-size: 12px;
  font-weight: 600;
}

.day-date {
  font-size: 11px;
  opacity: 0.8;
}

.log-group {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.log-group-head.clickable {
  cursor: pointer;
  user-select: none;
}

.log-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chevron {
  display: inline-block;
  font-size: 10px;
  color: #9ca3af;
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.log-group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #4b5563;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e5e7eb;
  margin-bottom: 6px;
}

.log-entry {
  display: flex;
  gap: 10px;
  font-size: 12px;
  line-height: 1.8;
}

.log-entry-time {
  color: #9ca3af;
  font-family: Consolas, monospace;
  flex: 0 0 auto;
}

.log-entry-msg.error {
  color: #dc2626;
}

.log-entry-msg.warning {
  color: #d97706;
}

.log-entry-msg.success {
  color: #16a34a;
}

.growth-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.growth-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.growth-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
}

.growth-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.growth-label {
  font-size: 13px;
  font-weight: 500;
}

.growth-value {
  font-size: 14px;
  font-weight: 600;
}

.growth-value.up {
  color: #16a34a;
}

.growth-value.down {
  color: #dc2626;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.group-chip {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
}

.group-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed #e5e7eb;
}

.group-row:last-of-type {
  border-bottom: none;
}
.wx-qr-placeholder {
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}
.wx-qr-placeholder:hover {
  border-color: #1677ff;
  color: #1677ff;
}
.wx-qr-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.wx-qr-image {
  width: 220px;
  height: 220px;
  border-radius: 12px;
  background: #fff;
}
.wx-qr-status {
  color: #64748b;
  font-size: 13px;
}
</style>
