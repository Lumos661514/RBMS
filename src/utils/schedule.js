import {
  DAY_COUNT_DEFAULT,
  DAY_COUNT_MIN,
  END_HOUR,
  SLOT_MINUTES_DEFAULT,
  SLOT_MINUTES_MIN,
  SLOT_MINUTES_STEP,
  START_HOUR,
  WEEKDAY_LABELS,
} from '../config/schedule.js'

/** 两位补零。 */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 把「小时小数」或整点转成当天从 0 点起的分钟数，避免 0.1 浮点误差。
 * @param {number} hourFloat
 */
export function hourToMinutes(hourFloat) {
  return Math.round(Number(hourFloat) * 60)
}

/**
 * 分钟数转「小时小数」，供 startHour 字段存储（如 9.5 = 09:30）。
 * @param {number} minutes
 */
export function minutesToHour(minutes) {
  return minutes / 60
}

/**
 * 钟点文案：540 → 09:00。
 * @param {number} totalMinutes
 */
export function formatClockFromMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${pad2(h)}:${pad2(m)}`
}

/**
 * 小时小数转钟点文案：9.5 → 09:30。
 * @param {number} hourFloat
 */
export function formatClockFromHour(hourFloat) {
  return formatClockFromMinutes(hourToMinutes(hourFloat))
}

/**
 * 把时间段压到合法范围：≥30 且为 30 的倍数。
 * @param {number} [slotMinutes]
 */
export function normalizeSlotMinutes(slotMinutes) {
  const n = Number(slotMinutes)
  if (!Number.isInteger(n) || n < SLOT_MINUTES_MIN || n % SLOT_MINUTES_STEP !== 0) {
    return SLOT_MINUTES_DEFAULT
  }
  return n
}

/**
 * 按营业配置生成时段行；slotMinutes 决定一格多长。
 * @param {number} [startHour]
 * @param {number} [endHour]
 * @param {number} [slotMinutes]
 * @returns {{ startHour: number, startMinutes: number, label: string }[]}
 */
export function buildTimeRows(
  startHour = START_HOUR,
  endHour = END_HOUR,
  slotMinutes = SLOT_MINUTES_DEFAULT,
) {
  const slot = normalizeSlotMinutes(slotMinutes)
  const startMin = hourToMinutes(startHour)
  const endMin = hourToMinutes(endHour)
  const rows = []
  for (let m = startMin; m < endMin; m += slot) {
    rows.push({
      startHour: minutesToHour(m),
      startMinutes: m,
      label: `${formatClockFromMinutes(m)}-${formatClockFromMinutes(m + slot)}`,
    })
  }
  return rows
}

/**
 * 把列数压到合法范围：最少 7，非法值回退默认。
 * @param {number} [dayCount]
 */
export function normalizeDayCount(dayCount) {
  const n = Number(dayCount)
  if (!Number.isInteger(n) || n < DAY_COUNT_MIN) return DAY_COUNT_DEFAULT
  return n
}

/**
 * 表头用「月/日」，不带年份。
 * @param {Date} date
 */
export function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * 预约记录展示用「年/月/日」，如 2026/9/18（不补零）。
 * @param {Date} date
 */
export function formatYearMonthDay(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * 把存储用的 YYYY-MM-DD 转成展示用 2026/9/18；非法则原样返回。
 * @param {string} iso
 */
export function formatBookingDateDisplay(iso) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!matched) return iso || ''
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  return formatYearMonthDay(new Date(year, month - 1, day))
}

/**
 * 预约与查询用的日历日 YYYY-MM-DD。
 * @param {Date} date
 */
export function formatISODate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * 从今天起连续生成看板列；每列主标题为星期、副标题为月/日，列对齐。
 * @param {number} [dayCount]
 * @param {Date} [from]
 * @returns {{ date: string, weekday: number, label: string, dateLabel: string, isToday: boolean }[]}
 */
export function buildDayColumns(dayCount = DAY_COUNT_DEFAULT, from = new Date()) {
  const count = normalizeDayCount(dayCount)
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const columns = []
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(start)
    date.setDate(start.getDate() + offset)
    const weekday = date.getDay()
    const weekdayLabel = WEEKDAY_LABELS[weekday]
    columns.push({
      date: formatISODate(date),
      weekday,
      /** 统一用星期，避免首列「今日」导致与后列不对齐 */
      label: weekdayLabel,
      dateLabel: formatMonthDay(date),
      isToday: offset === 0,
    })
  }
  return columns
}

/**
 * 格子是否落在某条预约的占用区间 [start, start+duration) 内。
 * @param {{ date: string, startHour: number, durationHours: number }} booking
 * @param {string} date YYYY-MM-DD
 * @param {number} startHour
 */
export function bookingCoversCell(booking, date, startHour) {
  if (booking.date !== date) return false
  const cell = hourToMinutes(startHour)
  const begin = hourToMinutes(booking.startHour)
  const end = begin + hourToMinutes(booking.durationHours)
  return cell >= begin && cell < end
}

/** 开约前多少分钟起，普通用户不可取消。 */
export const CANCEL_LOCK_MINUTES = 30

/**
 * 是否仍占看板格子（已结束的只留记录、不占格）。
 * @param {{ status?: string }} booking
 */
export function isActiveBooking(booking) {
  return booking.status !== 'done'
}

/**
 * 预约开始时刻：支持半点（如 9.5 → 09:30）。
 * @param {string} date YYYY-MM-DD
 * @param {number} startHour
 * @returns {Date | null}
 */
export function bookingStartAt(date, startHour) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''))
  if (!matched) return null
  const totalMin = hourToMinutes(startHour)
  return new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Math.floor(totalMin / 60),
    totalMin % 60,
    0,
    0,
  )
}

/**
 * 当前时间是否已到达或超过该时段开始（过点不可再约、看板应清空占用）。
 * @param {string} date
 * @param {number} startHour
 * @param {Date} [now]
 */
export function isSlotStartedOrPast(date, startHour, now = new Date()) {
  const start = bookingStartAt(date, startHour)
  if (!start) return true
  return now.getTime() >= start.getTime()
}

/**
 * 普通用户是否还能取消：须早于开始前 30 分钟。
 * @param {{ date: string, startHour: number }} booking
 * @param {Date} [now]
 */
export function canUserCancelBooking(booking, now = new Date()) {
  const start = bookingStartAt(booking.date, booking.startHour)
  if (!start) return false
  return now.getTime() < start.getTime() - CANCEL_LOCK_MINUTES * 60 * 1000
}

/**
 * 预约结束时刻。时长无效时返回 null，调用方再退回开始时刻。
 * @param {string} date YYYY-MM-DD
 * @param {number} startHour
 * @param {number} durationHours
 * @returns {Date | null}
 */
export function bookingEndAt(date, startHour, durationHours) {
  const start = bookingStartAt(date, startHour)
  if (!start) return null
  const durationMin = hourToMinutes(durationHours)
  if (!Number.isFinite(durationMin) || durationMin < 0) return null
  return new Date(start.getTime() + durationMin * 60 * 1000)
}

/**
 * 服务是否已经结束。结束时刻起不再占格子；没有合法时长时按开始时刻算。
 * @param {{ date: string, startHour: number, durationHours?: number }} booking
 * @param {Date} [now]
 */
export function isBookingFinished(booking, now = new Date()) {
  const end = bookingEndAt(booking.date, booking.startHour, booking.durationHours)
  if (!end) return isSlotStartedOrPast(booking.date, booking.startHour, now)
  return now.getTime() >= end.getTime()
}

/**
 * 服务结束才标为 done，看板在结束前仍占用。尚未结束却已被标成 done 的改回进行中。
 * @param {object[]} bookings
 * @param {Date} [now]
 * @returns {{ bookings: object[], changed: boolean }}
 */
export function settleExpiredBookings(bookings, now = new Date()) {
  let changed = false
  const next = (bookings || []).map((item) => {
    const finished = isBookingFinished(item, now)
    if (finished && item.status !== 'done') {
      changed = true
      return { ...item, status: 'done' }
    }
    if (!finished && item.status === 'done') {
      changed = true
      return { ...item, status: 'active' }
    }
    if (!item.status) return { ...item, status: 'active' }
    return item
  })
  return { bookings: next, changed }
}

/**
 * 某格是否已被任意「进行中」预约占用（旧逻辑，单容量时用）。
 * @param {Array<{ date: string, startHour: number, durationHours: number, status?: string }>} bookings
 * @param {string} date
 * @param {number} startHour
 */
export function isCellOccupied(bookings, date, startHour) {
  return bookings.some(
    (booking) => isActiveBooking(booking) && bookingCoversCell(booking, date, startHour),
  )
}

/**
 * 命中该格的全部进行中预约。
 * @param {Array<{ date: string, startHour: number, durationHours: number, status?: string }>} bookings
 * @param {string} date
 * @param {number} startHour
 */
export function findBookingsAtCell(bookings, date, startHour) {
  return (bookings || []).filter(
    (booking) => isActiveBooking(booking) && bookingCoversCell(booking, date, startHour),
  )
}

/**
 * 命中该格的第一条进行中预约。
 * @param {Array<{ date: string, startHour: number, durationHours: number, status?: string }>} bookings
 * @param {string} date
 * @param {number} startHour
 */
export function findBookingAtCell(bookings, date, startHour) {
  return findBookingsAtCell(bookings, date, startHour)[0] || null
}

/**
 * 该格已占用的员工 id 列表。
 * @param {object[]} bookings
 * @param {string} date
 * @param {number} startHour
 */
export function busyEmployeeIdsAtCell(bookings, date, startHour) {
  const ids = findBookingsAtCell(bookings, date, startHour)
    .map((item) => item.employeeId)
    .filter(Boolean)
  return [...new Set(ids)]
}

/**
 * 时刻甲是否早于时刻乙。日期不同先比日期，同一天再比分钟。
 * @param {string} dateA
 * @param {number} minutesA
 * @param {string} dateB
 * @param {number} minutesB
 */
function isBeforeLeaveInstant(dateA, minutesA, dateB, minutesB) {
  if (dateA !== dateB) return dateA < dateB
  return minutesA < minutesB
}

/**
 * 两段请假是否相交。都是左闭右开，结束日可以晚于开始日。
 * @param {{ date?: string, endDate?: string, startMinutes?: number, endMinutes?: number }} left
 * @param {{ date?: string, endDate?: string, startMinutes?: number, endMinutes?: number }} right
 */
export function leaveRangesOverlap(left, right) {
  const leftStart = String(left?.date || '').slice(0, 10)
  const leftEnd = String(left?.endDate || left?.date || '').slice(0, 10)
  const rightStart = String(right?.date || '').slice(0, 10)
  const rightEnd = String(right?.endDate || right?.date || '').slice(0, 10)
  const leftFrom = Number(left?.startMinutes)
  const leftTo = Number(left?.endMinutes)
  const rightFrom = Number(right?.startMinutes)
  const rightTo = Number(right?.endMinutes)
  if (![leftFrom, leftTo, rightFrom, rightTo].every(Number.isFinite)) return false
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false
  return (
    isBeforeLeaveInstant(leftStart, leftFrom, rightEnd, rightTo) &&
    isBeforeLeaveInstant(rightStart, rightFrom, leftEnd, leftTo)
  )
}

/**
 * 一条请假是否与某天的 [startMinutes, endMinutes) 重叠。可跨天。
 * @param {{ date?: string, endDate?: string, startMinutes?: number, endMinutes?: number }} leave
 * @param {string} date YYYY-MM-DD
 * @param {number} startMinutes
 * @param {number} endMinutes
 */
export function leaveOverlapsRange(leave, date, startMinutes, endMinutes) {
  return leaveRangesOverlap(leave, {
    date,
    endDate: date,
    startMinutes,
    endMinutes,
  })
}

/**
 * 请假是否压到该员工尚未结束的预约上。已经结束的不挡请假。
 * @param {{ date?: string, endDate?: string, startMinutes?: number, endMinutes?: number }} leave
 * @param {object[]} bookings
 * @param {string} employeeId
 * @param {Date} [now]
 */
export function leaveOverlapsBooking(leave, bookings, employeeId, now = new Date()) {
  if (!employeeId) return false
  return (bookings || []).some((item) => {
    if (item.employeeId !== employeeId || isBookingFinished(item, now)) return false
    const day = String(item.date || '').slice(0, 10)
    const start = hourToMinutes(item.startHour)
    const end = start + hourToMinutes(item.durationHours)
    if (!day || !Number.isFinite(end)) return false
    return leaveOverlapsRange(leave, day, start, end)
  })
}

/**
 * 员工在该时间段是否请假（下拉不可选、该格不计入容量）。
 * @param {Array<{ employeeId?: string, date: string, startMinutes: number, endMinutes: number }>} leaves
 * @param {string} employeeId
 * @param {string} date YYYY-MM-DD
 * @param {number} startMinutes
 * @param {number} endMinutes
 */
export function isEmployeeOnLeave(leaves, employeeId, date, startMinutes, endMinutes) {
  if (!employeeId || !date) return false
  return (leaves || []).some((item) => {
    if (item.employeeId && item.employeeId !== employeeId) return false
    return leaveOverlapsRange(item, date, startMinutes, endMinutes)
  })
}

/**
 * 与该时段重叠的请假，用来标「请假」。
 * @param {Array<{ employeeId?: string, date: string, startMinutes: number, endMinutes: number }>} leaves
 * @param {string} employeeId
 * @param {string} date
 * @param {number} startMinutes
 * @param {number} endMinutes
 * @returns {{ date: string, startMinutes: number, endMinutes: number } | null}
 */
export function findEmployeeLeaveDuring(leaves, employeeId, date, startMinutes, endMinutes) {
  return (
    (leaves || []).find((item) => {
      if (item.employeeId && item.employeeId !== employeeId) return false
      return leaveOverlapsRange(item, date, startMinutes, endMinutes)
    }) || null
  )
}

/**
 * 该格可上班员工：排除与格子重叠的请假。
 * @param {Array<{ id: string, leaves?: object[] }>} employees
 * @param {string} date
 * @param {number} startHour
 * @param {number} [slotMinutes]
 */
export function workingEmployeesAt(employees, date, startHour, slotMinutes = SLOT_MINUTES_DEFAULT) {
  const slot = normalizeSlotMinutes(slotMinutes)
  const start = hourToMinutes(startHour)
  return (employees || []).filter(
    (emp) => !isEmployeeOnLeave(emp.leaves, emp.id, date, start, start + slot),
  )
}

/**
 * 此刻状态：请假优先于在忙，否则空闲。服务未结束且当前时刻落在预约时长内为在忙。
 * @param {{ id: string, leaves?: object[] }} employee
 * @param {Array<{ employeeId?: string, date?: string, startHour: number, durationHours: number, status?: string }>} bookings
 * @param {Date} [now]
 * @returns {'leave' | 'busy' | 'free'}
 */
export function employeePresence(employee, bookings, now = new Date()) {
  const date = formatISODate(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (isEmployeeOnLeave(employee?.leaves, employee?.id, date, minutes, minutes + 1)) return 'leave'
  const busy = (bookings || []).some((item) => {
    if (!employee || item.employeeId !== employee.id || isBookingFinished(item, now)) return false
    const day = String(item.date || '').slice(0, 10)
    if (day !== date) return false
    const start = hourToMinutes(item.startHour)
    const end = start + hourToMinutes(item.durationHours)
    return minutes >= start && minutes < end
  })
  return busy ? 'busy' : 'free'
}

/**
 * 看板一天的占用率：各格进行中预约人次 / 各格可上班人数之和。
 * @param {object[]} bookings
 * @param {string} date
 * @param {Array<{ startHour: number }>} timeRows
 * @param {Array<{ id: string, leaves?: object[] }>} employees
 * @param {number} [slotMinutes]
 */
export function dayOccupancyRate(bookings, date, timeRows, employees, slotMinutes = SLOT_MINUTES_DEFAULT) {
  const rows = timeRows || []
  if (!rows.length) return 0
  let used = 0
  let capacity = 0
  for (const row of rows) {
    capacity += workingEmployeesAt(employees, date, row.startHour, slotMinutes).length
    used += findBookingsAtCell(bookings, date, row.startHour).length
  }
  if (!capacity) return 0
  return used / capacity
}

/**
 * 按项目汇总营收（含已结束，取消已删不计入）。未到开始时刻的不结算。
 * @param {object[]} bookings
 * @param {Date} [now]
 * @returns {{ name: string, total: number }[]}
 */
export function revenueByService(bookings, now = new Date()) {
  const map = new Map()
  for (const item of bookings || []) {
    const start = bookingStartAt(item.date, item.startHour)
    if (!start || now.getTime() < start.getTime()) continue
    const name = item.serviceName || item.serviceId || '未命名'
    const price = Number(item.price)
    map.set(name, (map.get(name) || 0) + (Number.isFinite(price) ? price : 0))
  }
  return [...map.entries()].map(([name, total]) => ({ name, total }))
}

/**
 * 员工在给定日期里可上班格子的占用比例。请假重叠的格子不计入容量。
 * @param {object[]} bookings
 * @param {Array<{ id: string, name: string, leaves?: object[] }>} employees
 * @param {string[]} dates
 * @param {Array<{ startHour: number }>} timeRows
 * @param {number} [slotMinutes]
 * @returns {{ id: string, name: string, used: number, capacity: number, rate: number }[]}
 */
export function employeeFillRates(
  bookings,
  employees,
  dates,
  timeRows,
  slotMinutes = SLOT_MINUTES_DEFAULT,
) {
  const rows = timeRows || []
  const slot = normalizeSlotMinutes(slotMinutes)
  return (employees || []).map((emp) => {
    let capacity = 0
    let used = 0
    for (const date of dates || []) {
      for (const row of rows) {
        const start = hourToMinutes(row.startHour)
        if (isEmployeeOnLeave(emp.leaves, emp.id, date, start, start + slot)) continue
        capacity += 1
        const hit = findBookingsAtCell(bookings, date, row.startHour).some(
          (item) => item.employeeId === emp.id,
        )
        if (hit) used += 1
      }
    }
    return {
      id: emp.id,
      name: emp.name,
      used,
      capacity,
      rate: capacity ? used / capacity : 0,
    }
  })
}

/**
 * 时间段是否已约满：传入的员工列表在该格都已有预约。
 * 看板应传入当天可上班员工，而不是全部员工。
 * @param {object[]} bookings
 * @param {string} date
 * @param {number} startHour
 * @param {Array<{ id: string }>} employees
 */
export function isSlotFullyBooked(bookings, date, startHour, employees) {
  const list = employees || []
  if (!list.length) return true
  const busy = new Set(busyEmployeeIdsAtCell(bookings, date, startHour))
  const orphanCount = findBookingsAtCell(bookings, date, startHour).filter(
    (item) => !item.employeeId,
  ).length
  return busy.size + orphanCount >= list.length
}

/**
 * 员工在 [start, start+duration) 内是否已有预约。
 * @param {object[]} bookings
 * @param {string} employeeId
 * @param {string} date
 * @param {number} startHour
 * @param {number} durationHours
 * @param {number} [slotMinutes]
 */
export function isEmployeeBusyInRange(
  bookings,
  employeeId,
  date,
  startHour,
  durationHours,
  slotMinutes = SLOT_MINUTES_DEFAULT,
) {
  const slot = normalizeSlotMinutes(slotMinutes)
  const slotHours = slot / 60
  for (let hour = startHour; hour < startHour + durationHours - 1e-9; hour += slotHours) {
    const hit = findBookingsAtCell(bookings, date, hour).some(
      (item) => item.employeeId === employeeId,
    )
    if (hit) return true
  }
  return false
}

/**
 * 用户在 [start, start+duration) 内是否已有预约（一人同时段只能约一名员工）。
 * @param {object[]} bookings
 * @param {string} userId
 * @param {string} date
 * @param {number} startHour
 * @param {number} durationHours
 * @param {number} [slotMinutes]
 */
export function isUserBusyInRange(
  bookings,
  userId,
  date,
  startHour,
  durationHours,
  slotMinutes = SLOT_MINUTES_DEFAULT,
) {
  if (!userId) return false
  const slot = normalizeSlotMinutes(slotMinutes)
  const slotHours = slot / 60
  for (let hour = startHour; hour < startHour + durationHours - 1e-9; hour += slotHours) {
    const hit = findBookingsAtCell(bookings, date, hour).some((item) => item.userId === userId)
    if (hit) return true
  }
  return false
}

/**
 * 项目时长须能放进当前时间格：不短于一格，且是格长的整数倍。
 * @param {number} durationHours
 * @param {number} [slotMinutes]
 * @returns {{ ok: boolean, message?: string }}
 */
export function durationFitsSlot(durationHours, slotMinutes = SLOT_MINUTES_DEFAULT) {
  const slot = normalizeSlotMinutes(slotMinutes)
  const durationMinutes = hourToMinutes(durationHours)
  if (durationMinutes < slot || durationMinutes % slot !== 0) {
    return { ok: false, message: `服务时长须为时间段（${slot} 分钟）的整数倍` }
  }
  return { ok: true }
}

/**
 * 创建前：未过点、员工可接该项目且时段空闲、用户未在同时段重复约、时长对齐时间段。
 * @param {object[]} bookings
 * @param {string} date
 * @param {number} startHour
 * @param {number} durationHours
 * @param {number} [endHour]
 * @param {number} [slotMinutes]
 * @param {Date} [now]
 * @param {{ id: string, serviceIds?: string[], leaves?: object[] } | null} [employee]
 * @param {string} [serviceId]
 * @param {string} [userId]
 * @param {Array<{ employeeId?: string, date: string, startMinutes: number, endMinutes: number }>} [leaves]
 * @returns {{ ok: boolean, message?: string }}
 */
export function canCreateBooking(
  bookings,
  date,
  startHour,
  durationHours,
  endHour = END_HOUR,
  slotMinutes = SLOT_MINUTES_DEFAULT,
  now = new Date(),
  employee = null,
  serviceId = '',
  userId = '',
  leaves = [],
) {
  const slot = normalizeSlotMinutes(slotMinutes)
  if (isSlotStartedOrPast(date, startHour, now)) {
    return { ok: false, message: '该时段已过，无法预约' }
  }
  if (startHour + durationHours > endHour) {
    return { ok: false, message: '超出当天营业时间' }
  }
  const fit = durationFitsSlot(durationHours, slot)
  if (!fit.ok) return fit
  if (!employee) {
    return { ok: false, message: '请选择员工' }
  }
  const offLeaves = (employee.leaves && employee.leaves.length ? employee.leaves : leaves) || []
  const startMinutes = hourToMinutes(startHour)
  if (
    isEmployeeOnLeave(
      offLeaves,
      employee.id,
      date,
      startMinutes,
      startMinutes + hourToMinutes(durationHours),
    )
  ) {
    return { ok: false, message: '该员工该时段请假，不可预约' }
  }
  if (!(employee.serviceIds || []).includes(serviceId)) {
    return { ok: false, message: '该员工无法承接此项目' }
  }
  if (isEmployeeBusyInRange(bookings, employee.id, date, startHour, durationHours, slot)) {
    return { ok: false, message: '该员工此时段已被预约' }
  }
  if (userId && isUserBusyInRange(bookings, userId, date, startHour, durationHours, slot)) {
    return { ok: false, message: '该用户此时段已有预约' }
  }
  return { ok: true }
}
