<script setup>
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { login, register } from '@/api/auth'
import { saveSession } from '@/api/request'
import { homePath } from '@/utils/portal'

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
 * 注册为普通用户并立刻登录，进入顾客预约端。
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
    await router.replace(homePath(data.role))
  } catch (error) {
    errorText.value = error.message || '注册失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="register-page">
    <el-card class="register-card" shadow="never">
      <h1>门店预约系统</h1>
      <p class="register-lead">填写手机号、姓名和密码完成注册。</p>
      <!-- 标签放在输入框上方，与登录页同一套排版，避免标签字数不同导致框宽错位 -->
      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="手机号">
          <el-input v-model="phone" autocomplete="username" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="name" autocomplete="nickname" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="请输入密码"
          />
        </el-form-item>
        <div class="register-extra">
          <RouterLink class="register-extra-link" to="/login">返回登录</RouterLink>
        </div>
        <!-- 注册失败时展示 -->
        <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
        <el-button class="register-submit" type="primary" native-type="submit" :loading="submitting">
          注册
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
/* 注册页跟登录页同一套居中白底 */
.register-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.register-card {
  width: 400px;
  border: 1px solid #d9dee3;
  border-radius: 2px;
  background: #fff;
  box-shadow: none;
}

.register-card :deep(.el-card__body) {
  padding: 36px 32px 32px;
}

.register-card :deep(.el-input) {
  width: 100%;
}

.register-card h1 {
  margin: 0 0 12px;
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.register-lead {
  margin: 0 0 28px;
  max-width: 36ch;
  font-size: 16px;
  line-height: 1.6;
  color: #5c6770;
}

.register-extra {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.register-extra-link {
  color: #1f4e79;
  font-size: 13px;
  text-decoration: none;
}

.register-submit {
  width: 100%;
  margin-top: 8px;
}
</style>
