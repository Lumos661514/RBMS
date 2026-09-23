<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
    <el-header class="client-layout-bar">
      <div class="client-layout-brand">门店预约系统</div>
      <el-menu
        class="client-layout-nav"
        mode="horizontal"
        :router="true"
        :default-active="menuActive"
      >
        <el-menu-item index="/book">项目</el-menu-item>
        <el-menu-item index="/book/account">我的</el-menu-item>
      </el-menu>
      <div class="client-layout-user">
        <span>{{ displayName }}</span>
        <el-button link type="primary" @click="logout">退出</el-button>
      </div>
    </el-header>
    <el-main class="client-layout-body">
      <router-view />
    </el-main>
  </div>
</template>

<style scoped>
/* 顾客端：顶栏导航，和左侧后台壳区分 */
.client-layout {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.client-layout-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 0 28px;
  background: #eef1f4;
  border-bottom: 1px solid #d9dee3;
}

.client-layout-brand {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #1c2430;
  flex-shrink: 0;
}

.client-layout-nav {
  flex: 1;
  border-bottom: none;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
}

/* 顶栏当前项用底边标出，避免和未选中项一样 */
.client-layout-nav :deep(.el-menu-item.is-active) {
  color: #1f4e79 !important;
  border-bottom-color: #1f4e79 !important;
  background: transparent !important;
}

.client-layout-user {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #52606d;
}

.client-layout-body {
  flex: 1;
  background: #eef1f4;
}
</style>
