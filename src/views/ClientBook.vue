<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { USER_ID_KEY } from '@/api/request'
import { createBooking, getBookings, getOccupancy } from '@/api/booking'
import { getEmployees } from '@/api/employees'
import { getServices } from '@/api/services'
import { getSettings } from '@/api/settings'
import { DAY_COUNT_DEFAULT, SLOT_MINUTES_DEFAULT } from '@/config/schedule'
import {
  buildDayColumns,
  buildTimeRows,
  formatBookingDateDisplay,
  formatClockFromHour,
  formatDurationText,
  formatISODate,
  isActiveBooking,
  slotBlockReason,
} from '@/utils/schedule'

/** 当前登录用户，提交与「同时段已有预约」校验用 */
const userId = localStorage.getItem(USER_ID_KEY) || ''
const route = useRoute()
const router = useRouter()

/** 0 日期 → 1 员工与时段 → 2 确认；项目由介绍页 query.service 带入 */
const step = ref(0)
const stepTitles = ['选日期', '员工与时段', '确认预约']
const services = ref([])
const employees = ref([])
const settings = ref({
  slotMinutes: SLOT_MINUTES_DEFAULT,
  startHour: 9,
  endHour: 18,
  dayCount: DAY_COUNT_DEFAULT,
})
/** 自己的预约，用来标出自己的占用 */
const myBookings = ref([])
/** 全员进行中占用，不含别人姓名 */
const occupancy = ref([])
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const submitting = ref(false)

/** 已选项目 */
const serviceId = ref('')
/** 已选日期 YYYY-MM-DD */
const selectedDate = ref('')
/** 已选员工 */
const employeeId = ref('')
/** 已选开始时刻 */
const startHour = ref(null)
/** 可选备注，确认步再填 */
const remark = ref('')

const selectedService = computed(
  () => services.value.find((item) => item.id === serviceId.value) || null,
)
const selectedEmployee = computed(
  () => employees.value.find((item) => item.id === employeeId.value) || null,
)
const dayColumns = computed(() => buildDayColumns(settings.value.dayCount))
const timeRows = computed(() =>
  buildTimeRows(settings.value.startHour, settings.value.endHour, settings.value.slotMinutes),
)
const selectedDay = computed(
  () => dayColumns.value.find((col) => col.date === selectedDate.value) || null,
)

/**
 * 占用块补上自己的 userId，供 slotBlockReason 判断同时段互斥。
 */
function occupancyBookings() {
  const mine = (myBookings.value || []).filter(isActiveBooking)
  return (occupancy.value || []).map((block) => {
    const date = String(block.date).slice(0, 10)
    const own = mine.find(
      (item) =>
        item.employeeId === block.employeeId &&
        String(item.date).slice(0, 10) === date &&
        Number(item.startHour) === Number(block.startHour),
    )
    return {
      employeeId: block.employeeId,
      date,
      startHour: Number(block.startHour),
      durationHours: Number(block.durationHours),
      status: 'active',
      userId: own ? own.userId : '',
    }
  })
}

/**
 * 该员工在该日该点不可约时的短原因；可约返回空字符串。
 * @param {string} date
 * @param {{ id: string, serviceIds?: string[], leaves?: object[] }} employee
 * @param {number} hour
 */
function slotReason(date, employee, hour) {
  const service = selectedService.value
  if (!service || !employee) return '不可约'
  return slotBlockReason(
    occupancyBookings(),
    date,
    hour,
    service.durationHours,
    settings.value.endHour,
    settings.value.slotMinutes,
    new Date(),
    employee,
    service.id,
    userId,
    employee.leaves,
  )
}

/**
 * 该员工在该日该点是否可约当前项目。
 * @param {string} date
 * @param {{ id: string, serviceIds?: string[], leaves?: object[] }} employee
 * @param {number} hour
 */
function isStartBookable(date, employee, hour) {
  return slotReason(date, employee, hour) === ''
}

/** 能做当前项目的员工，含当天已无可约时段的人，方便看到原因 */
const serviceEmployees = computed(() => {
  if (!serviceId.value) return []
  return employees.value.filter((item) => (item.serviceIds || []).includes(serviceId.value))
})

/** 项目时长不能放进当前时间格时，选日会全空 */
const durationMismatch = computed(() => {
  const service = selectedService.value
  if (!service) return false
  const slot = settings.value.slotMinutes
  const minutes = Math.round(Number(service.durationHours) * 60)
  return minutes < slot || minutes % slot !== 0
})

