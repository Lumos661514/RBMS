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
  <el-dialog
    title="预约详情"
    model-value
    width="420px"
    :close-on-click-modal="true"
    @close="$emit('close')"
  >
    <p class="booking-detail-dialog-meta">
      {{ bookingDateLabel(bookings[0]?.date) }}
      · 共 {{ bookings.length }} 条
    </p>

    <!-- 每条独立一块，取消按钮跟在条目内 -->
    <el-card v-for="item in bookings" :key="item.id" class="booking-detail-dialog-item" shadow="never">
      <p>服务：{{ item.serviceName }}</p>
      <p v-if="item.employeeName">员工：{{ item.employeeName }}</p>
      <p>预约人：{{ item.contactName }}</p>
      <!-- 管理员代约场景会写入手机号，便于核对用户 -->
      <p v-if="role === 'admin' && item.contactPhone">手机：{{ item.contactPhone }}</p>
      <p>时间：{{ bookingEndLabel(item) }}</p>
      <p v-if="item.remark">备注：{{ item.remark }}</p>
      <div v-if="canCancel(item)" class="booking-detail-dialog-item-actions">
        <el-button
          type="danger"
          size="small"
          :loading="cancellingId === item.id"
          @click="$emit('cancel', item.id)"
        >
          取消预约
        </el-button>
      </div>
    </el-card>

    <template #footer>
      <el-button @click="$emit('close')">关闭</el-button>
      <!-- 未满时可继续约：管理员代约 / 用户自约 -->
      <el-button v-if="canContinue" type="primary" @click="$emit('continue')">继续预约</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.booking-detail-dialog-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: #616e7c;
}

.booking-detail-dialog-item {
  margin-bottom: 10px;
}

.booking-detail-dialog-item p {
  margin: 0 0 4px;
  font-size: 13px;
}

.booking-detail-dialog-item-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>
