<script setup>
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/api/auth'
import { saveSession } from '@/api/request'
import { homePath, isPathForRole } from '@/utils/portal'

const route = useRoute()
const router = useRouter()

/** 登录输入，不预填账号密码 */
const phone = ref('')
/** 登录密码 */
const password = ref('')
/** 校验或接口失败时展示 */
const errorText = ref('')
/** 登录请求进行中 */
const submitting = ref(false)

/**
 * 提交登录；成功后写入 token，管理员进后台，顾客进预约端。
 */
async function onSubmit() {
  errorText.value = ''
  if (!phone.value.trim() || !password.value) {
    errorText.value = '请输入手机号和密码'
    return
  }
  submitting.value = true
  try {
    const data = await login({ phone: phone.value.trim(), password: password.value })
    saveSession(data)
    const fallback = homePath(data.role)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    const next = redirect && isPathForRole(redirect, data.role) ? redirect : fallback
    await router.replace(next)
  } catch (error) {
    errorText.value = error.message || '登录失败'
  } finally {
    submitting.value = false
  }
}

/** 忘记密码第一版不做流程，只提示。 */
function onForgot() {
  ElMessage.info('忘记密码功能暂未开放')
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>预约系统</h1>
      <p class="login-lead">顾客预约请注册或登录；管理员登录后进入后台。</p>
      <!-- 标签放在输入框上方，避免「手机号」「密码」字数不同导致框宽错位 -->
      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="手机号">
          <el-input v-model="phone" autocomplete="username" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="请输入密码"
          />
        </el-form-item>
        <div class="login-extra">
          <RouterLink class="login-extra-link" to="/register">注册账号</RouterLink>
          <el-button link type="primary" @click="onForgot">忘记密码</el-button>
        </div>
        <!-- 登录失败或校验失败时展示，成功则跳走 -->
        <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
        <el-button class="login-submit" type="primary" native-type="submit" :loading="submitting">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
/* 登录页：居中卡片 */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  width: 380px;
}

.login-card h1 {
  margin: 0 0 8px;
  font-size: 20px;
  text-align: center;
}

.login-lead {
  margin: 0 0 16px;
  text-align: center;
  font-size: 13px;
  color: #616e7c;
}

.login-extra {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.login-extra-link {
  color: #1f4e79;
  font-size: 13px;
  text-decoration: none;
}

.login-submit {
  width: 100%;
  margin-top: 8px;
}
</style>
