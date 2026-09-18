<script setup>
import { WEEKDAY_LABELS } from '@/config/schedule'
import { canUserCancelBooking, formatBookingDateDisplay, formatClockFromHour } from '@/utils/schedule'

const props = defineProps({
  /** 当前格内、当前角色可见的预约列表 */
  bookings: { type: Array, required: true },
  /** 正在取消的预约 id；空表示无进行中取消 */
  cancellingId: { type: String, default: '' },
  /** 当前登录角色：管理员可看手机号并取消任意单 */
  role: { type: String, default: '' },
  /** 当前登录用户 id；普通用户只能取消自己的 */
  userId: { type: String, default: '' },
  /** 格未满且未过点时，可从详情继续新建预约 */
  canContinue: { type: Boolean, default: false },
})

defineEmits(['close', 'cancel', 'continue'])

/**
 * 展示起止时刻，结束点 = 开始 + 耗时。
 * @param {{ startHour: number, durationHours: number }} booking
 */
function bookingEndLabel(booking) {
  return `${formatClockFromHour(booking.startHour)}–${formatClockFromHour(booking.startHour + booking.durationHours)}`
}

/**
 * 详情时间行：星期 + 带年份日期。
 * @param {string} date
 */
function bookingDateLabel(date) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!matched) return formatBookingDateDisplay(date)
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const weekday = new Date(year, month - 1, day).getDay()
  return `${WEEKDAY_LABELS[weekday]} ${formatBookingDateDisplay(date)}`
}

/**
 * 管理员任意可取消；用户仅能取消自己的，且须早于开约前 30 分钟。
 * @param {object} booking
 */
function canCancel(booking) {
  if (!booking) return false
  if (props.role === 'admin') return true
  if (booking.userId !== props.userId) return false
  return canUserCancelBooking(booking)
}
</script>

<template>
  <div class="booking-detail-dialog" @click.self="$emit('close')">
    <div class="booking-detail-dialog-panel" role="dialog">
      <h2>预约详情</h2>
      <p class="booking-detail-dialog-meta">
        {{ bookingDateLabel(bookings[0]?.date) }}
        · 共 {{ bookings.length }} 条
      </p>

      <!-- 每条独立一块，取消按钮跟在条目内，避免被挤出视口 -->
      <ul class="booking-detail-dialog-list">
        <li v-for="item in bookings" :key="item.id" class="booking-detail-dialog-item">
          <p>服务：{{ item.serviceName }}</p>
          <p v-if="item.employeeName">员工：{{ item.employeeName }}</p>
          <p>预约人：{{ item.contactName }}</p>
          <!-- 管理员代约场景会写入手机号，便于核对用户 -->
          <p v-if="role === 'admin' && item.contactPhone">手机：{{ item.contactPhone }}</p>
          <p>时间：{{ bookingEndLabel(item) }}</p>
          <p v-if="item.remark">备注：{{ item.remark }}</p>
          <div class="booking-detail-dialog-item-actions">
            <button
              v-if="canCancel(item)"
              type="button"
              class="booking-detail-dialog-danger"
              :disabled="cancellingId === item.id"
              @click="$emit('cancel', item.id)"
            >
              {{ cancellingId === item.id ? '取消中…' : '取消预约' }}
            </button>
          </div>
        </li>
      </ul>

      <div class="booking-detail-dialog-actions">
        <button type="button" class="booking-detail-dialog-ghost" @click="$emit('close')">关闭</button>
        <!-- 未满时可继续约：管理员代约 / 用户自约 -->
        <button
          v-if="canContinue"
          type="button"
          class="booking-detail-dialog-primary"
          @click="$emit('continue')"
        >
          继续预约
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
  padding: 16px;
  box-sizing: border-box;
}

.booking-detail-dialog-panel {
  width: 400px;
  max-width: 100%;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

.booking-detail-dialog-panel h2 {
  margin: 0;
  font-size: 18px;
}

.booking-detail-dialog-meta {
  margin: 0;
  font-size: 13px;
  color: #616e7c;
}

.booking-detail-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.booking-detail-dialog-item {
  margin: 0;
  padding: 12px;
  border: 1px solid #e4e7eb;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.booking-detail-dialog-item p {
  margin: 0;
  font-size: 13px;
}

.booking-detail-dialog-item-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.booking-detail-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.booking-detail-dialog-actions button,
.booking-detail-dialog-item-actions button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.booking-detail-dialog-ghost {
  background: #e4e7eb;
  color: #1f2933;
}

.booking-detail-dialog-primary {
  background: #1f4e79;
  color: #fff;
}

.booking-detail-dialog-danger {
  background: #c81e1e;
  color: #fff;
}
</style>
