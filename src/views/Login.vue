<script setup>
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { saveSession } from '@/api/request'

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
 * 提交登录；成功后写入 token，默认进预约看板。
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
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/board'
    await router.replace(redirect)
  } catch (error) {
    errorText.value = error.message || '登录失败'
  } finally {
    submitting.value = false
  }
}

/** 忘记密码第一版不做流程，只提示。 */
function onForgot() {
  window.alert('忘记密码功能暂未开放')
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" @submit.prevent="onSubmit">
      <h1>预约后台管理系统</h1>
      <label>
        手机号
          <input v-model="phone" type="text" autocomplete="username" placeholder="请输入手机号" />
      </label>
      <label>
        密码
          <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" />
      </label>
      <div class="login-extra">
        <RouterLink class="login-extra-link" to="/register">注册账号</RouterLink>
        <button type="button" class="login-extra-link" @click="onForgot">忘记密码</button>
      </div>
      <!-- 登录失败或校验失败时展示，成功则跳走 -->
      <p v-if="errorText" class="login-error">{{ errorText }}</p>
      <button type="submit" class="login-submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
/* 登录页：居中卡片，与看板宽表区分 */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  width: 360px;
  padding: 28px 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-card h1 {
  margin: 0 0 8px;
  font-size: 20px;
  text-align: center;
}

.login-card label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #52606d;
}

.login-card input {
  padding: 8px 10px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
}

.login-extra {
  display: flex;
  justify-content: space-between;
}

.login-extra-link {
  border: 0;
  padding: 0;
  background: none;
  color: #1f4e79;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
}

.login-error {
  margin: 0;
  color: #c81e1e;
  font-size: 13px;
}

.login-submit {
  margin-top: 4px;
  padding: 10px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.login-submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
