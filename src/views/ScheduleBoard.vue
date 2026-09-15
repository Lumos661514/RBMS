<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { cancelBooking, createBooking, getBookings } from '@/api/booking'
import { NAME_KEY, TOKEN_KEY } from '@/api/request'
import { END_HOUR, SLOT_HOURS, START_HOUR } from '@/config/schedule'
import { SERVICES } from '@/config/services'
import BookingCreateDialog from '@/components/BookingCreateDialog.vue'
import BookingDetailDialog from '@/components/BookingDetailDialog.vue'
import {
  buildTimeRows,
  buildWeekColumns,
  dateForWeekday,
  findBookingAtCell,
  formatISODate,
  formatMonthDay,
  getMonday,
} from '@/utils/schedule'

const router = useRouter()
/** 顶栏展示，来自登录返回的 name */
const adminName = ref(localStorage.getItem(NAME_KEY) || '')

/** 由配置生成，改 START/END/WEEK_DAYS 后表格跟着变 */
const timeRows = buildTimeRows()
const weekColumns = buildWeekColumns()
const monday = getMonday()
const weekStart = formatISODate(monday)

/** GET 回来的本周预约，用来给格子上色 */
const bookings = ref([])
/** 首屏拉数中 */
const loading = ref(false)
/** 拉数失败文案，有值时表不渲染 */
const loadError = ref('')

/** 空闲格弹窗是否打开 */
const createOpen = ref(false)
/** 弹窗对应的星期列 */
const createWeekday = ref(null)
/** 弹窗对应的开始整点 */
const createStartHour = ref(null)
/** 弹窗里选中的服务 */
const createServiceId = ref(SERVICES[0].id)
/** 客户姓名 */
const createContactName = ref('')
/** 可选备注 */
const createRemark = ref('')
/** 创建请求进行中，防连点 */
const submitting = ref(false)
/** 创建失败或姓名未填 */
const createError = ref('')

/** 已占格弹窗是否打开 */
const detailOpen = ref(false)
/** 当前查看的那一条预约 */
const detailBooking = ref(null)
/** 取消请求进行中 */
const cancelling = ref(false)

/**
 * 表头日期，随本周一推算。
 * @param {number} weekday
 */
function columnDateLabel(weekday) {
  return formatMonthDay(dateForWeekday(monday, weekday))
}

/**
 * 该格命中的预约；空闲则 null。
 * @param {number} weekday
 * @param {number} startHour
 */
function cellBooking(weekday, startHour) {
  return findBookingAtCell(bookings.value, weekday, startHour)
}

/**
 * 已占格展示「服务 / 客户」。
 * @param {{ serviceName: string, contactName: string } | null} booking
 */
function cellLabel(booking) {
  if (!booking) return ''
  return `${booking.serviceName} / ${booking.contactName}`
}

/**
 * 连占多行时，只有开始整点那一行输出 td，其余行交给 rowspan。
 * @param {number} weekday
 * @param {number} startHour
 */
function isMergedContinuation(weekday, startHour) {
  const booking = cellBooking(weekday, startHour)
  return Boolean(booking && booking.startHour !== startHour)
}

/**
 * 该预约占几行时段；空闲格为 1。
 * @param {number} weekday
 * @param {number} startHour
 */
function busyRowSpan(weekday, startHour) {
  const booking = cellBooking(weekday, startHour)
  if (!booking) return 1
  return booking.durationHours / SLOT_HOURS
}

/**
 * 拉本周预约；失败可重试，不把占用写死在页面里。
 */
async function loadBookings() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getBookings(weekStart)
    bookings.value = data.list || []
  } catch (error) {
    loadError.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 已占格打开详情；空闲格打开创建。
 * @param {number} weekday
 * @param {number} startHour
 */
function onCellClick(weekday, startHour) {
  const occupied = cellBooking(weekday, startHour)
  if (occupied) {
    detailBooking.value = occupied
    detailOpen.value = true
    return
  }
  createWeekday.value = weekday
  createStartHour.value = startHour
  createServiceId.value = SERVICES[0].id
  createContactName.value = ''
  createRemark.value = ''
  createError.value = ''
  createOpen.value = true
}

function closeCreate() {
  createOpen.value = false
}

function closeDetail() {
  detailOpen.value = false
  detailBooking.value = null
}

/**
 * 提交预约；防连点。冲突/超时由接口返回文案。
 */
async function submitCreate() {
  createError.value = ''
  if (!createContactName.value.trim()) {
    createError.value = '请填写客户姓名'
    return
  }
  submitting.value = true
  try {
    await createBooking({
      weekday: createWeekday.value,
      startHour: createStartHour.value,
      serviceId: createServiceId.value,
      contactName: createContactName.value.trim(),
      remark: createRemark.value.trim(),
    })
    createOpen.value = false
    await loadBookings()
  } catch (error) {
    createError.value = error.message || '创建失败'
  } finally {
    submitting.value = false
  }
}

/**
 * 点取消即释放占用格，不再弹确认框。
 */
async function submitCancel() {
  if (!detailBooking.value) return
  cancelling.value = true
  try {
    await cancelBooking(detailBooking.value.id)
    closeDetail()
    await loadBookings()
  } catch (error) {
    window.alert(error.message || '取消失败')
  } finally {
    cancelling.value = false
  }
}

/** 清本地登录态并回登录页。 */
function logout() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(NAME_KEY)
  router.replace('/login')
}

