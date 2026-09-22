<script setup>
import { computed, onMounted, ref } from 'vue'
import { getBookings } from '@/api/booking'
import { getEmployees } from '@/api/employees'
import { getSettings } from '@/api/settings'
import {
  buildDayColumns,
  buildTimeRows,
  dayOccupancyRate,
  employeeFillRates,
  revenueByService,
  workingEmployeesAt,
} from '@/utils/schedule'
import { DAY_COUNT_DEFAULT, SLOT_MINUTES_DEFAULT } from '@/config/schedule'

/** 营业设置，决定看板区间与每日格数 */
const settings = ref({
  slotMinutes: SLOT_MINUTES_DEFAULT,
  startHour: 9,
  endHour: 18,
  dayCount: DAY_COUNT_DEFAULT,
})
/** 含已结束预约，用来算营收 */
const bookings = ref([])
const employees = ref([])
const loading = ref(false)
const loadError = ref('')

const timeRows = computed(() =>
  buildTimeRows(settings.value.startHour, settings.value.endHour, settings.value.slotMinutes),
)
const dayColumns = computed(() => buildDayColumns(settings.value.dayCount))
/** 看板可见日期，用来算占用和饱和度 */
const rangeDates = computed(() => dayColumns.value.map((col) => col.date))

/** 各日占用率：各格进行中人次 / 各格可上班人数之和。可上班取当天最多的一格。 */
const occupancyRows = computed(() =>
  dayColumns.value.map((col) => {
    const slot = settings.value.slotMinutes
    let peak = 0
    for (const row of timeRows.value) {
      peak = Math.max(peak, workingEmployeesAt(employees.value, col.date, row.startHour, slot).length)
    }
    const rate = dayOccupancyRate(bookings.value, col.date, timeRows.value, employees.value, slot)
    return {
      date: col.date,
      label: `${col.label} ${col.dateLabel}`,
      working: peak,
      rate,
    }
  }),
)

/** 已到开始时刻才计入，不限看板日期，过了当天仍保留 */
const serviceRevenue = computed(() => revenueByService(bookings.value))
const totalRevenue = computed(() =>
  serviceRevenue.value.reduce((sum, item) => sum + item.total, 0),
)
const fillRows = computed(() =>
  employeeFillRates(
    bookings.value,
    employees.value,
    rangeDates.value,
    timeRows.value,
    settings.value.slotMinutes,
  ),
)

/**
 * 0–1 转百分比文案。
 * @param {number} rate
 */
function percentText(rate) {
  return `${Math.round(Number(rate) * 100)}%`
}

/** 金额展示。 */
function moneyText(n) {
  return `¥${Number(n).toFixed(0)}`
}

/** 同时拉设置、预约、员工。 */
async function loadStats() {
  loading.value = true
  loadError.value = ''
  try {
    const [nextSettings, bookingData, employeeData] = await Promise.all([
      getSettings(),
      getBookings(),
      getEmployees(),
    ])
    settings.value = nextSettings
    bookings.value = bookingData.list || []
    employees.value = employeeData.list || []
  } catch (error) {
    loadError.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)
</script>

<template>
  <div class="ops-stats">
    <h2 class="ops-stats-title">占用与营收</h2>
    <p class="ops-stats-hint">
      占用和饱和度按当前看板列数，只算尚未结束的预约。营收累计全部已到开始时刻的预约。请假重叠的格子不计入该员工容量。
    </p>

    <el-skeleton v-if="loading" :rows="6" animated />
    <!-- 拉数失败时不渲染空表 -->
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <div v-else class="ops-stats-body">
      <section>
        <h3>每日占用率</h3>
        <el-table :data="occupancyRows" stripe>
          <el-table-column prop="label" label="日期" />
          <el-table-column label="最多在岗">
            <template #default="{ row }">{{ row.working }} 人</template>
          </el-table-column>
          <el-table-column label="占用率">
            <template #default="{ row }">{{ percentText(row.rate) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section>
        <h3>项目营收（合计 {{ moneyText(totalRevenue) }}）</h3>
        <!-- 有预约时按项目汇总，否则空表提示 -->
        <el-table :data="serviceRevenue" stripe empty-text="暂无已结算预约">
          <el-table-column prop="name" label="项目" />
          <el-table-column label="营收">
            <template #default="{ row }">{{ moneyText(row.total) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section>
        <h3>员工饱和度</h3>
        <!-- 按可上班格子算饱和度 -->
        <el-table :data="fillRows" stripe empty-text="暂无员工">
          <el-table-column prop="name" label="员工" />
          <el-table-column label="已占格 / 可上班格">
            <template #default="{ row }">{{ row.used }} / {{ row.capacity }}</template>
          </el-table-column>
          <el-table-column label="饱和度">
            <template #default="{ row }">{{ percentText(row.rate) }}</template>
          </el-table-column>
        </el-table>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 占用与营收：三块表，风格跟设置页一致 */
.ops-stats-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.ops-stats-hint {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 13px;
}

.ops-stats-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 720px;
}

.ops-stats-body h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
</style>