/** 看板区间内至少有一个空位的日期 */
const bookableDates = computed(() =>
  dayColumns.value.filter((col) =>
    serviceEmployees.value.some((emp) =>
      timeRows.value.some((row) => isStartBookable(col.date, emp, row.startHour)),
    ),
  ),
)

/**
 * 该员工当天是否还有可约开始时刻。
 * @param {{ id: string, serviceIds?: string[], leaves?: object[] }} employee
 */
function employeeHasSlot(employee) {
  if (!selectedDate.value) return false
  return timeRows.value.some((row) => isStartBookable(selectedDate.value, employee, row.startHour))
}

/** 已选员工当天的全部开始时刻，不可约的带短原因 */
const daySlots = computed(() => {
  const service = selectedService.value
  const employee = selectedEmployee.value
  if (!selectedDate.value || !employee || !service) return []
  return timeRows.value.map((row) => ({
    startHour: row.startHour,
    label: `${formatClockFromHour(row.startHour)}–${formatClockFromHour(row.startHour + service.durationHours)}`,
    reason: slotReason(selectedDate.value, employee, row.startHour),
  }))
})

/** 确认页上的时间一行 */
const summaryTime = computed(() => {
  const service = selectedService.value
  if (!selectedDate.value || startHour.value == null || !service) return ''
  const week = selectedDay.value ? `${selectedDay.value.label} ` : ''
  const start = formatClockFromHour(startHour.value)
  const end = formatClockFromHour(startHour.value + service.durationHours)
  return `${week}${formatBookingDateDisplay(selectedDate.value)} ${start}–${end}`
})

