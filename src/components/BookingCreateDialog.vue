<script setup>
import { computed, watch } from 'vue'
import {
  formatClockFromHour,
  hourToMinutes,
  isEmployeeBusyInRange,
  isEmployeeOnLeave,
  isUserBusyInRange,
} from '@/utils/schedule'

const props = defineProps({
  /** 主标题：星期，如周四 */
  dateTitle: { type: String, required: true },
  /** 副标题：月/日，如 9/17 */
  dateSub: { type: String, default: '' },
  /** 点中格的开始整点（可为半点） */
  startHour: { type: Number, default: null },
  /** 预约日期 YYYY-MM-DD，用来判断员工是否空闲 */
  createDate: { type: String, required: true },
  /** 当前选中的服务 id */
  serviceId: { type: String, required: true },
  /** 当前选中的员工 id */
  employeeId: { type: String, required: true },
  /** 可选服务列表（来自接口） */
  services: { type: Array, default: () => [] },
  /** 全部员工 */
  employees: { type: Array, default: () => [] },
  /** 当前进行中预约，用来判断员工是否已被占用 */
  bookings: { type: Array, default: () => [] },
  /** 当前时间段分钟数 */
  slotMinutes: { type: Number, required: true },
  /** 是否管理员：管理员须选代约用户，不能绑自己 */
  isAdmin: { type: Boolean, default: false },
  /** 普通用户自约时展示的姓名 */
  bookerName: { type: String, default: '' },
  /** 管理员代约选中的用户 id */
  bookerUserId: { type: String, default: '' },
  /** 可代约的普通用户列表 */
  users: { type: Array, default: () => [] },
  /** 可选备注 */
  remark: { type: String, required: true },
  /** 接口或校验失败文案 */
  error: { type: String, default: '' },
  /** 提交中禁用按钮，防止连点 */
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'submit',
  'update:serviceId',
  'update:employeeId',
  'update:bookerUserId',
  'update:remark',
])

/** 用来预告将占用到几点 */
const selectedService = computed(
  () => props.services.find((item) => item.id === props.serviceId) || null,
)

/**
 * 本次预约占用的分钟区间，用来判断请假是否挡住。
 * @returns {{ start: number, end: number } | null}
 */
function bookingRangeMinutes() {
  const service = selectedService.value
  if (!service || props.startHour == null) return null
  const start = hourToMinutes(props.startHour)
  return { start, end: start + hourToMinutes(service.durationHours) }
}

/**
 * 能做当前项目、且本时段空闲、该时段未请假的员工。
 */
const availableEmployees = computed(() => {
  const service = selectedService.value
  const range = bookingRangeMinutes()
  if (!service || !range) return []
  return (props.employees || []).filter((emp) => {
    if (!(emp.serviceIds || []).includes(props.serviceId)) return false
    if (isEmployeeOnLeave(emp.leaves, emp.id, props.createDate, range.start, range.end)) return false
    return !isEmployeeBusyInRange(
      props.bookings,
      emp.id,
      props.createDate,
      props.startHour,
      service.durationHours,
      props.slotMinutes,
    )
  })
})

/**
 * 能做当前项目但该时段请假的员工，下拉里禁用。
 */
const offEmployees = computed(() => {
  const range = bookingRangeMinutes()
  if (!range) return []
  return (props.employees || []).filter((emp) => {
    if (!(emp.serviceIds || []).includes(props.serviceId)) return false
    return isEmployeeOnLeave(emp.leaves, emp.id, props.createDate, range.start, range.end)
  })
})

/**
 * 下拉禁用项文案：该时段请假。
 * @param {{ name: string }} emp
 */
function offEmployeeLabel(emp) {
  return `${emp.name}（请假，不可选）`
}

/**
 * 管理员代约：排除该时段已有预约的用户。
 */
const availableUsers = computed(() => {
  const service = selectedService.value
  if (!service) return props.users || []
  return (props.users || []).filter(
    (user) =>
      !isUserBusyInRange(
        props.bookings,
        user.id,
        props.createDate,
        props.startHour,
        service.durationHours,
        props.slotMinutes,
      ),
  )
})

