<script setup>
import { WEEKDAY_LABELS } from '@/config/schedule'

defineProps({
  /** 当前点中的已占预约 */
  booking: { type: Object, required: true },
  /** 取消请求进行中 */
  cancelling: { type: Boolean, default: false },
})

defineEmits(['close', 'cancel'])

/**
 * 展示起止整点，结束点 = 开始 + 耗时。
 * @param {{ startHour: number, durationHours: number }} booking
 */
function bookingEndLabel(booking) {
  const start = String(booking.startHour).padStart(2, '0')
  const end = String(booking.startHour + booking.durationHours).padStart(2, '0')
  return `${start}:00–${end}:00`
}
</script>

<template>
  <div class="booking-detail-dialog" @click.self="$emit('close')">
    <div class="booking-detail-dialog-panel" role="dialog">
      <h2>预约详情</h2>
      <p>服务：{{ booking.serviceName }}</p>
      <p>客户：{{ booking.contactName }}</p>
      <p>
        时间：{{ WEEKDAY_LABELS[booking.weekday] }}
        {{ bookingEndLabel(booking) }}
      </p>
      <!-- 没填备注则不占一行 -->
      <p v-if="booking.remark">备注：{{ booking.remark }}</p>
      <div class="booking-detail-dialog-actions">
        <button type="button" class="booking-detail-dialog-ghost" @click="$emit('close')">关闭</button>
        <button
          type="button"
          class="booking-detail-dialog-danger"
          :disabled="cancelling"
          @click="$emit('cancel')"
        >
          {{ cancelling ? '取消中…' : '取消预约' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩：点空白关闭 */
.booking-detail-dialog {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.booking-detail-dialog-panel {
  width: 360px;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.booking-detail-dialog-panel h2 {
  margin: 0;
  font-size: 18px;
}

.booking-detail-dialog-panel p {
  margin: 0;
}

.booking-detail-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.booking-detail-dialog-actions button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.booking-detail-dialog-ghost {
  background: #e4e7eb;
  color: #1f2933;
}

.booking-detail-dialog-danger {
  background: #c81e1e;
  color: #fff;
}
</style>
