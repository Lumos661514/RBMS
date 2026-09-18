<script setup>
import { useRoute, useRouter } from 'vue-router'
import { NAME_KEY, ROLE_KEY, clearSession } from '@/api/request'

const route = useRoute()
const router = useRouter()

/** 顶栏当前用户名 */
const displayName = localStorage.getItem(NAME_KEY) || ''
/** 用来决定菜单是否显示系统设置 */
const role = localStorage.getItem(ROLE_KEY) || ''

/**
 * 当前是否高亮该菜单。
 * @param {string} path
 */
function isActive(path) {
  return route.path === path
}

/** 清本地登录态并回到登录页。 */
function logout() {
  clearSession()
  router.replace('/login')
}
</script>

<template>
  <div class="app-layout">
    <aside class="app-layout-side">
      <h1 class="app-layout-title">预约后台</h1>
      <nav class="app-layout-nav">
        <router-link
          class="app-layout-link"
          :class="{ 'is-active': isActive('/board') }"
          to="/board"
        >
          预约看板
        </router-link>
        <router-link
          class="app-layout-link"
          :class="{ 'is-active': isActive('/users') }"
          to="/users"
        >
          用户管理
        </router-link>
        <router-link
          class="app-layout-link"
          :class="{ 'is-active': isActive('/services') }"
          to="/services"
        >
          项目介绍
        </router-link>
        <!-- 仅管理员可改服务目录 -->
        <router-link
          v-if="role === 'admin'"
          class="app-layout-link"
          :class="{ 'is-active': isActive('/service-manage') }"
          to="/service-manage"
        >
          项目管理
        </router-link>
        <router-link
          v-if="role === 'admin'"
          class="app-layout-link"
          :class="{ 'is-active': isActive('/employees') }"
          to="/employees"
        >
          员工管理
        </router-link>
        <!-- 仅管理员看到系统设置 -->
        <router-link
          v-if="role === 'admin'"
          class="app-layout-link"
          :class="{ 'is-active': isActive('/settings') }"
          to="/settings"
        >
          系统设置
        </router-link>
      </nav>
    </aside>
    <div class="app-layout-main">
      <header class="app-layout-bar">
        <span>{{ displayName }}</span>
        <button type="button" class="app-layout-logout" @click="logout">退出</button>
      </header>
      <div class="app-layout-body">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 左侧菜单 + 右侧内容的后台壳 */
.app-layout {
  display: flex;
  min-height: 100vh;
  min-width: 1000px;
}

.app-layout-side {
  width: 200px;
  flex-shrink: 0;
  background: #1f4e79;
  color: #fff;
  padding: 20px 12px;
}

.app-layout-title {
  margin: 0 12px 24px;
  font-size: 18px;
}

.app-layout-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-layout-link {
  padding: 10px 12px;
  border-radius: 4px;
  color: #d9e8f5;
  text-decoration: none;
}

.app-layout-link.is-active,
.app-layout-link:hover {
  background: #163a5c;
  color: #fff;
}

.app-layout-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-layout-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid #e4e7eb;
}

.app-layout-logout {
  border: 0;
  background: none;
  color: #1f4e79;
  cursor: pointer;
}

.app-layout-body {
  flex: 1;
  padding: 20px 24px 40px;
}
</style>
