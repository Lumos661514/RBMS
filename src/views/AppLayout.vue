<script setup>
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { NAME_KEY, clearSession } from '@/api/session'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const route = useRoute()
const router = useRouter()

/** 顶栏当前用户名 */
const displayName = localStorage.getItem(NAME_KEY) || ''

/** 管理端导航：自定义轨，不用 Element 默认藏青菜单 */
const navItems = [
  { path: '/board', label: '预约看板' },
  { path: '/users', label: '用户管理' },
  { path: '/service-manage', label: '项目管理' },
  { path: '/employees', label: '员工管理' },
  { path: '/stats', label: '占用与营收' },
  { path: '/settings', label: '系统设置' },
]

/**
 * 当前路由是否命中该菜单项。
 * @param {string} path
 */
function isActive(path) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

/** 清本地登录态并回到登录页。 */
function logout() {
  clearSession()
  router.replace('/login')
}
</script>

<template>
  <el-config-provider :locale="zhCn">
  <el-container class="app-layout">
    <el-aside class="app-layout-side" width="220px">
      <div class="app-layout-brand">
        <span class="app-layout-brand-mark" aria-hidden="true" />
        <h1 class="app-layout-title">门店预约系统</h1>
      </div>
      <nav class="app-layout-nav" aria-label="管理端菜单">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="app-layout-link"
          :class="{ 'is-active': isActive(item.path) }"
        >
          <span class="app-layout-link-tick" aria-hidden="true" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </el-aside>
    <el-container>
      <el-header class="app-layout-bar">
        <span class="app-layout-user">{{ displayName }}</span>
        <el-button link type="primary" @click="logout">退出</el-button>
      </el-header>
      <el-main class="app-layout-body">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
  </el-config-provider>
</template>

<style scoped>
/* 左侧石墨轨 + 右侧工作面 */
.app-layout {
  min-height: 100dvh;
  /* 看板表格按桌面宽度排，管理端保持原来的最小宽度；顾客端不套这层 */
  min-width: 1000px;
}

.app-layout-side {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--color-sidebar);
  color: #f2f4f7;
}

.app-layout-brand {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 28px 20px 20px;
}

.app-layout-brand-mark {
  display: block;
  width: 22px;
  height: 3px;
  background: var(--color-accent);
}

.app-layout-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.35;
  color: #f2f4f7;
}

.app-layout-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 24px;
}

.app-layout-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 4px;
  color: var(--color-sidebar-text);
  font-size: 14px;
  line-height: 1.3;
  text-decoration: none;
  transition: background-color 140ms ease, color 140ms ease;
}

.app-layout-link:hover {
  color: #fff;
  background: color-mix(in srgb, #fff 6%, transparent);
}

.app-layout-link.is-active {
  color: #fff;
  background: color-mix(in srgb, #fff 10%, transparent);
  font-weight: 600;
}

/* 铜点标当前项，避免用 >1px 色条当卡片装饰 */
.app-layout-link-tick {
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: transparent;
  flex-shrink: 0;
}

.app-layout-link.is-active .app-layout-link-tick {
  background: var(--color-accent);
}

.app-layout-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  height: 64px;
  padding: 0 24px;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.app-layout-user {
  color: var(--color-text-muted);
}

.app-layout-body {
  background: var(--color-bg);
  padding: var(--page-inset);
}
</style>
