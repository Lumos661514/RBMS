<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { NAME_KEY, ROLE_KEY, USER_ID_KEY } from '@/api/request'
import { getSettings } from '@/api/settings'
import { cancelBooking, createBooking, getBookings } from '@/api/booking'
import { getServices } from '@/api/services'
import { getEmployees } from '@/api/employees'
import { getUsers } from '@/api/user'
import BookingCreateDialog from '@/components/BookingCreateDialog.vue'
import BookingDetailDialog from '@/components/BookingDetailDialog.vue'
import {
  buildDayColumns,
  buildTimeRows,
  findBookingsAtCell,
  formatClockFromHour,
  formatISODate,
  isActiveBooking,
  isSlotFullyBooked,
  isSlotStartedOrPast,
  workingEmployeesAt,
} from '@/utils/schedule'
import { DAY_COUNT_DEFAULT, SLOT_MINUTES_DEFAULT } from '@/config/schedule'

/** 当前登录者姓名，普通用户自约绑到此人 */
const bookerName = localStorage.getItem(NAME_KEY) || ''
/** 当前登录角色：管理员代约、看全部；用户只看自己 */
const role = localStorage.getItem(ROLE_KEY) || ''
/** 普通用户只能取消自己的单 */
const userId = localStorage.getItem(USER_ID_KEY) || ''
const isAdmin = role === 'admin'

/** 营业设置，来自接口而不是写死在页面里 */
const settings = ref({
  slotMinutes: SLOT_MINUTES_DEFAULT,
  startHour: 9,
  endHour: 18,
  dayCount: DAY_COUNT_DEFAULT,
})

const timeRows = computed(() =>
  buildTimeRows(settings.value.startHour, settings.value.endHour, settings.value.slotMinutes),
)
/** 从今日起连续列，列数由设置 dayCount 控制 */
const dayColumns = computed(() => buildDayColumns(settings.value.dayCount))
/** 拉取预约时带上今日，便于以后按区间筛 */
const rangeStart = formatISODate(new Date())

/** GET 回来的进行中预约 */
const bookings = ref([])
/** 预约可选服务 */
const serviceOptions = ref([])
/** 员工列表：容量与下拉选项 */
const employeeOptions = ref([])
/** 管理员代约可选的普通用户 */
const userOptions = ref([])
/** 首屏拉数中 */
const loading = ref(false)
/** 拉数失败文案，有值时表不渲染 */
const loadError = ref('')
/** 定时刷新，到点后尽快从看板清占用 */
let refreshTimer = 0

/** 空闲格弹窗是否打开 */
const createOpen = ref(false)
/** 弹窗对应的日历日 YYYY-MM-DD */
const createDate = ref('')
/** 弹窗表头展示用，如「周五」 */
const createDateTitle = ref('')
/** 弹窗副标题，如「9/17」 */
const createDateSub = ref('')
/** 弹窗对应的开始整点 */
const createStartHour = ref(null)
/** 弹窗里选中的服务 */
const createServiceId = ref('')
/** 弹窗里选中的员工 */
const createEmployeeId = ref('')
/** 管理员代约选中的用户 */
const createBookerUserId = ref('')
/** 可选备注 */
const createRemark = ref('')
/** 创建请求进行中，防连点 */
const submitting = ref(false)
/** 创建失败文案 */
const createError = ref('')

/** 已占格弹窗是否打开 */
const detailOpen = ref(false)
/** 详情里当前格可见预约 */
const detailBookings = ref([])
/** 详情对应格，取消后用来刷新列表 */
const detailCell = ref(null)
/** 详情里是否还能继续约 */
const detailCanContinue = ref(false)
/** 正在取消的预约 id */
const cancellingId = ref('')

/**
 * 该格上的全部进行中预约。
 * @param {string} date
 * @param {number} startHour
 */
function cellBookings(date, startHour) {
  return findBookingsAtCell(bookings.value, date, startHour)
}

/**
 * 当前角色可见的预约：管理员看全部，用户只看自己的。
 * @param {string} date
 * @param {number} startHour
 */
function visibleCellBookings(date, startHour) {
  const list = cellBookings(date, startHour)
  if (isAdmin) return list
  return list.filter((item) => item.userId === userId)
}

