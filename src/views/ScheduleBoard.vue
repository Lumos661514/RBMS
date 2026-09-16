<script setup>
import { computed, onMounted, ref } from 'vue'
import { NAME_KEY, ROLE_KEY, USER_ID_KEY } from '@/api/request'
import { getSettings } from '@/api/settings'
import { cancelBooking, createBooking, getBookings } from '@/api/booking'
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

/** 当前登录者姓名，预约会绑到这个人 */
const bookerName = localStorage.getItem(NAME_KEY) || ''
/** 当前登录角色，管理员可取消任意预约 */
const role = localStorage.getItem(ROLE_KEY) || ''
/** 普通用户只能取消自己的单 */
const userId = localStorage.getItem(USER_ID_KEY) || ''

/** 营业设置，来自接口而不是写死在页面里 */
const settings = ref({
  slotHours: 1,
  startHour: 9,
  endHour: 18,
  weekDays: [1, 2, 3, 4, 5, 6],
})

const timeRows = computed(() =>
  buildTimeRows(settings.value.startHour, settings.value.endHour, settings.value.slotHours),
)
const weekColumns = computed(() => buildWeekColumns(settings.value.weekDays))
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
/** 可选备注 */
const createRemark = ref('')
/** 创建请求进行中，防连点 */
const submitting = ref(false)
/** 创建失败文案 */
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
 * 已占格展示「服务 / 预约人」。
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
  return booking.durationHours / settings.value.slotHours
}

/** 管理员或预约归属自己时才能取消。 */
function canCancelDetail() {
  if (!detailBooking.value) return false
  return role === 'admin' || detailBooking.value.userId === userId
}

/**
 * 同时拉营业设置和预约；失败可重试。
 */
async function loadBoard() {
  loading.value = true
  loadError.value = ''
  try {
    const [nextSettings, data] = await Promise.all([getSettings(), getBookings(weekStart)])
    settings.value = nextSettings
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
 * 提交预约；防连点。预约人固定为当前登录用户。
 */
async function submitCreate() {
  createError.value = ''
  submitting.value = true
  try {
    await createBooking({
      weekday: createWeekday.value,
      startHour: createStartHour.value,
      serviceId: createServiceId.value,
      remark: createRemark.value.trim(),
    })
    createOpen.value = false
    await loadBoard()
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
    await loadBoard()
  } catch (error) {
    window.alert(error.message || '取消失败')
  } finally {
    cancelling.value = false
  }
}

onMounted(loadBoard)
</script>

<template>
  <div class="board-page">
    <p class="board-sub">
      营业 {{ settings.startHour }}:00–{{ settings.endHour }}:00
    </p>

    <!-- 列表加载失败时保留重试，不渲染空表造成「没有班次」的误解 -->
    <div v-if="loadError" class="board-status">
      <span>{{ loadError }}</span>
      <button type="button" @click="loadBoard">重试</button>
    </div>
    <!-- 首屏等待设置和预约 -->
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
      :booker-name="bookerName"
      :remark="createRemark"
      :error="createError"
      :submitting="submitting"
      @close="closeCreate"
      @submit="submitCreate"
      @update:service-id="createServiceId = $event"
      @update:remark="createRemark = $event"
    />

    <BookingDetailDialog
      v-if="detailOpen && detailBooking"
      :booking="detailBooking"
      :cancelling="cancelling"
      :can-cancel="canCancelDetail()"
      @close="closeDetail"
      @cancel="submitCancel"
    />
  </div>
</template>

<style scoped>
/* 看板表格主区域（顶栏在布局里） */
.board-page {
  min-width: 0;
}

.board-sub {
  margin: 0 0 12px;
  color: #616e7c;
  font-size: 13px;
}

.board-status {
  display: flex;
  gap: 12px;
  align-items: center;
}

.board-status button {
  cursor: pointer;
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
