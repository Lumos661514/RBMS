<script setup>
import { computed } from 'vue'
import { WEEKDAY_LABELS } from '@/config/schedule'
import { SERVICES, getServiceById } from '@/config/services'

const props = defineProps({
  /** 点中的星期，0–6 */
  weekday: { type: Number, default: null },
  /** 点中格的开始整点 */
  startHour: { type: Number, default: null },
  /** 当前选中的服务 id */
  serviceId: { type: String, required: true },
  /** 客户姓名，提交前必填 */
  contactName: { type: String, required: true },
  /** 可选备注 */
  remark: { type: String, required: true },
  /** 接口或校验失败文案 */
  error: { type: String, default: '' },
  /** 提交中禁用按钮，防止连点 */
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'submit', 'update:serviceId', 'update:contactName', 'update:remark'])

/** 用来预告将占用到几点 */
const selectedService = computed(() => getServiceById(props.serviceId))

/** 弹窗文案里把整点补成两位。 */
function padHour(hour) {
  return String(hour).padStart(2, '0')
}
</script>

<template>
  <div class="booking-create-dialog" @click.self="emit('close')">
    <div class="booking-create-dialog-panel" role="dialog">
      <h2>新建预约</h2>
      <p>
        {{ WEEKDAY_LABELS[weekday] }}
        {{ padHour(startHour) }}:00
        起
      </p>
      <label>
        服务种类
        <select :value="serviceId" @change="emit('update:serviceId', $event.target.value)">
          <option v-for="item in SERVICES" :key="item.id" :value="item.id">
            {{ item.name }}（{{ item.durationHours }} 小时）
          </option>
        </select>
      </label>
      <!-- 随服务耗时变化，提醒会连占几格 -->
      <p v-if="selectedService" class="booking-create-dialog-hint">
        将占用
        {{ padHour(startHour) }}:00–
        {{ padHour(startHour + selectedService.durationHours) }}:00
      </p>
      <label>
        客户姓名
        <input :value="contactName" type="text" @input="emit('update:contactName', $event.target.value)" />
      </label>
      <label>
        备注（可选）
        <input :value="remark" type="text" @input="emit('update:remark', $event.target.value)" />
      </label>
      <!-- 姓名校验失败或时段冲突 -->
      <p v-if="error" class="booking-create-dialog-error">{{ error }}</p>
      <div class="booking-create-dialog-actions">
        <button type="button" class="booking-create-dialog-ghost" @click="emit('close')">取消</button>
        <button type="button" :disabled="submitting" @click="emit('submit')">
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
