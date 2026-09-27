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
  <div class="auth-shell">
    <!-- 左侧品牌面：产品名主导，时刻表竖线作几何 -->
    <aside class="auth-brand" aria-hidden="true">
      <div class="auth-brand-mark" />
      <h1>门店预约系统</h1>
      <p class="auth-brand-lead">店长管排班与预约，顾客自助约项目。两端分离，容量按在岗算。</p>
    </aside>

    <section class="auth-panel">
      <div class="auth-panel-inner">
        <h2 class="auth-panel-title">登录</h2>
        <p class="auth-panel-lead">使用手机号进入管理端或顾客端。</p>
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
          <div class="auth-extra">
            <RouterLink class="auth-extra-link" to="/register">注册账号</RouterLink>
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
              <span class="login-demo-role">{{ account.role }}</span>
              <span>{{ account.phone }} / {{ account.password }}</span>
            </button>
          </div>
          <!-- 登录失败或校验失败时展示，成功则跳走 -->
          <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
          <el-button class="auth-submit" type="primary" native-type="submit" :loading="submitting">
            登录
          </el-button>
        </el-form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-demo {
  margin-bottom: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-muted);
}

.login-demo p {
  margin: 0 0 8px;
}

.login-demo-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  margin: 0 0 6px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.login-demo-row:hover {
  border-color: var(--color-primary);
  background: var(--color-list-active);
}

.login-demo-role {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--color-primary);
}
</style>
