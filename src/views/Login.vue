<script setup>
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
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

/** 演示站体验账号，点一行即可填入，避免面试官被登录页挡住 */
const demoAccounts = [
  { role: '顾客1', phone: '15158572063', password: '88888888' },
  { role: '店长', phone: '13800138001', password: '123456' },
]

/**
 * 把体验账号写入表单。
 * @param {{ phone: string, password: string }} account
 */
function fillDemo(account) {
  phone.value = account.phone
  password.value = account.password
  errorText.value = ''
}

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

</script>

<template>
  <div class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>门店预约系统</h1>
      <p class="login-lead">适配多种行业，预约管理更轻松。</p>
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
        </div>
        <!-- 体验账号只为演示站能直接走通预约，点按角色填入 -->
        <div class="login-demo">
          <p>体验账号（点击填入）</p>
          <button
            v-for="account in demoAccounts"
            :key="account.role"
            type="button"
            class="login-demo-row"
            @click="fillDemo(account)"
          >
            {{ account.role }} {{ account.phone }} / {{ account.password }}
          </button>
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
/* 登录表单收在页面中间，白底和灰底分开，避免贴在左侧 */
.login-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.login-card {
  width: 400px;
  border: 1px solid #d9dee3;
  border-radius: 2px;
  background: #fff;
  box-shadow: none;
}

.login-card :deep(.el-card__body) {
  padding: 36px 32px 32px;
}

.login-card :deep(.el-input) {
  width: 100%;
}

.login-card h1 {
  margin: 0 0 12px;
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.login-lead {
  margin: 0 0 28px;
  max-width: 36ch;
  font-size: 16px;
  line-height: 1.6;
  color: #5c6770;
}

.login-extra {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.login-demo {
  margin-bottom: 16px;
  padding-top: 12px;
  border-top: 1px solid #d9dee3;
  font-size: 13px;
  color: #5c6770;
}

.login-demo p {
  margin: 0 0 4px;
}

.login-demo-row {
  display: block;
  width: 100%;
  margin: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #1f4e79;
  font: inherit;
  text-align: left;
  cursor: pointer;
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
