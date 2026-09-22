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
    <h2 class="client-book-title">预约</h2>
    <p class="client-book-hint">请选择日期、员工和时段。</p>

    <el-skeleton v-if="loading" :rows="6" animated />
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <template v-else>
      <el-steps :active="step" finish-status="success" align-center>
        <el-step title="选日期" @click="goStep(0)" />
        <el-step title="选员工" @click="goStep(1)" />
      </el-steps>

      <!-- 第一步：可约日期；换项目回介绍页 -->
      <section v-if="step === 0" class="client-book-section">
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
          <!-- 每个按钮单独包一层，避免 EP 相邻左边距在换行后错位 -->
          <span v-for="col in bookableDates" :key="col.date">
            <el-button
              :type="selectedDate === col.date ? 'primary' : 'default'"
              @click="pickDate(col.date)"
            >
              {{ col.label }} {{ col.dateLabel }}
            </el-button>
          </span>
        </div>
        <el-button class="client-book-back" @click="goCatalog">上一步</el-button>
      </section>

      <!-- 第二步：员工与时段 -->
      <section v-else class="client-book-section">
        <p class="client-book-picked">
          {{ selectedService ? selectedService.name : '' }}
          · {{ selectedDate }}
        </p>
        <el-empty v-if="!bookableEmployees.length" description="当天没有可约员工" />
        <div v-else class="client-book-people">
          <el-card
            v-for="item in bookableEmployees"
            :key="item.id"
            class="client-book-option"
            :class="{ 'is-active': employeeId === item.id }"
            shadow="never"
            @click="pickEmployee(item.id)"
          >
            <h3>{{ item.name }}</h3>
          </el-card>
        </div>
        <!-- 选人后再列可约开始时刻 -->
        <template v-if="employeeId">
          <h3 class="client-book-sub">选择时段</h3>
          <el-empty v-if="!bookableHours.length" description="该员工当天已约满" />
          <div v-else class="client-book-hours">
            <!-- 每个按钮单独包一层，避免 EP 相邻左边距在换行后错位 -->
            <span v-for="hour in bookableHours" :key="hour">
              <el-button
                :type="startHour === hour ? 'primary' : 'default'"
                @click="startHour = hour"
              >
                {{ formatClockFromHour(hour) }}–
                {{
                  formatClockFromHour(
                    hour + (selectedService ? selectedService.durationHours : 0),
                  )
                }}
              </el-button>
            </span>
          </div>
          <el-input v-model="remark" class="client-book-remark" placeholder="备注（可选）" />
        </template>
        <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
        <div class="client-book-actions">
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
/* 顾客预约：日期 → 员工与时段 */
.client-book {
  max-width: 720px;
}

.client-book-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.client-book-hint,
.client-book-picked {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 13px;
}

.client-book-section {
  margin-top: 24px;
}

.client-book-option {
  margin-bottom: 16px;
  cursor: pointer;
}

.client-book-option.is-active {
  outline: 2px solid #1f4e79;
}

.client-book-option h3 {
  margin: 0;
  font-size: 16px;
}

.client-book-hours,
.client-book-people {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

/* 按约 108px 分列，7 天在内容区会换行且左缘对齐 */
.client-book-dates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, auto));
  gap: 8px;
  margin-bottom: 16px;
}

.client-book-people {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
}

.client-book-sub {
  margin: 8px 0 12px;
  font-size: 15px;
}

.client-book-remark {
  max-width: 360px;
  margin-bottom: 12px;
}

.client-book-back,
.client-book-actions {
  margin-top: 8px;
}

.client-book-actions {
  display: flex;
  gap: 8px;
}
</style>
