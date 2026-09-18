<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { deleteUser, getUserDetail, getUsers, updateUserPassword } from '@/api/user'
import { ROLE_KEY, USER_ID_KEY } from '@/api/request'
import { WEEKDAY_LABELS } from '@/config/schedule'
import { formatBookingDateDisplay, formatClockFromHour } from '@/utils/schedule'

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
/** 管理员按手机号或姓名筛左侧列表 */
const keyword = ref('')
/** 左侧用户列表每页条数 */
const PAGE_SIZE = 8
/** 当前页，从 1 开始；搜索变化时会重置 */
const currentPage = ref(1)
/** 预约记录每页条数 */
const BOOKING_PAGE_SIZE = 5
/** 预约记录当前页 */
const bookingPage = ref(1)

/**
 * 单条预约的消费金额；旧数据缺字段时按 0。
 * @param {{ price?: number }} booking
 */
function bookingAmount(booking) {
  const n = Number(booking?.price)
  return Number.isFinite(n) ? n : 0
}

/**
 * 预约列表上的时段文案；含本次消费；日期带年份，如 2026/9/18；已结束标出来。
 * @param {{ date?: string, dateDisplay?: string, weekday?: number, startHour: number, durationHours: number, serviceName: string, status?: string, price?: number, employeeName?: string }} booking
 */
function bookingLine(booking) {
  const start = formatClockFromHour(booking.startHour)
  const end = formatClockFromHour(booking.startHour + booking.durationHours)
  let dayLabel = ''
  if (booking.dateDisplay) {
    dayLabel = booking.dateDisplay
  } else if (booking.date) {
    dayLabel = formatBookingDateDisplay(booking.date)
  } else if (booking.weekday != null) {
    dayLabel = WEEKDAY_LABELS[booking.weekday]
  }
  const statusLabel = booking.status === 'done' ? ' · 已结束' : ''
  const employeePart = booking.employeeName ? ` · ${booking.employeeName}` : ''
  const spendPart = ` · 本次消费 ¥${bookingAmount(booking)}`
  return `${dayLabel} ${start}–${end} · ${booking.serviceName}${employeePart}${spendPart}${statusLabel}`
}

/**
 * 姓名或手机号包含关键字即命中（忽略大小写与首尾空格）。
 * @param {{ name: string, phone: string }} user
 * @param {string} raw
 */
function matchUser(user, raw) {
  const q = String(raw || '').trim().toLowerCase()
  if (!q) return true
  return (
    String(user.name || '').toLowerCase().includes(q) ||
    String(user.phone || '').toLowerCase().includes(q)
  )
}

/** 管理员左侧列表：按搜索框过滤后的结果 */
const filteredUsers = computed(() => users.value.filter((item) => matchUser(item, keyword.value)))

/** 过滤后总页数，至少为 1，避免除零 */
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredUsers.value.length / PAGE_SIZE)),
)

/** 当前页切片后的用户，页码越界时夹到最后一页 */
const pagedUsers = computed(() => {
  const page = Math.min(Math.max(currentPage.value, 1), totalPages.value)
  const start = (page - 1) * PAGE_SIZE
  return filteredUsers.value.slice(start, start + PAGE_SIZE)
})

/** 有数据时才显示分页条 */
const showPager = computed(() => filteredUsers.value.length > PAGE_SIZE)

/** 预约记录总页数 */
const bookingTotalPages = computed(() =>
  Math.max(1, Math.ceil(detailBookings.value.length / BOOKING_PAGE_SIZE)),
)

/** 当前页预约记录切片 */
const pagedBookings = computed(() => {
  const page = Math.min(Math.max(bookingPage.value, 1), bookingTotalPages.value)
  const start = (page - 1) * BOOKING_PAGE_SIZE
  return detailBookings.value.slice(start, start + BOOKING_PAGE_SIZE)
})

/** 预约超过一页才显示翻页 */
const showBookingPager = computed(() => detailBookings.value.length > BOOKING_PAGE_SIZE)

/** 预约记录消费合计 */
const totalSpend = computed(() =>
  detailBookings.value.reduce((sum, item) => sum + bookingAmount(item), 0),
)

const emptyAdminList = computed(() => isAdmin && !users.value.length)
/** 有用户但当前关键字没命中 */
const emptySearchResult = computed(
  () => isAdmin && users.value.length > 0 && !filteredUsers.value.length,
)

