<script setup>
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { NAME_KEY, clearSession } from '@/api/request'

const route = useRoute()
const router = useRouter()

/** 顶栏当前用户名 */
const displayName = localStorage.getItem(NAME_KEY) || ''
/** 向导不算独立菜单，停留时仍点亮「项目」 */
const menuActive = computed(() =>
  route.path.startsWith('/book/account') ? '/book/account' : '/book',
)

/** 清本地登录态并回到登录页。 */
function logout() {
  clearSession()
  router.replace('/login')
}
</script>

<template>
  <div class="client-layout">
    <!-- 顾客端浅色顶栏，与管理端石墨轨区分门户 -->
    <header class="client-layout-bar">
      <div class="client-layout-brand">
        <span class="client-layout-brand-mark" aria-hidden="true" />
        门店预约系统
      </div>
      <nav class="client-layout-nav" aria-label="顾客端菜单">
        <RouterLink
          to="/book"
          class="client-layout-link"
          :class="{ 'is-active': menuActive === '/book' }"
        >
          项目
        </RouterLink>
        <RouterLink
          to="/book/account"
          class="client-layout-link"
          :class="{ 'is-active': menuActive === '/book/account' }"
        >
          我的
        </RouterLink>
      </nav>
      <div class="client-layout-user">
        <span>{{ displayName }}</span>
        <el-button link type="primary" @click="logout">退出</el-button>
      </div>
    </header>
    <main class="client-layout-body">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.client-layout {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.client-layout-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 64px;
  padding: 0 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.client-layout-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text);
  flex-shrink: 0;
}

.client-layout-brand-mark {
  width: 18px;
  height: 3px;
  background: var(--color-accent);
}

.client-layout-nav {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  height: 100%;
}

.client-layout-link {
  display: flex;
  align-items: center;
  padding: 0 12px;
  color: var(--color-text-muted);
  font-size: 14px;
  text-decoration: none;
  border-bottom: 2px solid transparent;
}

.client-layout-link:hover {
  color: var(--color-text);
}

.client-layout-link.is-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.client-layout-user {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
}

.client-layout-body {
  flex: 1;
  padding: var(--page-inset);
}
</style>