/**
 * 该格可上班员工，与格子重叠的请假不计入容量。
 * @param {string} date
 * @param {number} startHour
 */
function workingStaff(date, startHour) {
  return workingEmployeesAt(
    employeeOptions.value,
    date,
    startHour,
    settings.value.slotMinutes,
  )
}

/**
 * 该格是否已约满（该格可上班员工都被选）。
 * @param {string} date
 * @param {number} startHour
 */
function isCellFull(date, startHour) {
  return isSlotFullyBooked(bookings.value, date, startHour, workingStaff(date, startHour))
}

/**
 * 有员工名册但该格全员请假。
 * @param {string} date
 * @param {number} startHour
 */
function isSlotUnstaffed(date, startHour) {
  return employeeOptions.value.length > 0 && workingStaff(date, startHour).length === 0
}

/**
 * 已过点且无人占用时显示「已过」。
 * @param {string} date
 * @param {number} startHour
 */
function isPastEmptySlot(date, startHour) {
  return isSlotStartedOrPast(date, startHour) && !cellBookings(date, startHour).length
}

/**
 * 格子文案：约满 / 已约 a/n / 预约 / 已过。
 * @param {string} date
 * @param {number} startHour
 */
function cellLabelText(date, startHour) {
  if (isPastEmptySlot(date, startHour)) return '已过'
  if (!employeeOptions.value.length) return '无员工'
  if (isSlotUnstaffed(date, startHour)) return '无人'
  const total = workingStaff(date, startHour).length
  const used = cellBookings(date, startHour).length
  if (used <= 0) return '预约'
  if (isCellFull(date, startHour)) return `已满 ${used}/${total}`
  return `已约 ${used}/${total}`
}

/**
 * 只把进行中的预约放进看板。
 * @param {object[]} list
 */
function applyActiveBookings(list) {
  bookings.value = (list || []).filter(isActiveBooking)
}

/**
 * 同时拉设置、预约、服务与员工；管理员再拉用户列表供代约。
 */
