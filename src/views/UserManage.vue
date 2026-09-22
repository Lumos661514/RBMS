<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteUser, getUserDetail, getUsers, updateUserPassword } from '@/api/user'
import { cancelBooking } from '@/api/booking'
import { ROLE_KEY, USER_ID_KEY } from '@/api/request'
import { WEEKDAY_LABELS } from '@/config/schedule'
import {
  canUserCancelBooking,
  formatBookingDateDisplay,
  formatClockFromHour,
  isSlotStartedOrPast,
} from '@/utils/schedule'

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
/** 改密、删除或取消进行中 */
const saving = ref(false)
/** 正在取消的预约 id */
const cancellingId = ref('')
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
 * 已到开始时刻则算消费记录；未到点的仍是进行中预约。
 * @param {{ date?: string, startHour: number, status?: string }} booking
 */
function isSpendRecord(booking) {
  if (booking.status === 'done') return true
  return isSlotStartedOrPast(booking.date, booking.startHour)
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
  Math.max(1, Math.ceil(listedRecords.value.length / BOOKING_PAGE_SIZE)),
)

/** 当前页预约记录切片 */
const pagedBookings = computed(() => {
  const page = Math.min(Math.max(bookingPage.value, 1), bookingTotalPages.value)
  const start = (page - 1) * BOOKING_PAGE_SIZE
  return listedRecords.value.slice(start, start + BOOKING_PAGE_SIZE)
})

/** 预约超过一页才显示翻页 */
const showBookingPager = computed(() => listedRecords.value.length > BOOKING_PAGE_SIZE)

/** 未到开始时刻的预约，顾客「我的预约」用 */
const upcomingBookings = computed(() =>
  detailBookings.value.filter((item) => !isSpendRecord(item)),
)

/** 到点后的消费记录 */
const spendBookings = computed(() => detailBookings.value.filter((item) => isSpendRecord(item)))

/** 管理员看全部预约；顾客分页只翻消费记录 */
const listedRecords = computed(() => (isAdmin ? detailBookings.value : spendBookings.value))

