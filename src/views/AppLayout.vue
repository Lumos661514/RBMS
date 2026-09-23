<script setup>
import { useRoute, useRouter } from 'vue-router'
import { NAME_KEY, clearSession } from '@/api/request'

const route = useRoute()
const router = useRouter()

/** 顶栏当前用户名 */
const displayName = localStorage.getItem(NAME_KEY) || ''

/** 清本地登录态并回到登录页。 */
function logout() {
  clearSession()
  router.replace('/login')
}
</script>

<template>
  <el-container class="app-layout">
    <el-aside class="app-layout-side" width="200px">
      <h1 class="app-layout-title">门店预约系统</h1>
      <el-menu
        :router="true"
        :default-active="route.path"
        background-color="#1f4e79"
        text-color="#d9e8f5"
        active-text-color="#ffffff"
      >
        <el-menu-item index="/board">预约看板</el-menu-item>
        <el-menu-item index="/users">用户管理</el-menu-item>
        <el-menu-item index="/services">项目介绍</el-menu-item>
        <el-menu-item index="/service-manage">项目管理</el-menu-item>
        <el-menu-item index="/employees">员工管理</el-menu-item>
        <el-menu-item index="/stats">占用与营收</el-menu-item>
        <el-menu-item index="/settings">系统设置</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-layout-bar">
        <span>{{ displayName }}</span>
        <el-button link type="primary" @click="logout">退出</el-button>
      </el-header>
      <el-main class="app-layout-body">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
/* 左侧菜单 + 右侧内容的后台壳 */
.app-layout {
  min-height: 100dvh;
  min-width: 1000px;
}

.app-layout-side {
  background: #1f4e79;
  color: #fff;
}

.app-layout-title {
  margin: 28px 20px 16px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
  /* 标题靠左，和菜单项对齐 */
  text-align: left;
}

.app-layout-side :deep(.el-menu) {
  border-right: none;
}

/* 当前项字色和底色太接近，点击后看不出选中 */
.app-layout-side :deep(.el-menu-item.is-active) {
  color: #fff !important;
  background-color: #163a5c !important;
}

.app-layout-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  height: 64px;
  background: #eef1f4;
  border-bottom: 1px solid #d9dee3;
}

.app-layout-body {
  background: #eef1f4;
}
</style>
