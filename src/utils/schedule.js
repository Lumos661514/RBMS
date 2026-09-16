import {
  END_HOUR,
  SLOT_HOURS,
  START_HOUR,
  WEEK_DAYS,
  WEEKDAY_LABELS,
} from '../config/schedule.js'

/** 时段标签用两位小时，如 9 → 09。 */
function padHour(hour) {
  return String(hour).padStart(2, '0')
}

/**
 * 按营业配置生成时段行，避免模板写死行数。
 * @param {number} [startHour]
 * @param {number} [endHour]
 * @param {number} [slotHours]
 * @returns {{ startHour: number, label: string }[]}
 */
export function buildTimeRows(startHour = START_HOUR, endHour = END_HOUR, slotHours = SLOT_HOURS) {
  const rows = []
  for (let hour = startHour; hour < endHour; hour += slotHours) {
    rows.push({
      startHour: hour,
      label: `${padHour(hour)}:00-${padHour(hour + slotHours)}:00`,
    })
  }
  return rows
}

/**
 * 按营业日生成星期列（列数随配置变，不是写死 7 列）。
 * @param {number[]} [weekDays]
 * @returns {{ weekday: number, label: string }[]}
 */
export function buildWeekColumns(weekDays = WEEK_DAYS) {
  return weekDays.map((weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
  }))
}

/**
 * 取本周一 0 点，给表头日期和 weekStart 查询用。
 * @param {Date} [from]
 */
export function getMonday(from = new Date()) {
  const date = new Date(from)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * 周一 + 星期偏移得到该列的日历日。周日按周一往后 6 天。
 * @param {Date} monday
 * @param {number} weekday
 */
export function dateForWeekday(monday, weekday) {
  const offset = weekday === 0 ? 6 : weekday - 1
  const date = new Date(monday)
  date.setDate(monday.getDate() + offset)
  return date
}

/**
 * 表头用「月/日」，不带年份。
 * @param {Date} date
 */
export function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * 给 GET /api/bookings 的 weekStart 查询用。
 * @param {Date} date
 */
export function formatISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 格子是否落在某条预约的占用区间 [start, start+duration) 内。
 * @param {{ weekday: number, startHour: number, durationHours: number }} booking
 * @param {number} weekday
 * @param {number} startHour
 */
export function bookingCoversCell(booking, weekday, startHour) {
  return (
    booking.weekday === weekday &&
    startHour >= booking.startHour &&
    startHour < booking.startHour + booking.durationHours
  )
}

/**
 * 某格是否已被任意预约占用。
 * @param {Array<{ weekday: number, startHour: number, durationHours: number }>} bookings
 * @param {number} weekday
 * @param {number} startHour
 */
export function isCellOccupied(bookings, weekday, startHour) {
  return bookings.some((booking) => bookingCoversCell(booking, weekday, startHour))
}

/**
 * 命中该格的那一条预约（连占多格时返回同一单）。
 * @param {Array<{ weekday: number, startHour: number, durationHours: number }>} bookings
 * @param {number} weekday
 * @param {number} startHour
 */
export function findBookingAtCell(bookings, weekday, startHour) {
  return bookings.find((booking) => bookingCoversCell(booking, weekday, startHour)) || null
}

/**
 * 创建前：连续格都空闲，且结束点不超过当天营业结束。
 * @param {Array<{ weekday: number, startHour: number, durationHours: number }>} bookings
 * @param {number} weekday
 * @param {number} startHour
 * @param {number} durationHours
 * @param {number} [endHour] 当天营业结束整点（不含）
 * @param {number} [slotHours] 一格对应的小时数
 * @returns {{ ok: boolean, message?: string }}
 */
export function canCreateBooking(
  bookings,
  weekday,
  startHour,
  durationHours,
  endHour = END_HOUR,
  slotHours = SLOT_HOURS,
) {
  if (startHour + durationHours > endHour) {
    return { ok: false, message: '超出当天营业时间' }
  }
  for (let hour = startHour; hour < startHour + durationHours; hour += slotHours) {
    if (isCellOccupied(bookings, weekday, hour)) {
      return { ok: false, message: '该时段已被预约' }
    }
  }
  return { ok: true }
}
