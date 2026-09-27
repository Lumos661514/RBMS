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
  canCreateBooking,
  formatClockFromHour,
  formatISODate,
  isActiveBooking,
} from '@/utils/schedule'

/** 当前登录用户，提交与「同时段已有预约」校验用 */
const userId = localStorage.getItem(USER_ID_KEY) || ''
const route = useRoute()
const router = useRouter()

/** 0 日期 → 1 员工与时段；项目由介绍页 query.service 带入 */
const step = ref(0)
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
/** 可选备注 */
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

/**
 * 占用块补上自己的 userId，供 canCreateBooking 判断同时段互斥。
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
 * 该员工在该日该点是否可约当前项目。
 * @param {string} date
 * @param {{ id: string, serviceIds?: string[], leaves?: object[] }} employee
 * @param {number} hour
 */
function isStartBookable(date, employee, hour) {
  const service = selectedService.value
  if (!service || !employee) return false
  return canCreateBooking(
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
  ).ok
}

/** 能做当前项目的员工 */
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

/** 已选日里至少有一个空位的员工 */
const bookableEmployees = computed(() => {
  if (!selectedDate.value) return []
  return serviceEmployees.value.filter((emp) =>
    timeRows.value.some((row) => isStartBookable(selectedDate.value, emp, row.startHour)),
  )
})

/** 已选员工当天可点的开始时刻 */
const bookableHours = computed(() => {
  if (!selectedDate.value || !selectedEmployee.value) return []
  return timeRows.value
    .filter((row) => isStartBookable(selectedDate.value, selectedEmployee.value, row.startHour))
    .map((row) => row.startHour)
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
 * 选日后进入选人。
 * @param {string} date
 */
function pickDate(date) {
  selectedDate.value = date
  employeeId.value = ''
  startHour.value = null
  actionError.value = ''
  step.value = 1
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
 * 回到已完成的某一步。
 * @param {number} next
 */
function goStep(next) {
  if (next < 0 || next > step.value) return
  if (next <= 0) {
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

/** 提交自约，成功后去个人信息页看进行中的预约。 */
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
    await router.replace('/book/account')
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
    <p class="page-hint">请选择日期、员工和时段。</p>

    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else-if="loadError" class="page-load-error">
      <el-alert :title="loadError" type="error" :closable="false" show-icon />
      <el-button type="primary" @click="loadPage">重试</el-button>
    </div>

    <template v-else>
      <!-- 文字步骤条，替代 el-steps 默认进度条观感 -->
      <ol class="client-book-steps">
        <li :class="{ 'is-active': step === 0, 'is-done': step > 0 }">
          <button type="button" @click="goStep(0)">选日期</button>
        </li>
        <li :class="{ 'is-active': step === 1 }">
          <button type="button" @click="goStep(1)">员工与时段</button>
        </li>
      </ol>

      <!-- 第一步：可约日期；换项目回介绍页 -->
      <section v-if="step === 0" class="desk-section client-book-section">
        <p class="client-book-picked">项目：{{ selectedService ? selectedService.name : '' }}</p>
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
        <el-button class="client-book-back" @click="goCatalog">上一步</el-button>
      </section>

      <!-- 第二步：员工与时段 -->
      <section v-else class="desk-section client-book-section">
        <p class="client-book-picked">
          {{ selectedService ? selectedService.name : '' }}
          · {{ selectedDate }}
        </p>
        <el-empty v-if="!bookableEmployees.length" description="当天没有可约员工" />
        <div v-else class="client-book-people">
          <button
            v-for="item in bookableEmployees"
            :key="item.id"
            type="button"
            class="client-book-person"
            :class="{ 'is-active': employeeId === item.id }"
            @click="pickEmployee(item.id)"
          >
            {{ item.name }}
          </button>
        </div>
        <!-- 选人后再列可约开始时刻 -->
        <template v-if="employeeId">
          <h3 class="desk-section-title">选择时段</h3>
          <el-empty v-if="!bookableHours.length" description="该员工当天已约满" />
          <div v-else class="client-book-hours">
            <button
              v-for="hour in bookableHours"
              :key="hour"
              type="button"
              class="client-book-chip"
              :class="{ 'is-active': startHour === hour }"
              @click="startHour = hour"
            >
              {{ formatClockFromHour(hour) }}–
              {{
                formatClockFromHour(hour + (selectedService ? selectedService.durationHours : 0))
              }}
            </button>
          </div>
          <el-input v-model="remark" class="client-book-remark" placeholder="备注（可选）" />
        </template>
        <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
        <div class="desk-actions client-book-actions">
          <el-button @click="goStep(0)">上一步</el-button>
          <el-button
            type="primary"
            :loading="submitting"
            :disabled="startHour == null"
            @click="onSubmit"
          >
            确认预约
          </el-button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* 顾客预约：值班台步骤 + 可选芯片 */
.client-book {
  max-width: 720px;
}

.client-book-steps {
  display: flex;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
}

.client-book-steps li button {
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.client-book-steps li.is-done button {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
}

.client-book-steps li.is-active button {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  font-weight: 600;
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
.client-book-person {
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

.client-book-chip:hover,
.client-book-person:hover {
  border-color: var(--color-primary);
}

.client-book-chip.is-active,
.client-book-person.is-active {
  background: var(--color-list-active);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.client-book-hours,
.client-book-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.client-book-people {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.client-book-remark {
  max-width: 360px;
  margin-bottom: 12px;
}

.client-book-back {
  margin-top: 4px;
}

.client-book-actions {
  margin-top: 8px;
}
</style>