/** 改搜索词时回到第一页，避免停在空白页 */
watch(keyword, () => {
  currentPage.value = 1
})

/** 删除用户后总页数变少时，把当前页夹回末页 */
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})

/** 切换用户或记录变少时夹预约页码 */
watch(bookingTotalPages, (pages) => {
  if (bookingPage.value > pages) bookingPage.value = pages
})

/**
 * 上一页；已在首页则不动。
 */
function goPrevPage() {
  if (currentPage.value <= 1) return
  currentPage.value -= 1
}

/**
 * 下一页；已在末页则不动。
 */
function goNextPage() {
  if (currentPage.value >= totalPages.value) return
  currentPage.value += 1
}

/**
 * 预约记录上一页。
 */
function goPrevBookingPage() {
  if (bookingPage.value <= 1) return
  bookingPage.value -= 1
}

/**
 * 预约记录下一页。
 */
function goNextBookingPage() {
  if (bookingPage.value >= bookingTotalPages.value) return
  bookingPage.value += 1
}

/**
 * 拉某个用户的资料和预约记录。
 * @param {string} id
 */
async function loadDetail(id) {
  const data = await getUserDetail(id)
  detailUser.value = data.user
  detailBookings.value = data.bookings || []
  bookingPage.value = 1
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

onMounted(loadPage)
</script>

<template>
  <div class="user-manage">
    <h2 class="user-manage-title">用户管理</h2>
    <!-- 加载或接口失败 -->
    <p v-if="loading">加载中…</p>
    <p v-else-if="loadError" class="user-manage-error">{{ loadError }}</p>

    <div v-else class="user-manage-body">
      <!-- 管理员：左侧普通用户列表 + 搜索 -->
      <div v-if="isAdmin" class="user-manage-aside">
        <label class="user-manage-search">
          搜索
          <input
            v-model="keyword"
            type="search"
            placeholder="手机号或姓名"
            autocomplete="off"
          />
        </label>
        <ul class="user-manage-list">
          <li v-if="emptyAdminList" class="user-manage-empty">暂无普通用户</li>
          <li v-else-if="emptySearchResult" class="user-manage-empty">无匹配用户</li>
          <li
            v-for="item in pagedUsers"
            :key="item.id"
            class="user-manage-item"
            :class="{ 'is-active': detailUser && detailUser.id === item.id }"
          >
            <button type="button" @click="selectUser(item.id)">
              {{ item.name }} · {{ item.phone }}
            </button>
          </li>
        </ul>
        <!-- 超过一页才显示翻页 -->
        <div v-if="showPager" class="user-manage-pager">
          <button type="button" :disabled="currentPage <= 1" @click="goPrevPage">上一页</button>
          <span>{{ Math.min(currentPage, totalPages) }} / {{ totalPages }}</span>
          <button
            type="button"
            :disabled="currentPage >= totalPages"
            @click="goNextPage"
          >
            下一页
          </button>
        </div>
      </div>

      <section v-if="detailUser" class="user-manage-detail">
        <p>姓名：{{ detailUser.name }}</p>
        <p>手机号：{{ detailUser.phone }}</p>
        <p>总计消费：¥{{ totalSpend }}</p>
        <h3>预约记录</h3>
        <!-- 没有预约时给空态 -->
        <p v-if="!detailBookings.length" class="user-manage-empty">暂无预约</p>
        <template v-else>
          <ul class="user-manage-bookings">
            <li v-for="item in pagedBookings" :key="item.id">{{ bookingLine(item) }}</li>
          </ul>
          <div v-if="showBookingPager" class="user-manage-pager">
            <button type="button" :disabled="bookingPage <= 1" @click="goPrevBookingPage">
              上一页
            </button>
            <span>{{ Math.min(bookingPage, bookingTotalPages) }} / {{ bookingTotalPages }}</span>
            <button
              type="button"
              :disabled="bookingPage >= bookingTotalPages"
              @click="goNextBookingPage"
            >
              下一页
            </button>
          </div>
        </template>
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

/* 左侧：搜索 + 用户列表 */
.user-manage-aside {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-manage-search {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #52606d;
}

.user-manage-search input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
  background: #fff;
}

.user-manage-list {
  margin: 0;
  padding: 0;
  list-style: none;
  width: 100%;
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

/* 左侧列表底部分页 */
.user-manage-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  color: #52606d;
}

.user-manage-pager button {
  padding: 4px 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.user-manage-pager button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
