import { ref } from "vue";
import { api } from "./api";

export interface CurrentUser {
  id: string;
  username: string;
}

export const currentUser = ref<CurrentUser | null>(null);
let checked = false;

export async function ensureAuth(force = false): Promise<boolean> {
  if (checked && currentUser.value && !force) return true;
  try {
    const result = await api.get<{ user: CurrentUser }>("/api/auth/me");
    currentUser.value = result.user;
    checked = true;
    return true;
  } catch {
    currentUser.value = null;
    checked = true;
    return false;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<void> {
  const result = await api.post<{ user: CurrentUser }>("/api/auth/login", {
    username,
    password,
  });
  currentUser.value = result.user;
  checked = true;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
  currentUser.value = null;
  checked = true;
}