/** 顾客总计只算已到点的消费；管理员详情仍按该用户全部预约合计 */
const totalSpend = computed(() => {
  const source = isAdmin ? detailBookings.value : spendBookings.value
  return source.reduce((sum, item) => sum + bookingAmount(item), 0)
})

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
    ElMessage.success('密码已更新')
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
  try {
    await ElMessageBox.confirm('删除账号后预约记录仍保留。', '删除账号', { type: 'warning' })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
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

/**
 * 顾客取消一条未开始的预约。
 * @param {{ id: string, date: string, startHour: number }} booking
 */
async function onCancelBooking(booking) {
  if (!booking?.id) return
  try {
    await ElMessageBox.confirm('取消后该时段释放，可重新预约。', '取消预约', { type: 'warning' })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
  cancellingId.value = booking.id
  actionError.value = ''
  try {
    await cancelBooking(booking.id)
    await loadDetail(myId)
    ElMessage.success('已取消')
  } catch (error) {
    actionError.value = error.message || '取消失败'
  } finally {
    cancellingId.value = ''
  }
}

onMounted(loadPage)
</script>

<template>
  <div class="user-manage">
    <h2 class="user-manage-title">{{ isAdmin ? '用户管理' : '个人信息' }}</h2>
    <!-- 加载或接口失败 -->
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <div v-else class="user-manage-body">
      <!-- 管理员：左侧普通用户列表 + 搜索 -->
      <div v-if="isAdmin" class="user-manage-aside">
        <el-input v-model="keyword" clearable placeholder="搜索手机号或姓名" />
        <el-menu class="user-manage-list" :default-active="detailUser ? detailUser.id : ''">
          <el-menu-item v-if="emptyAdminList" index="empty" disabled>暂无普通用户</el-menu-item>
          <el-menu-item v-else-if="emptySearchResult" index="empty" disabled>无匹配用户</el-menu-item>
          <el-menu-item
            v-for="item in pagedUsers"
            :key="item.id"
            :index="item.id"
            @click="selectUser(item.id)"
          >
            {{ item.name }} · {{ item.phone }}
          </el-menu-item>
        </el-menu>
        <!-- 超过一页才显示翻页 -->
        <el-pagination
          v-if="showPager"
          v-model:current-page="currentPage"
          :page-size="PAGE_SIZE"
          :total="filteredUsers.length"
          layout="prev, pager, next"
          small
        />
      </div>

      <el-card v-if="detailUser" class="user-manage-detail" shadow="never">
        <p>姓名：{{ detailUser.name }}</p>
        <p>手机号：{{ detailUser.phone }}</p>
        <!-- 管理员仍看该用户全部预约合计；顾客总计只来自到点后的消费记录 -->
        <p v-if="isAdmin">总计消费：¥{{ totalSpend }}</p>
        <template v-if="isAdmin">
          <h3>预约记录</h3>
          <!-- 没有预约时给空态 -->
          <el-empty v-if="!detailBookings.length" description="暂无预约" :image-size="64" />
          <template v-else>
            <ul class="user-manage-bookings">
              <li v-for="item in pagedBookings" :key="item.id">{{ bookingLine(item) }}</li>
            </ul>
            <el-pagination
              v-if="showBookingPager"
              v-model:current-page="bookingPage"
              :page-size="BOOKING_PAGE_SIZE"
              :total="listedRecords.length"
              layout="prev, pager, next"
              small
            />
          </template>
        </template>
        <template v-else>
          <h3>我的预约</h3>
          <el-empty v-if="!upcomingBookings.length" description="暂无进行中的预约" :image-size="64" />
          <div v-else class="user-manage-upcoming">
            <el-card
              v-for="item in upcomingBookings"
              :key="item.id"
              class="user-manage-upcoming-item"
              shadow="never"
            >
              <p>项目：{{ item.serviceName }}</p>
              <p v-if="item.employeeName">员工：{{ item.employeeName }}</p>
              <p>
                时间：{{ item.dateDisplay || formatBookingDateDisplay(item.date) }}
                {{ formatClockFromHour(item.startHour) }}–{{
                  formatClockFromHour(item.startHour + item.durationHours)
                }}
              </p>
              <p v-if="item.remark">备注：{{ item.remark }}</p>
              <!-- 开约前 30 分钟内不再提供取消 -->
              <el-button
                v-if="canUserCancelBooking(item)"
                type="danger"
                size="small"
                :loading="cancellingId === item.id"
                @click="onCancelBooking(item)"
              >
                取消预约
              </el-button>
              <p v-else class="user-manage-lock">开约前 30 分钟内不可取消</p>
            </el-card>
          </div>
          <h3>消费记录</h3>
          <p>总计消费：¥{{ totalSpend }}</p>
          <el-empty v-if="!spendBookings.length" description="暂无消费记录" :image-size="64" />
          <template v-else>
            <ul class="user-manage-bookings">
              <li v-for="item in pagedBookings" :key="item.id">{{ bookingLine(item) }}</li>
            </ul>
            <el-pagination
              v-if="showBookingPager"
              v-model:current-page="bookingPage"
              :page-size="BOOKING_PAGE_SIZE"
              :total="listedRecords.length"
              layout="prev, pager, next"
              small
            />
          </template>
        </template>
        <el-form label-position="top" class="user-manage-password">
          <el-form-item label="新密码">
            <el-input
              v-model="newPassword"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
        </el-form>
        <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
        <div class="user-manage-actions">
          <el-button type="primary" :loading="saving" @click="onSavePassword">保存密码</el-button>
          <!-- 仅管理员能删除普通用户 -->
          <el-button v-if="isAdmin" type="danger" :loading="saving" @click="onDeleteUser">
            删除账号
          </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
/* 用户管理：管理员左右栏，普通用户只看详情 */
.user-manage-title {
  margin: 0 0 16px;
  font-size: 20px;
}

.user-manage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

/* 左侧：搜索 + 用户列表 */
.user-manage-aside {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-manage-list {
  border-right: none;
}

.user-manage-detail {
  flex: 1;
}

.user-manage-detail h3 {
  margin: 8px 0 0;
  font-size: 15px;
}

.user-manage-bookings {
  margin: 0 0 8px;
  padding-left: 18px;
}

.user-manage-upcoming {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.user-manage-upcoming-item p {
  margin: 0 0 4px;
  font-size: 13px;
}

.user-manage-lock {
  color: #7b8794;
}

.user-manage-password {
  max-width: 280px;
  margin-top: 8px;
}

.user-manage-actions {
  display: flex;
  gap: 8px;
}
</style>
