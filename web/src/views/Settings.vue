<template>
  <div class="page">
    <div class="page-header">
      <h2>设置</h2>
      <n-button @click="load" :loading="loading">刷新</n-button>
    </div>

    <n-space vertical size="large" style="max-width: 720px">
      <n-card size="small" title="执行参数">
        <n-form label-placement="left" label-width="160">
          <n-form-item label="全局并发角色数">
            <n-input-number v-model:value="form.maxConcurrentRoles" :min="1" :max="10" />
          </n-form-item>
          <n-form-item label="连接间隔（毫秒）">
            <n-input-number v-model:value="form.connectionDelayMs" :min="0" :max="10000" :step="100" />
          </n-form-item>
          <n-form-item label="命令间隔（毫秒）">
            <n-input-number v-model:value="form.commandDelayMs" :min="0" :max="10000" :step="100" />
          </n-form-item>
          <n-form-item label="动作间隔（毫秒）">
            <n-input-number v-model:value="form.taskDelayMs" :min="0" :max="10000" :step="100" />
          </n-form-item>
          <n-form-item label="凭据刷新阈值（小时）">
            <n-input-number v-model:value="form.credentialRefreshHours" :min="1" :max="72" />
          </n-form-item>
          <n-form-item label="游戏 clientVersion">
            <n-input v-model:value="form.clientVersion" />
          </n-form-item>
          <n-form-item label="platform">
            <n-input v-model:value="form.platform" />
          </n-form-item>
          <n-form-item label="告警 Webhook（预留）">
            <n-input v-model:value="form.webhookUrl" placeholder="暂未启用" />
          </n-form-item>
        </n-form>
        <div class="form-actions">
          <n-button type="primary" :loading="saving" @click="save">
            保存设置
          </n-button>
        </div>
      </n-card>

      <n-card size="small" title="修改密码">
        <n-form label-placement="left" label-width="160">
          <n-form-item label="当前密码">
            <n-input v-model:value="passwordForm.currentPassword" type="password" show-password-on="click" />
          </n-form-item>
          <n-form-item label="新密码（至少 8 位）">
            <n-input v-model:value="passwordForm.newPassword" type="password" show-password-on="click" />
          </n-form-item>
          <n-form-item label="确认新密码">
            <n-input v-model:value="passwordForm.confirm" type="password" show-password-on="click" />
          </n-form-item>
        </n-form>
        <div class="form-actions">
          <n-button type="warning" :loading="changing" @click="changePassword">
            修改密码
          </n-button>
        </div>
      </n-card>

      <n-card size="small" title="关于">
        <p class="muted">
          所有计划时间按 Asia/Shanghai 解释；凭据使用 AES-256-GCM 加密存储；
          运行记录永久保留，命令日志保留 30 天；数据库每日 03:00 备份并保留 7 份。
        </p>
      </n-card>
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSpace,
  useMessage,
} from "naive-ui";
import { api, type AppSettings } from "../api";
import { currentUser } from "../auth";

const message = useMessage();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const changing = ref(false);

const form = reactive<AppSettings>({
  maxConcurrentRoles: 3,
  connectionDelayMs: 1000,
  commandDelayMs: 500,
  taskDelayMs: 500,
  clientVersion: "",
  platform: "",
  credentialRefreshHours: 12,
  webhookUrl: "",
});

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirm: "",
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await api.get<{ settings: AppSettings }>("/api/settings");
    Object.assign(form, result.settings);
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const result = await api.patch<{ settings: AppSettings }>(
      "/api/settings",
      { ...form },
    );
    Object.assign(form, result.settings);
    message.success("设置已保存");
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    saving.value = false;
  }
}

async function changePassword(): Promise<void> {
  if (passwordForm.newPassword !== passwordForm.confirm) {
    message.warning("两次输入的新密码不一致");
    return;
  }
  if (passwordForm.newPassword.length < 8) {
    message.warning("新密码至少 8 位");
    return;
  }
  changing.value = true;
  try {
    await api.post("/api/auth/password", {
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    message.success("密码已修改，请重新登录");
    currentUser.value = null;
    await router.replace("/login");
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    changing.value = false;
  }
}

onMounted(load);
</script>
