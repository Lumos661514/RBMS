<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteUser, getUserDetail, getUsers, updateUserPassword } from '@/api/user'
import { cancelBooking } from '@/api/booking'
import { ROLE_KEY, USER_ID_KEY } from '@/api/request'
import { WEEKDAY_LABELS } from '@/config/schedule'
import { validateNewPassword, validateSelfPasswordChange } from '@/utils/password'
import {
  canUserCancelBooking,
  formatBookingDateDisplay,
  formatClockFromHour,
  isSlotStartedOrPast,
} from '@/utils/schedule'

/** 管理员看列表；普通用户只看自己 */
const isAdmin = localStorage.getItem(ROLE_KEY) === 'admin'
const myId = localStorage.getItem(USER_ID_KEY) || ''
const route = useRoute()

/** 顾客端「我的」分页：个人信息 / 预约 / 消费 / 改密 */
const accountTabItems = [
  { name: 'profile', label: '个人信息' },
  { name: 'bookings', label: '我的预约' },
  { name: 'spend', label: '消费记录' },
  { name: 'password', label: '修改密码' },
]
const accountTab = ref('profile')
const tabQuery = typeof route.query.tab === 'string' ? route.query.tab : ''
if (!isAdmin && accountTabItems.some((item) => item.name === tabQuery)) {
  accountTab.value = tabQuery
}

/** 管理员看到的普通用户列表 */
const users = ref([])
/** 当前详情里的用户 */
const detailUser = ref(null)
/** 该用户名下的预约 */
const detailBookings = ref([])
/** 顾客改密要填原密码，并再输一次新密码；管理员重置只填新密码 */
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
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

