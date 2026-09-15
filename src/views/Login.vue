<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { NAME_KEY, TOKEN_KEY } from '@/api/request'

const route = useRoute()
const router = useRouter()

/** 演示账号预填，与 Mock 写死的手机号一致 */
const phone = ref('13800000000')
/** 演示密码预填 */
const password = ref('123456')
/** 校验或接口失败时展示 */
const errorText = ref('')
/** 登录请求进行中 */
const submitting = ref(false)

/**
 * 提交登录；成功后写入 token，跳回守卫记下的页面。
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
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(NAME_KEY, data.name)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/board'
    await router.replace(redirect)
  } catch (error) {
    errorText.value = error.message || '登录失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <form class="login-card" @submit.prevent="onSubmit">
      <h1>预约后台管理系统</h1>
      <label>
        手机号
        <input v-model="phone" type="text" autocomplete="username" />
      </label>
      <label>
        密码
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <!-- 登录失败或校验失败时展示，成功则跳走 -->
      <p v-if="errorText" class="login-error">{{ errorText }}</p>
      <button type="submit" :disabled="submitting">
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

.login-error {
  margin: 0;
  color: #c81e1e;
  font-size: 13px;
}

.login-card button {
  margin-top: 4px;
  padding: 10px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.login-card button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