onMounted(loadBookings)
</script>

<template>
  <div class="board-page">
    <header class="board-header">
      <div>
        <h1>预约后台管理系统</h1>
      </div>
      <div class="board-user">
        <span>{{ adminName }}</span>
        <button type="button" class="board-link" @click="logout">退出</button>
      </div>
    </header>

    <!-- 列表加载失败时保留重试，不渲染空表造成「没有班次」的误解 -->
    <div v-if="loadError" class="board-status">
      <span>{{ loadError }}</span>
      <button type="button" @click="loadBookings">重试</button>
    </div>
    <!-- 首屏等待 GET /api/bookings -->
    <p v-else-if="loading" class="board-status">加载中…</p>

    <div v-else class="board-table-wrap">
      <table class="board-table">
        <thead>
          <tr>
            <th class="board-time-col">时段</th>
            <th v-for="col in weekColumns" :key="col.weekday">
              {{ col.label }}
              <span class="board-date">{{ columnDateLabel(col.weekday) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in timeRows" :key="row.startHour">
            <th class="board-time-col">{{ row.label }}</th>
            <template v-for="col in weekColumns" :key="`${col.weekday}-${row.startHour}`">
              <!-- 被上一格 rowspan 合并掉的行不再输出 td -->
              <td
                v-if="!isMergedContinuation(col.weekday, row.startHour)"
                :rowspan="busyRowSpan(col.weekday, row.startHour)"
                :class="cellBooking(col.weekday, row.startHour) ? 'is-busy' : 'is-free'"
                @click="onCellClick(col.weekday, row.startHour)"
              >
                <span v-if="cellBooking(col.weekday, row.startHour)">
                  {{ cellLabel(cellBooking(col.weekday, row.startHour)) }}
                </span>
                <span v-else class="board-plus">预约</span>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <BookingCreateDialog
      v-if="createOpen"
      :weekday="createWeekday"
      :start-hour="createStartHour"
      :service-id="createServiceId"
      :contact-name="createContactName"
      :remark="createRemark"
      :error="createError"
      :submitting="submitting"
      @close="closeCreate"
      @submit="submitCreate"
      @update:service-id="createServiceId = $event"
      @update:contact-name="createContactName = $event"
      @update:remark="createRemark = $event"
    />

    <BookingDetailDialog
      v-if="detailOpen && detailBooking"
      :booking="detailBooking"
      :cancelling="cancelling"
      @close="closeDetail"
      @cancel="submitCancel"
    />
  </div>
</template>

<style scoped>
/* 看板页头与表格主区域 */
.board-page {
  padding: 20px 24px 40px;
}

.board-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.board-header h1 {
  margin: 0;
  font-size: 22px;
}

.board-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.board-link,
.board-status button {
  cursor: pointer;
}

.board-link {
  border: 0;
  background: none;
  color: #1f4e79;
}

.board-status {
  display: flex;
  gap: 12px;
  align-items: center;
}

.board-table-wrap {
  overflow-x: auto;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
}

.board-table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  table-layout: fixed;
}

.board-table th,
.board-table td {
  border: 1px solid #e4e7eb;
  padding: 8px 6px;
  text-align: center;
  vertical-align: middle;
  font-size: 13px;
}

.board-time-col {
  width: 120px;
  background: #f8fafc;
}

.board-date {
  display: block;
  font-weight: 400;
  color: #7b8794;
  font-size: 12px;
}

.is-free {
  cursor: pointer;
  color: #9aa5b1;
  background: #fff;
}

.is-free:hover {
  background: #e6f2ff;
  color: #1f4e79;
}

.is-busy {
  cursor: pointer;
  background: #fde8e8;
  color: #9b1c1c;
  font-size: 12px;
}

.board-plus {
  font-size: 12px;
}
</style>
