<template>
  <n-layout has-sider style="height: 100vh">
    <n-layout-sider bordered :width="208" content-style="padding-top: 12px">
      <div class="brand">XYZW 定时任务</div>
      <n-menu
        :value="activeKey"
        :options="menuOptions"
        @update:value="handleMenu"
      />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="header">
        <span class="header-title">{{ currentTitle }}</span>
        <span class="header-user">
          {{ currentUser?.username ?? "" }}
          <n-button size="small" quaternary @click="handleLogout">
            退出
          </n-button>
        </span>
      </n-layout-header>
      <n-layout-content content-style="padding: 0">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  type MenuOption,
} from "naive-ui";
import { currentUser, logout } from "../auth";

const route = useRoute();
const router = useRouter();

const menuOptions: MenuOption[] = [
  { label: "总览", key: "/overview" },
  { label: "角色", key: "/roles" },
  { label: "计划", key: "/schedules" },
  { label: "运行记录", key: "/runs" },
  { label: "设置", key: "/settings" },
];

const titles: Record<string, string> = {
  "/overview": "总览",
  "/roles": "角色管理",
  "/schedules": "计划管理",
  "/runs": "运行记录",
  "/settings": "设置",
};

const activeKey = computed(() => route.path);
const currentTitle = computed(() => titles[route.path] ?? "");

function handleMenu(key: string): void {
  if (key !== route.path) void router.push(key);
}

async function handleLogout(): Promise<void> {
  try {
    await logout();
  } finally {
    void router.replace("/login");
  }
}
</script>

<style scoped>
.brand {
  padding: 8px 20px 16px;
  font-weight: 600;
  font-size: 15px;
  color: #1f2937;
}

.header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-title {
  font-weight: 600;
}

.header-user {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4b5563;
  font-size: 13px;
}
</style>
