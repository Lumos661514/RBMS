<script setup>
import { computed, watch } from 'vue'
import { formatClockFromHour, isEmployeeBusyInRange, isUserBusyInRange } from '@/utils/schedule'

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
 * 能做当前项目、且本时段空闲的员工。
 */
const availableEmployees = computed(() => {
  const service = selectedService.value
  if (!service) return []
  return (props.employees || []).filter((emp) => {
    if (!(emp.serviceIds || []).includes(props.serviceId)) return false
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
  <div class="booking-create-dialog" @click.self="emit('close')">
    <div class="booking-create-dialog-panel" role="dialog">
      <h2>新建预约</h2>
      <p>
        {{ dateTitle }}
        <template v-if="dateSub">（{{ dateSub }}）</template>
        {{ formatClockFromHour(startHour) }}
        起
      </p>
      <label>
        服务种类
        <select :value="serviceId" @change="emit('update:serviceId', $event.target.value)">
          <option v-for="item in services" :key="item.id" :value="item.id">
            {{ item.name }}（{{ durationLabel(item.durationHours) }} · ¥{{ item.price }}）
          </option>
        </select>
      </label>
      <label>
        员工
        <select
          :value="employeeId"
          :disabled="!availableEmployees.length"
          @change="emit('update:employeeId', $event.target.value)"
        >
          <option v-if="!availableEmployees.length" value="">暂无空闲员工</option>
          <option v-for="item in availableEmployees" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </label>
      <!-- 随服务耗时变化，提醒会连占几格 -->
      <p v-if="selectedService" class="booking-create-dialog-hint">
        将占用
        {{ formatClockFromHour(startHour) }}–
        {{ formatClockFromHour(startHour + selectedService.durationHours) }}
      </p>
      <!-- 管理员只能帮普通用户约；普通用户绑当前登录账号 -->
      <label v-if="isAdmin">
        预约用户
        <select
          :value="bookerUserId"
          :disabled="!availableUsers.length"
          @change="emit('update:bookerUserId', $event.target.value)"
        >
          <option v-if="!availableUsers.length" value="">暂无可约用户</option>
          <option v-for="item in availableUsers" :key="item.id" :value="item.id">
            {{ item.name }}（{{ item.phone }}）
          </option>
        </select>
      </label>
      <p v-else class="booking-create-dialog-hint">预约人：{{ bookerName }}（当前登录账号）</p>
      <label>
        备注（可选）
        <input :value="remark" type="text" @input="emit('update:remark', $event.target.value)" />
      </label>
      <!-- 时段冲突等失败文案 -->
      <p v-if="error" class="booking-create-dialog-error">{{ error }}</p>
      <div class="booking-create-dialog-actions">
        <button type="button" class="booking-create-dialog-ghost" @click="emit('close')">取消</button>
        <button
          type="button"
          :disabled="
            submitting ||
            !services.length ||
            !employeeId ||
            (isAdmin && !bookerUserId)
          "
          @click="emit('submit')"
        >
          {{ submitting ? '提交中…' : '确认预约' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩：点空白关闭 */
.booking-create-dialog {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.booking-create-dialog-panel {
  width: 360px;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.booking-create-dialog-panel h2 {
  margin: 0;
  font-size: 18px;
}

.booking-create-dialog-panel p {
  margin: 0;
}

.booking-create-dialog-panel label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #52606d;
}

.booking-create-dialog-panel input,
.booking-create-dialog-panel select {
  padding: 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
}

.booking-create-dialog-hint {
  font-size: 12px;
  color: #616e7c;
}

.booking-create-dialog-error {
  color: #c81e1e;
  font-size: 13px;
}

.booking-create-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.booking-create-dialog-actions button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.booking-create-dialog-ghost {
  background: #e4e7eb;
  color: #1f2933;
}
</style>