async function loadBoard() {
  loading.value = true
  loadError.value = ''
  try {
    const tasks = [
      getSettings(),
      getBookings(rangeStart),
      getServices(),
      getEmployees(),
    ]
    if (isAdmin) tasks.push(getUsers())
    const results = await Promise.all(tasks)
    const [nextSettings, data, serviceData, employeeData, userData] = results
    settings.value = nextSettings
    applyActiveBookings(data.list)
    serviceOptions.value = serviceData.list || []
    employeeOptions.value = employeeData.list || []
    if (isAdmin) userOptions.value = userData?.list || []
    if (!createServiceId.value && serviceOptions.value.length) {
      createServiceId.value = serviceOptions.value[0].id
    }
  } catch (error) {
    loadError.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 静默刷新预约。服务结束后不再占格，不打断操作中的弹窗。
 */
async function refreshBookingsQuiet() {
  try {
    const data = await getBookings(rangeStart)
    applyActiveBookings(data.list)
    if (detailOpen.value && detailCell.value) {
      const next = visibleCellBookings(detailCell.value.date, detailCell.value.startHour)
      if (!next.length) closeDetail()
      else detailBookings.value = next
    }
  } catch {
    // 静默失败，下次间隔再试
  }
}

/**
 * 打开某格详情（仅含当前角色可见的预约）。
 * @param {{ date: string, label: string, dateLabel: string }} col
 * @param {number} startHour
 * @param {object[]} list
 */
function openDetail(col, startHour, list) {
  detailCell.value = { date: col.date, startHour }
  detailBookings.value = list
  // 普通用户一人一时段只能约一名员工，有单后不再显示继续约；管理员可继续给其他人代约
  detailCanContinue.value =
    isAdmin &&
    !isSlotStartedOrPast(col.date, startHour) &&
    !isCellFull(col.date, startHour)
  detailOpen.value = true
}

/**
 * 打开新建预约弹窗。
 * @param {{ date: string, label: string, dateLabel: string }} col
 * @param {number} startHour
 */
function openCreate(col, startHour) {
  if (!serviceOptions.value.length) {
    ElMessage.warning('暂无可预约服务，请先在项目管理中添加')
    return
  }
  if (!employeeOptions.value.length) {
    ElMessage.warning('暂无员工，请先在员工管理中添加')
    return
  }
  if (isAdmin && !userOptions.value.length) {
    ElMessage.warning('暂无普通用户，请先注册用户后再代约')
    return
  }
  if (isSlotUnstaffed(col.date, startHour)) {
    ElMessage.warning('该时段员工请假，无法预约')
    return
  }
  createDate.value = col.date
  createDateTitle.value = col.label
  createDateSub.value = col.dateLabel
  createStartHour.value = startHour
  createServiceId.value = serviceOptions.value[0].id
  createEmployeeId.value = ''
  createBookerUserId.value = ''
  createRemark.value = ''
  createError.value = ''
  createOpen.value = true
}

/**
 * 有可见预约则先看详情（可取消）；否则未满可新建。
 * @param {{ date: string, label: string, dateLabel: string }} col
 * @param {number} startHour
 */
function onCellClick(col, startHour) {
  const visible = visibleCellBookings(col.date, startHour)
  if (isSlotStartedOrPast(col.date, startHour)) {
    if (visible.length) {
      openDetail(col, startHour, visible)
      return
    }
    ElMessage.warning('该时段已过，无法预约')
    return
  }
  if (visible.length) {
    openDetail(col, startHour, visible)
    return
  }
  if (isSlotUnstaffed(col.date, startHour)) {
    ElMessage.warning('该时段员工请假，无法预约')
    return
  }
  if (isCellFull(col.date, startHour)) {
    ElMessage.warning(isAdmin ? '该时段员工已约满' : '该时段已满')
    return
  }
  openCreate(col, startHour)
}

function closeCreate() {
  createOpen.value = false
}

function closeDetail() {
  detailOpen.value = false
  detailBookings.value = []
  detailCell.value = null
  detailCanContinue.value = false
}

/**
 * 从详情继续约：关掉详情再打开创建弹窗。
 */
function continueFromDetail() {
  if (!detailCell.value) return
  const col = dayColumns.value.find((item) => item.date === detailCell.value.date)
  if (!col) return
  const startHour = detailCell.value.startHour
  closeDetail()
  openCreate(col, startHour)
}

/**
 * 提交预约；管理员须带代约用户。
 */
async function submitCreate() {
  createError.value = ''
  if (!createEmployeeId.value) {
    createError.value = '请选择员工'
    return
  }
  if (isAdmin && !createBookerUserId.value) {
    createError.value = '请选择预约用户'
    return
  }
  submitting.value = true
  try {
    const payload = {
      date: createDate.value,
      startHour: createStartHour.value,
      serviceId: createServiceId.value,
      employeeId: createEmployeeId.value,
      remark: createRemark.value.trim(),
    }
    if (isAdmin) payload.userId = createBookerUserId.value
    await createBooking(payload)
    createOpen.value = false
    await loadBoard()
  } catch (error) {
    createError.value = error.message || '创建失败'
  } finally {
    submitting.value = false
  }
}

/**
 * 取消指定预约后刷新详情列表；若已空则关闭。
 * @param {string} bookingId
 */
async function submitCancel(bookingId) {
  if (!bookingId) return
  cancellingId.value = bookingId
  try {
    await cancelBooking(bookingId)
    await loadBoard()
    if (!detailCell.value) {
      closeDetail()
      return
    }
    const next = visibleCellBookings(detailCell.value.date, detailCell.value.startHour)
    if (!next.length) {
      closeDetail()
      return
    }
    detailBookings.value = next
    detailCanContinue.value =
      isAdmin &&
      !isSlotStartedOrPast(detailCell.value.date, detailCell.value.startHour) &&
      !isCellFull(detailCell.value.date, detailCell.value.startHour)
  } catch (error) {
    ElMessage.error(error.message || '取消失败')
  } finally {
    cancellingId.value = ''
  }
}

onMounted(() => {
  loadBoard()
  refreshTimer = window.setInterval(refreshBookingsQuiet, 15000)
})

onUnmounted(() => {
  window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="board-page">
    <p class="board-sub">
      营业 {{ formatClockFromHour(settings.startHour) }}–{{ formatClockFromHour(settings.endHour) }}
      ｜ 每格 {{ settings.slotMinutes || SLOT_MINUTES_DEFAULT }} 分钟
      ｜ 员工 {{ employeeOptions.length }} 人（容量按各格可上班人数，请假时段不计入）
      <template v-if="isAdmin">｜ 管理员代约普通用户</template>
      <!-- 顾客端不展示别人的预约 -->
      <template v-else>｜ 只显示你自己的预约</template>
    </p>

    <!-- 列表加载失败时保留重试，不渲染空表造成「没有班次」的误解 -->
    <div v-if="loadError" class="board-status">
      <el-alert :title="loadError" type="error" :closable="false" show-icon />
      <el-button type="primary" @click="loadBoard">重试</el-button>
    </div>
    <!-- 首屏等待设置和预约 -->
    <el-skeleton v-else-if="loading" :rows="6" animated />

    <div v-else class="board-table-wrap">
      <table class="board-table">
        <thead>
          <tr>
            <th class="board-time-col">时段</th>
            <th v-for="col in dayColumns" :key="col.date">
              {{ col.label }}
              <span class="board-date">{{ col.dateLabel }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in timeRows" :key="row.startMinutes">
            <th class="board-time-col">{{ row.label }}</th>
            <td
              v-for="col in dayColumns"
              :key="`${col.date}-${row.startMinutes}`"
              :class="{
                'is-full':
                  isCellFull(col.date, row.startHour) &&
                  !isPastEmptySlot(col.date, row.startHour) &&
                  !isSlotUnstaffed(col.date, row.startHour),
                'is-partial':
                  cellBookings(col.date, row.startHour).length > 0 &&
                  !isCellFull(col.date, row.startHour),
                'is-free':
                  !cellBookings(col.date, row.startHour).length &&
                  !isPastEmptySlot(col.date, row.startHour) &&
                  !isSlotUnstaffed(col.date, row.startHour) &&
                  employeeOptions.length > 0,
                'is-off': isSlotUnstaffed(col.date, row.startHour) && !isPastEmptySlot(col.date, row.startHour),
                'is-past': isPastEmptySlot(col.date, row.startHour),
              }"
              @click="onCellClick(col, row.startHour)"
            >
              <span class="board-plus">{{ cellLabelText(col.date, row.startHour) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <BookingCreateDialog
      v-if="createOpen"
      :date-title="createDateTitle"
      :date-sub="createDateSub"
      :start-hour="createStartHour"
      :create-date="createDate"
      :service-id="createServiceId"
      :employee-id="createEmployeeId"
      :services="serviceOptions"
      :employees="employeeOptions"
      :bookings="bookings"
      :slot-minutes="settings.slotMinutes || SLOT_MINUTES_DEFAULT"
      :is-admin="isAdmin"
      :booker-name="bookerName"
      :booker-user-id="createBookerUserId"
      :users="userOptions"
      :remark="createRemark"
      :error="createError"
      :submitting="submitting"
      @close="closeCreate"
      @submit="submitCreate"
      @update:service-id="createServiceId = $event"
      @update:employee-id="createEmployeeId = $event"
      @update:booker-user-id="createBookerUserId = $event"
      @update:remark="createRemark = $event"
    />

    <BookingDetailDialog
      v-if="detailOpen && detailBookings.length"
      :bookings="detailBookings"
      :cancelling-id="cancellingId"
      :role="role"
      :user-id="userId"
      :can-continue="detailCanContinue"
      @close="closeDetail"
      @cancel="submitCancel"
      @continue="continueFromDetail"
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

/* 已约部分员工，仍可继续约 */
.is-partial {
  cursor: pointer;
  background: #fff7e6;
  color: #ad6800;
  font-size: 12px;
}

/* 全体员工已满 */
.is-full {
  cursor: pointer;
  background: #fde8e8;
  color: #9b1c1c;
  font-size: 12px;
}

/* 该格全员请假 */
.is-off {
  cursor: not-allowed;
  color: #7b8794;
  background: #eef2f6;
  font-size: 12px;
}

/* 已过点的空闲格：不可约 */
.is-past {
  cursor: not-allowed;
  color: #9aa5b1;
  background: #f5f7fa;
  font-size: 12px;
}

.board-plus {
  font-size: 12px;
}
</style>