/**
 * 服务时长展示：1 → 1 小时；0.5 → 30 分钟。
 * @param {number} hours
 */
function durationLabel(hours) {
  const minutes = Math.round(Number(hours) * 60)
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** 打开或换服务时默认选第一个可用员工。 */
watch(
  () => [props.serviceId, availableEmployees.value.map((item) => item.id).join(',')],
  () => {
    const ids = availableEmployees.value.map((item) => item.id)
    if (!ids.includes(props.employeeId)) {
      emit('update:employeeId', ids[0] || '')
    }
  },
  { immediate: true },
)

/** 代约用户若已不可选，清空或切到第一个空闲用户。 */
watch(
  () => availableUsers.value.map((item) => item.id).join(','),
  () => {
    if (!props.isAdmin) return
    const ids = availableUsers.value.map((item) => item.id)
    if (!ids.includes(props.bookerUserId)) {
      emit('update:bookerUserId', ids[0] || '')
    }
  },
  { immediate: true },
)
</script>

<template>
  <el-dialog
    title="新建预约"
    model-value
    width="400px"
    :close-on-click-modal="true"
    @close="emit('close')"
  >
    <p class="booking-create-dialog-lead">
      {{ dateTitle }}
      <template v-if="dateSub">（{{ dateSub }}）</template>
      {{ formatClockFromHour(startHour) }}
      起
    </p>
    <el-form label-position="top">
      <el-form-item label="服务种类">
        <el-select :model-value="serviceId" style="width: 100%" @change="emit('update:serviceId', $event)">
          <el-option
            v-for="item in services"
            :key="item.id"
            :label="`${item.name}（${durationLabel(item.durationHours)} · ¥${item.price}）`"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="员工">
        <el-select
          :model-value="employeeId"
          :disabled="!availableEmployees.length"
          style="width: 100%"
          @change="emit('update:employeeId', $event)"
        >
          <el-option v-if="!availableEmployees.length" label="暂无空闲员工" value="" />
          <el-option v-for="item in availableEmployees" :key="item.id" :label="item.name" :value="item.id" />
          <!-- 该时段请假：展示但不可选 -->
          <el-option
            v-for="item in offEmployees"
            :key="`off-${item.id}`"
            :label="offEmployeeLabel(item)"
            :value="item.id"
            disabled
          />
        </el-select>
      </el-form-item>
      <!-- 随服务耗时变化，提醒会连占几格 -->
      <p v-if="selectedService" class="booking-create-dialog-hint">
        将占用
        {{ formatClockFromHour(startHour) }}–
        {{ formatClockFromHour(startHour + selectedService.durationHours) }}
      </p>
      <!-- 管理员只能帮普通用户约；普通用户绑当前登录账号 -->
      <el-form-item v-if="isAdmin" label="预约用户">
        <el-select
          :model-value="bookerUserId"
          :disabled="!availableUsers.length"
          style="width: 100%"
          @change="emit('update:bookerUserId', $event)"
        >
          <el-option v-if="!availableUsers.length" label="暂无可约用户" value="" />
          <el-option
            v-for="item in availableUsers"
            :key="item.id"
            :label="`${item.name}（${item.phone}）`"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <p v-else class="booking-create-dialog-hint">预约人：{{ bookerName }}（当前登录账号）</p>
      <el-form-item label="备注（可选）">
        <el-input :model-value="remark" @input="emit('update:remark', $event)" />
      </el-form-item>
    </el-form>
    <!-- 时段冲突等失败文案 -->
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <template #footer>
      <el-button @click="emit('close')">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!services.length || !employeeId || (isAdmin && !bookerUserId)"
        @click="emit('submit')"
      >
        确认预约
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.booking-create-dialog-lead {
  margin: 0 0 12px;
}

.booking-create-dialog-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #616e7c;
}
</style>