/** 顾客换分页时清掉上一页的报错，避免密码错误留在预约页 */
watch(accountTab, () => {
  actionError.value = ''
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
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
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
  actionError.value = ''
  let password = ''
  /** 顾客改自己的密码时带上原密码和确认密码；管理员重置不带 */
  let extra
  if (isAdmin) {
    const checked = validateNewPassword(newPassword.value)
    if (!checked.ok) {
      actionError.value = checked.message
      return
    }
    password = checked.password
  } else {
    const checked = validateSelfPasswordChange({
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
      confirmPassword: confirmPassword.value,
    })
    if (!checked.ok) {
      actionError.value = checked.message
      return
    }
    password = checked.password
    extra = {
      oldPassword: checked.oldPassword,
      confirmPassword: confirmPassword.value,
    }
  }
  saving.value = true
  try {
    await updateUserPassword(detailUser.value.id, password, extra)
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
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
    <h2 class="page-title">{{ isAdmin ? '用户管理' : '我的' }}</h2>
    <p class="page-hint">
      {{
        isAdmin
          ? '搜索并选择左侧用户，可查看预约、改密或删除账号。'
          : '查看个人资料、进行中的预约和消费记录，或修改登录密码。'
      }}
    </p>
    <!-- 加载或接口失败 -->
    <el-skeleton v-if="loading" :rows="4" animated />
    <div v-else-if="loadError" class="page-load-error">
      <el-alert :title="loadError" type="error" :closable="false" show-icon />
      <el-button type="primary" @click="loadPage">重试</el-button>
    </div>

    <div v-else-if="isAdmin" class="desk-split">
      <!-- 管理员：左侧普通用户列表 + 搜索 -->
      <div v-if="isAdmin" class="user-manage-aside">
        <el-input
          v-model="keyword"
          class="user-manage-search"
          clearable
          placeholder="搜索手机号或姓名"
        />
        <ul class="desk-list user-manage-list" role="listbox" aria-label="用户列表">
          <li v-if="emptyAdminList">
            <button type="button" class="desk-list-item" disabled>暂无普通用户</button>
          </li>
          <li v-else-if="emptySearchResult">
            <button type="button" class="desk-list-item" disabled>无匹配用户</button>
          </li>
          <li v-for="item in pagedUsers" :key="item.id">
            <button
              type="button"
              class="desk-list-item"
              :class="{ 'is-active': detailUser && detailUser.id === item.id }"
              role="option"
              :aria-selected="!!(detailUser && detailUser.id === item.id)"
              @click="selectUser(item.id)"
            >
              <span class="desk-list-title">{{ item.name }}</span>
              <span class="desk-list-meta">{{ item.phone }}</span>
            </button>
          </li>
        </ul>
        <!-- 超过一页才显示翻页 -->
        <el-pagination
          v-if="showPager"
          v-model:current-page="currentPage"
          class="user-manage-pager"
          :page-size="PAGE_SIZE"
          :total="filteredUsers.length"
          layout="prev, pager, next"
          small
        />
      </div>

      <section v-if="detailUser" class="desk-panel user-manage-detail">
        <p class="user-manage-field">姓名：{{ detailUser.name }}</p>
        <p class="user-manage-field">手机号：{{ detailUser.phone }}</p>
        <p class="user-manage-field">总计消费：¥{{ totalSpend }}</p>
        <h3 class="desk-section-title">预约记录</h3>
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
        <el-form label-position="top" class="user-manage-password" @submit.prevent="onSavePassword">
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
        <div class="desk-actions">
          <el-button type="primary" :loading="saving" @click="onSavePassword">保存密码</el-button>
          <el-button type="danger" :loading="saving" @click="onDeleteUser">删除账号</el-button>
        </div>
      </section>
      <!-- 管理员未选用户时给右侧空态，避免空白主栏 -->
      <div v-else class="desk-panel user-manage-empty">
        <el-empty
          :description="emptyAdminList ? '暂无普通用户' : '请选择左侧用户'"
          :image-size="72"
        />
      </div>
    </div>

    <!-- 顾客端：四个分页，改密单独一页，避免和预约挤在同一张卡片里 -->
    <div v-else-if="detailUser" class="user-manage-account">
      <div class="user-manage-tabbar" role="tablist" aria-label="我的">
        <button
          v-for="tab in accountTabItems"
          :key="tab.name"
          type="button"
          role="tab"
          :aria-selected="accountTab === tab.name"
          :class="{ 'is-active': accountTab === tab.name }"
          @click="accountTab = tab.name"
        >
          {{ tab.label }}
        </button>
      </div>
      <div v-show="accountTab === 'profile'" role="tabpanel">
        <p class="user-manage-field">姓名：{{ detailUser.name }}</p>
        <p class="user-manage-field">手机号：{{ detailUser.phone }}</p>
      </div>
      <div v-show="accountTab === 'bookings'" role="tabpanel">
          <el-empty
            v-if="!upcomingBookings.length"
            class="user-manage-empty-state"
            description="暂无进行中的预约"
            :image-size="72"
          />
          <div v-else class="user-manage-upcoming">
            <article
              v-for="item in upcomingBookings"
              :key="item.id"
              class="desk-row user-manage-upcoming-item"
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
            </article>
          </div>
      </div>
      <div v-show="accountTab === 'spend'" role="tabpanel">
          <p class="user-manage-field">总计消费：¥{{ totalSpend }}</p>
          <el-empty
            v-if="!spendBookings.length"
            class="user-manage-empty-state"
            description="暂无消费记录"
            :image-size="72"
          />
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
      </div>
      <div v-show="accountTab === 'password'" role="tabpanel">
          <el-form label-position="top" class="user-manage-password" @submit.prevent="onSavePassword">
            <el-form-item label="原密码">
              <el-input
                v-model="oldPassword"
                type="password"
                show-password
                autocomplete="current-password"
              />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input
                v-model="newPassword"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="至少 6 位"
              />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input
                v-model="confirmPassword"
                type="password"
                show-password
                autocomplete="new-password"
              />
            </el-form-item>
            <el-button
              class="user-manage-password-submit"
              type="primary"
              native-type="submit"
              :loading="saving"
            >
              保存密码
            </el-button>
          </el-form>
      </div>
      <el-alert
        v-if="actionError"
        class="user-manage-alert"
        :title="actionError"
        type="error"
        :closable="false"
        show-icon
      />
    </div>
  </div>
</template>

<style scoped>
/* 用户管理：值班台分栏。顾客端用分页，不再把资料、预约、改密塞进一张卡片。 */
.user-manage-account {
  width: 100%;
  max-width: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  padding: 4px 16px 20px;
}

.user-manage-tabbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
  margin: 0 0 16px;
  border-bottom: 1px solid var(--color-border);
}

.user-manage-tabbar button {
  margin: 0;
  padding: 12px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.user-manage-tabbar button.is-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-accent);
  font-weight: 600;
}

.user-manage-empty-state {
  width: 100%;
  padding: 12px 0 4px;
}

.user-manage-alert {
  margin-top: 12px;
}

.user-manage-aside {
  display: flex;
  flex-direction: column;
  width: var(--admin-list-width);
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 55%, var(--color-surface));
}

.user-manage-search {
  padding: 10px 8px 0;
}

.user-manage-list {
  width: 100%;
  border-right: none;
  background: transparent;
  flex: 1;
}

.user-manage-pager {
  padding: 8px;
  justify-content: center;
}

.user-manage-field {
  margin: 0 0 6px;
  font-size: 14px;
}

.user-manage-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-manage-bookings {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.55;
}

.user-manage-upcoming {
  margin-bottom: 12px;
}

.user-manage-upcoming-item p {
  margin: 0;
}

.user-manage-lock {
  color: var(--color-text-subtle);
}

.user-manage-password {
  max-width: 320px;
  margin-top: 12px;
}

.user-manage-bookings,
.user-manage-upcoming-item {
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .user-manage-account {
    max-width: none;
    padding: 0 12px 16px;
  }

  .user-manage-password {
    max-width: none;
  }

  .user-manage-password-submit {
    width: 100%;
  }
}
</style>
