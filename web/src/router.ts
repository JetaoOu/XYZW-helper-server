import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { ensureAuth } from "./auth";
import Login from "./views/Login.vue";
import MainLayout from "./layouts/MainLayout.vue";
import Overview from "./views/Overview.vue";
import Roles from "./views/Roles.vue";
import Schedules from "./views/Schedules.vue";
import Runs from "./views/Runs.vue";
import Settings from "./views/Settings.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: Login,
    meta: { public: true },
  },
  {
    path: "/",
    component: MainLayout,
    children: [
      { path: "", redirect: "/overview" },
      { path: "overview", name: "overview", component: Overview },
      { path: "roles", name: "roles", component: Roles },
      { path: "schedules", name: "schedules", component: Schedules },
      { path: "runs", name: "runs", component: Runs },
      { path: "settings", name: "settings", component: Settings },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const authenticated = await ensureAuth();
  if (authenticated) return true;
  return { name: "login", query: { redirect: to.fullPath } };
});
