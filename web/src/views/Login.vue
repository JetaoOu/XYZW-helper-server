<template>
  <div class="login-page">
    <n-card class="login-card" title="XYZW 服务端定时任务">
      <n-form @submit.prevent="submit">
        <n-form-item label="用户名">
          <n-input v-model:value="username" placeholder="用户名" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-button
          type="primary"
          block
          :loading="loading"
          attr-type="submit"
        >
          登录
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  useMessage,
} from "naive-ui";
import { login } from "../auth";

const username = ref("");
const password = ref("");
const loading = ref(false);
const message = useMessage();
const router = useRouter();
const route = useRoute();

async function submit(): Promise<void> {
  if (!username.value || !password.value) {
    message.warning("请输入用户名和密码");
    return;
  }
  loading.value = true;
  try {
    await login(username.value.trim(), password.value);
    const redirect =
      typeof route.query.redirect === "string"
        ? route.query.redirect
        : "/overview";
    await router.replace(redirect);
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>
