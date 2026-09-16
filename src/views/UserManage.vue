<script setup>
import { computed, onMounted, ref } from 'vue'
import { deleteUser, getUserDetail, getUsers, updateUserPassword } from '@/api/user'
import { ROLE_KEY, USER_ID_KEY } from '@/api/request'
import { WEEKDAY_LABELS } from '@/config/schedule'

/** 管理员看列表；普通用户只看自己 */
const isAdmin = localStorage.getItem(ROLE_KEY) === 'admin'
const myId = localStorage.getItem(USER_ID_KEY) || ''

/** 管理员看到的普通用户列表 */
const users = ref([])
/** 当前详情里的用户 */
const detailUser = ref(null)
/** 该用户名下的预约 */
const detailBookings = ref([])
/** 新密码输入 */
const newPassword = ref('')
const loading = ref(false)
/** 首屏加载失败 */
const loadError = ref('')
/** 改密/删除失败，不挡住已加载的资料 */
const actionError = ref('')
/** 改密或删除进行中 */
const saving = ref(false)

/**
 * 预约列表上的时段文案。
 * @param {{ weekday: number, startHour: number, durationHours: number, serviceName: string }} booking
 */
function bookingLine(booking) {
  const start = String(booking.startHour).padStart(2, '0')
  const end = String(booking.startHour + booking.durationHours).padStart(2, '0')
  return `${WEEKDAY_LABELS[booking.weekday]} ${start}:00–${end}:00 · ${booking.serviceName}`
}

/**
 * 拉某个用户的资料和预约记录。
 * @param {string} id
 */
async function loadDetail(id) {
  const data = await getUserDetail(id)
  detailUser.value = data.user
  detailBookings.value = data.bookings || []
  newPassword.value = ''
  actionError.value = ''
}

/**
 * 管理员点左侧列表时切详情；失败不整页清空。
 * @param {string} id
 */
async function selectUser(id) {
  try {
    await loadDetail(id)
  } catch (error) {
    actionError.value = error.message || '加载失败'
  }
}

/**
 * 管理员拉用户列表并默认打开第一个；普通用户只拉自己。
 */
async function loadPage() {
  loading.value = true
  loadError.value = ''
  try {
    if (isAdmin) {
      const data = await getUsers()
      users.value = data.list || []
      if (users.value.length) {
        await loadDetail(users.value[0].id)
      } else {
        detailUser.value = null
        detailBookings.value = []
      }
    } else {
      await loadDetail(myId)
    }
  } catch (error) {
    loadError.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 修改当前详情用户的密码。
 */
async function onSavePassword() {
  if (!detailUser.value) return
  if (!newPassword.value) {
    actionError.value = '请填写新密码'
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    await updateUserPassword(detailUser.value.id, newPassword.value)
    newPassword.value = ''
    window.alert('密码已更新')
  } catch (error) {
    actionError.value = error.message || '修改失败'
  } finally {
    saving.value = false
  }
}

/**
 * 删除当前选中的普通用户，预约记录保留。
 */
async function onDeleteUser() {
  if (!detailUser.value) return
  saving.value = true
  actionError.value = ''
  try {
    await deleteUser(detailUser.value.id)
    await loadPage()
  } catch (error) {
    actionError.value = error.message || '删除失败'
  } finally {
    saving.value = false
  }
}

const emptyAdminList = computed(() => isAdmin && !users.value.length)

onMounted(loadPage)
</script>

<template>
  <div class="user-manage">
    <h2 class="user-manage-title">用户管理</h2>
    <!-- 加载或接口失败 -->
    <p v-if="loading">加载中…</p>
    <p v-else-if="loadError" class="user-manage-error">{{ loadError }}</p>

    <div v-else class="user-manage-body">
      <!-- 管理员：左侧普通用户列表 -->
      <ul v-if="isAdmin" class="user-manage-list">
        <li v-if="emptyAdminList" class="user-manage-empty">暂无普通用户</li>
        <li
          v-for="item in users"
          :key="item.id"
          class="user-manage-item"
          :class="{ 'is-active': detailUser && detailUser.id === item.id }"
        >
          <button type="button" @click="selectUser(item.id)">
            {{ item.name }} · {{ item.phone }}
          </button>
        </li>
      </ul>

      <section v-if="detailUser" class="user-manage-detail">
        <p>姓名：{{ detailUser.name }}</p>
        <p>手机号：{{ detailUser.phone }}</p>
        <h3>预约记录</h3>
        <!-- 没有预约时给空态 -->
        <p v-if="!detailBookings.length" class="user-manage-empty">暂无预约</p>
        <ul v-else class="user-manage-bookings">
          <li v-for="item in detailBookings" :key="item.id">{{ bookingLine(item) }}</li>
        </ul>
        <label>
          新密码
          <input v-model="newPassword" type="password" autocomplete="new-password" />
        </label>
        <p v-if="actionError" class="user-manage-error">{{ actionError }}</p>
        <div class="user-manage-actions">
          <button type="button" :disabled="saving" @click="onSavePassword">保存密码</button>
          <!-- 仅管理员能删除普通用户 -->
          <button
            v-if="isAdmin"
            type="button"
            class="user-manage-danger"
            :disabled="saving"
            @click="onDeleteUser"
          >
            删除账号
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 用户管理：管理员左右栏，普通用户只看详情 */
.user-manage-title {
  margin: 0 0 16px;
  font-size: 20px;
}

.user-manage-error {
  color: #c81e1e;
}

.user-manage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.user-manage-list {
  margin: 0;
  padding: 0;
  list-style: none;
  width: 240px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.user-manage-item button {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 0;
  background: none;
  cursor: pointer;
}

.user-manage-item.is-active button {
  background: #e6f2ff;
  color: #1f4e79;
}

.user-manage-detail {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-manage-detail h3 {
  margin: 8px 0 0;
  font-size: 15px;
}

.user-manage-empty {
  color: #7b8794;
  font-size: 13px;
}

.user-manage-bookings {
  margin: 0;
  padding-left: 18px;
}

.user-manage-detail label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #52606d;
}

.user-manage-detail input {
  max-width: 260px;
  padding: 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
}

.user-manage-actions {
  display: flex;
  gap: 8px;
}

.user-manage-actions button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.user-manage-danger {
  background: #c81e1e;
}
</style>