/** 同时拉项目、员工、设置、自己的预约和占用。 */
async function loadPage() {
  loading.value = true
  loadError.value = ''
  try {
    const from = formatISODate(new Date())
    const [serviceData, employeeData, nextSettings, bookingData, occupancyData] = await Promise.all([
      getServices(),
      getEmployees(),
      getSettings(),
      getBookings(from),
      getOccupancy(),
    ])
    services.value = serviceData.list || []
    employees.value = employeeData.list || []
    settings.value = nextSettings
    myBookings.value = bookingData.list || []
    occupancy.value = occupancyData.list || []
    const preset = typeof route.query.service === 'string' ? route.query.service : ''
    if (!preset || !services.value.some((item) => item.id === preset)) {
      await router.replace('/book')
      return
    }
    serviceId.value = preset
  } catch (error) {
    loadError.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 选日期。换日后清掉员工和时段，避免确认页还挂着上一天的选择。
 * @param {string} date
 */
function pickDate(date) {
  if (selectedDate.value !== date) {
    employeeId.value = ''
    startHour.value = null
  }
  selectedDate.value = date
  actionError.value = ''
}

/**
 * 选员工，时段重选。
 * @param {string} id
 */
function pickEmployee(id) {
  employeeId.value = id
  startHour.value = null
  actionError.value = ''
}

/**
 * 点可约时段。不可约的格子是禁用按钮，这里再挡一层。
 * @param {{ startHour: number, reason: string }} slot
 */
function pickSlot(slot) {
  if (slot.reason) return
  startHour.value = slot.startHour
  actionError.value = ''
}

/**
 * 回到已完成的某一步。点步骤标题时用。
 * @param {number} next
 */
function goStep(next) {
  if (next < 0 || next > step.value) return
  if (next === 0) {
    employeeId.value = ''
    startHour.value = null
  }
  actionError.value = ''
  step.value = next
}

/** 换项目时回介绍页。 */
function goCatalog() {
  router.push('/book')
}

/** 当前步校验通过后进入下一步。 */
function goNext() {
  actionError.value = ''
  if (step.value === 0) {
    if (!selectedDate.value) {
      actionError.value = '请选择日期'
      return
    }
    step.value = 1
    return
  }
  if (step.value !== 1) return
  if (!employeeId.value || startHour.value == null) {
    actionError.value = '请选择员工和时段'
    return
  }
  const slot = daySlots.value.find((item) => item.startHour === startHour.value)
  if (!slot || slot.reason) {
    actionError.value = slot?.reason ? `该时段不可约（${slot.reason}）` : '请选择员工和时段'
    startHour.value = null
    return
  }
  step.value = 2
}

/** 提交自约，成功后去「我的预约」看进行中的预约。 */
async function onSubmit() {
  actionError.value = ''
  if (!serviceId.value || !selectedDate.value || !employeeId.value || startHour.value == null) {
    actionError.value = '请选完项目、日期、员工和时段'
    return
  }
  submitting.value = true
  try {
    await createBooking({
      date: selectedDate.value,
      startHour: startHour.value,
      serviceId: serviceId.value,
      employeeId: employeeId.value,
      remark: remark.value.trim(),
    })
    ElMessage.success('预约成功')
    await router.replace({ path: '/book/account', query: { tab: 'bookings' } })
  } catch (error) {
    actionError.value = error.message || '预约失败'
  } finally {
    submitting.value = false
  }
}

onMounted(loadPage)
</script>

<template>
  <div class="client-book">
    <h2 class="page-title">预约</h2>
    <p class="page-hint">按步骤选择日期、员工和时段，确认信息后再提交。</p>

    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else-if="loadError" class="page-load-error">
      <el-alert :title="loadError" type="error" :closable="false" show-icon />
      <el-button type="primary" @click="loadPage">重试</el-button>
    </div>

    <template v-else>
      <el-steps :active="step" align-center class="client-book-steps">
        <el-step v-for="(title, index) in stepTitles" :key="title" :title="title">
          <template #title>
            <button
              type="button"
              class="client-book-step-hit"
              :disabled="index > step"
              @click="goStep(index)"
            >
              {{ title }}
            </button>
          </template>
        </el-step>
      </el-steps>

      <!-- 第一步：可约日期；换项目回介绍页 -->
      <section v-if="step === 0" class="desk-section client-book-section">
        <p class="client-book-picked">
          项目：{{ selectedService ? selectedService.name : '' }}
          <template v-if="selectedService">
            · ¥{{ selectedService.price }} · {{ formatDurationText(selectedService.durationHours) }}
          </template>
        </p>
        <el-empty
          v-if="!bookableDates.length"
          :description="
            durationMismatch
              ? '该项目时长须为时间格的整数倍，请管理员调整项目或系统设置'
              : '看板区间内暂无可约日期'
          "
        />
        <div v-else class="client-book-dates">
          <button
            v-for="col in bookableDates"
            :key="col.date"
            type="button"
            class="client-book-chip"
            :class="{ 'is-active': selectedDate === col.date }"
            @click="pickDate(col.date)"
          >
            {{ col.label }} {{ col.dateLabel }}
          </button>
        </div>
        <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
        <div class="desk-actions client-book-actions">
          <el-button @click="goCatalog">返回项目</el-button>
          <el-button type="primary" :disabled="!selectedDate" @click="goNext">下一步</el-button>
        </div>
      </section>

      <!-- 第二步：员工与当天全部时段 -->
      <section v-else-if="step === 1" class="desk-section client-book-section">
        <p class="client-book-picked">
          {{ selectedService ? selectedService.name : '' }}
          · {{ selectedDay ? selectedDay.label : '' }}
          {{ selectedDate }}
        </p>
        <el-empty v-if="!serviceEmployees.length" description="暂无员工可做该项目" />
        <template v-else>
          <div class="client-book-people">
            <button
              v-for="item in serviceEmployees"
              :key="item.id"
              type="button"
              class="client-book-person"
              :class="{ 'is-active': employeeId === item.id }"
              @click="pickEmployee(item.id)"
            >
              <span>{{ item.name }}</span>
              <span v-if="!employeeHasSlot(item)" class="client-book-person-note">当天不可约</span>
            </button>
          </div>
          <template v-if="employeeId">
            <h3 class="desk-section-title">选择时段</h3>
            <p class="client-book-slot-hint">当天全部时段如下，不可选的会标出原因。</p>
            <div class="client-book-hours">
              <button
                v-for="slot in daySlots"
                :key="slot.startHour"
                type="button"
                class="client-book-slot"
                :class="{ 'is-active': startHour === slot.startHour, 'is-disabled': slot.reason }"
                :disabled="Boolean(slot.reason)"
                @click="pickSlot(slot)"
              >
                <span>{{ slot.label }}</span>
                <span v-if="slot.reason" class="client-book-slot-reason">{{ slot.reason }}</span>
              </button>
            </div>
          </template>
        </template>
        <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
        <div class="desk-actions client-book-actions">
          <el-button @click="goStep(0)">上一步</el-button>
          <el-button type="primary" :disabled="startHour == null" @click="goNext">下一步</el-button>
        </div>
      </section>

      <!-- 第三步：核对摘要后再提交 -->
      <section v-else class="desk-section client-book-section">
        <h3 class="desk-section-title">请核对预约信息</h3>
        <dl class="client-book-summary">
          <dt>项目</dt>
          <dd>{{ selectedService ? selectedService.name : '' }}</dd>
          <dt>员工</dt>
          <dd>{{ selectedEmployee ? selectedEmployee.name : '' }}</dd>
          <dt>时间</dt>
          <dd>{{ summaryTime }}</dd>
          <dt>时长</dt>
          <dd>{{ selectedService ? formatDurationText(selectedService.durationHours) : '' }}</dd>
          <dt>价格</dt>
          <dd>¥{{ selectedService ? selectedService.price : '' }}</dd>
        </dl>
        <el-form label-position="top" class="client-book-remark" @submit.prevent="onSubmit">
          <el-form-item label="备注（可选）">
            <el-input v-model="remark" maxlength="255" placeholder="例如期望的注意事项" />
          </el-form-item>
        </el-form>
        <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
        <div class="desk-actions client-book-actions">
          <el-button @click="goStep(1)">上一步</el-button>
          <el-button type="primary" :loading="submitting" @click="onSubmit">确认预约</el-button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.client-book {
  max-width: 720px;
}

.client-book-steps {
  margin: 0 0 20px;
}

.client-book-steps :deep(.el-step__title) {
  font-size: 13px;
  line-height: 1.35;
  white-space: normal;
}

.client-book-steps :deep(.el-step__title.is-process),
.client-book-steps :deep(.el-step__title.is-finish),
.client-book-steps :deep(.el-step__head.is-process),
.client-book-steps :deep(.el-step__head.is-finish) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.client-book-steps :deep(.el-step__head.is-finish .el-step__line) {
  background-color: var(--color-primary);
}

.client-book-step-hit {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  line-height: inherit;
  cursor: pointer;
}

.client-book-step-hit:disabled {
  cursor: default;
  color: inherit;
}

.client-book-picked {
  margin: 0 0 16px;
  color: var(--color-text-subtle);
  font-size: 13px;
}

.client-book-section {
  margin-top: 0;
}

.client-book-chip,
.client-book-person,
.client-book-slot {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
}

.client-book-chip,
.client-book-slot {
  min-height: 44px;
}

.client-book-chip:hover,
.client-book-person:hover,
.client-book-slot:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.client-book-chip.is-active,
.client-book-person.is-active,
.client-book-slot.is-active {
  background: var(--color-list-active);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.client-book-person {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 44px;
}

.client-book-person-note {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted);
}

.client-book-person.is-active .client-book-person-note {
  color: color-mix(in srgb, var(--color-primary) 72%, var(--color-text-muted));
}

.client-book-slot-hint {
  margin: -6px 0 12px;
  font-size: 12px;
  color: var(--color-text-subtle);
}

.client-book-slot {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
}

.client-book-slot.is-disabled,
.client-book-slot:disabled {
  cursor: not-allowed;
  background: color-mix(in srgb, var(--color-bg) 65%, var(--color-border));
  color: var(--color-text-muted);
  font-weight: 400;
}

.client-book-slot.is-disabled:hover,
.client-book-slot:disabled:hover {
  border-color: var(--color-border);
}

.client-book-slot-reason {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.client-book-hours,
.client-book-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.client-book-hours {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
}

.client-book-people {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.client-book-summary {
  display: grid;
  grid-template-columns: 4.5em 1fr;
  gap: 10px 12px;
  margin: 0 0 16px;
  font-size: 14px;
}

.client-book-summary dt {
  margin: 0;
  color: var(--color-text-muted);
}

.client-book-summary dd {
  margin: 0;
  color: var(--color-text);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.client-book-remark {
  max-width: 420px;
  margin-bottom: 4px;
}

.client-book-actions {
  margin-top: 8px;
}

@media (max-width: 720px) {
  .client-book-remark {
    max-width: none;
  }

  .client-book-steps :deep(.el-step__title) {
    font-size: 12px;
  }

  .client-book-actions :deep(.el-button) {
    flex: 1;
  }
}
</style>
