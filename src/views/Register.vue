<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { login, register } from '@/api/auth'
import { saveSession } from '@/api/request'

const router = useRouter()

/** 注册手机号，须未被占用 */
const phone = ref('')
/** 展示名，预约格子上会用这个名字 */
const name = ref('')
/** 登录密码 */
const password = ref('')
/** 校验或接口失败时展示 */
const errorText = ref('')
/** 注册请求进行中 */
const submitting = ref(false)

/**
 * 注册为普通用户并立刻登录，进入预约看板。
 */
async function onSubmit() {
  errorText.value = ''
  if (!phone.value.trim() || !name.value.trim() || !password.value) {
    errorText.value = '请填写手机号、姓名和密码'
    return
  }
  submitting.value = true
  try {
    const phoneValue = phone.value.trim()
    const passwordValue = password.value
    await register({
      phone: phoneValue,
      name: name.value.trim(),
      password: passwordValue,
    })
    const data = await login({ phone: phoneValue, password: passwordValue })
    saveSession(data)
    await router.replace('/board')
  } catch (error) {
    errorText.value = error.message || '注册失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="register-page">
    <form class="register-card" @submit.prevent="onSubmit">
      <h1>注册账号</h1>
      <label>
        手机号
        <input v-model="phone" type="text" autocomplete="username" />
      </label>
      <label>
        姓名
        <input v-model="name" type="text" />
      </label>
      <label>
        密码
        <input v-model="password" type="password" autocomplete="new-password" />
      </label>
      <!-- 注册失败时展示 -->
      <p v-if="errorText" class="register-error">{{ errorText }}</p>
      <button type="submit" :disabled="submitting">
        {{ submitting ? '提交中…' : '注册' }}
      </button>
      <RouterLink class="register-back" to="/login">返回登录</RouterLink>
    </form>
  </div>
</template>

<style scoped>
/* 注册页沿用登录卡片布局 */
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.register-card {
  width: 360px;
  padding: 28px 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.register-card h1 {
  margin: 0 0 8px;
  font-size: 20px;
  text-align: center;
}

.register-card label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #52606d;
}

.register-card input {
  padding: 8px 10px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
}

.register-error {
  margin: 0;
  color: #c81e1e;
  font-size: 13px;
}

.register-card button {
  padding: 10px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.register-card button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.register-back {
  text-align: center;
  color: #1f4e79;
  font-size: 13px;
  text-decoration: none;
}
</style>
