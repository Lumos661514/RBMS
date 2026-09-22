import { describe, expect, it } from 'vitest'
import {
  canCreateBooking,
  canUserCancelBooking,
  dayOccupancyRate,
  employeeFillRates,
  employeePresence,
  isEmployeeOnLeave,
  isSlotFullyBooked,
  leaveOverlapsBooking,
  normalizeDayCount,
  normalizeSlotMinutes,
  revenueByService,
  settleExpiredBookings,
  workingEmployeesAt,
} from './schedule.js'

/** 固定在营业开始前，避免用「现在」导致用例偶发失败。 */
const date = '2099-06-01'
const morning = new Date('2099-06-01T08:00:00')
const employee = { id: 'e1', serviceIds: ['s1'] }

describe('canCreateBooking', () => {
  it('空闲时段且员工可接该项目时通过', () => {
    const result = canCreateBooking([], date, 9, 1, 18, 60, morning, employee, 's1', 'u1')
    expect(result.ok).toBe(true)
  })

  it('已到开始时刻不可再约', () => {
    const now = new Date('2099-06-01T09:00:00')
    const result = canCreateBooking([], date, 9, 1, 18, 60, now, employee, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/已过/)
  })

  it('超出当天营业结束时刻不可约', () => {
    const result = canCreateBooking([], date, 17, 2, 18, 60, morning, employee, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/营业时间/)
  })

  it('时长不是时间格整数倍时拒绝', () => {
    const result = canCreateBooking([], date, 9, 0.5, 18, 60, morning, employee, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/整数倍/)
  })

  it('员工未勾选该项目时拒绝', () => {
    const other = { id: 'e1', serviceIds: ['s2'] }
    const result = canCreateBooking([], date, 9, 1, 18, 60, morning, other, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/无法承接/)
  })

  it('员工该时段已有预约时拒绝', () => {
    const bookings = [
      {
        date,
        startHour: 9,
        durationHours: 1,
        employeeId: 'e1',
        userId: 'u2',
        status: 'active',
      },
    ]
    const result = canCreateBooking(bookings, date, 9, 1, 18, 60, morning, employee, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/已被预约/)
  })

  it('员工请假时段与预约重叠时不可约', () => {
    const off = {
      id: 'e1',
      serviceIds: ['s1'],
      leaves: [{ date, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
    }
    const result = canCreateBooking([], date, 9, 1, 18, 60, morning, off, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/请假/)
  })

  it('请假不覆盖该预约时段时仍可约', () => {
    const off = {
      id: 'e1',
      serviceIds: ['s1'],
      leaves: [{ date, startMinutes: 11 * 60, endMinutes: 12 * 60 }],
    }
    const result = canCreateBooking([], date, 9, 1, 18, 60, morning, off, 's1', 'u1')
    expect(result.ok).toBe(true)
  })

  it('同一用户同时段已有预约时拒绝', () => {
    const bookings = [
      {
        date,
        startHour: 9,
        durationHours: 1,
        employeeId: 'e2',
        userId: 'u1',
        status: 'active',
      },
    ]
    const result = canCreateBooking(bookings, date, 9, 1, 18, 60, morning, employee, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/已有预约/)
  })

  it('尚未结束的跨格预约挡住后面的开始时刻', () => {
    const bookings = [
      { date, startHour: 9, durationHours: 2, employeeId: 'e1', status: 'active', userId: 'u2' },
    ]
    const now = new Date('2099-06-01T09:30:00')
    const result = canCreateBooking(bookings, date, 10, 1, 18, 60, now, employee, 's1', 'u1')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/已被预约/)
  })
})

describe('settleExpiredBookings', () => {
  it('服务未结束前保持进行中', () => {
    const now = new Date('2099-06-01T09:30:00')
    const { bookings, changed } = settleExpiredBookings(
      [{ id: 'b1', date, startHour: 9, durationHours: 2, status: 'active' }],
      now,
    )
    expect(changed).toBe(false)
    expect(bookings[0].status).toBe('active')
  })

  it('服务结束才改为已结束', () => {
    const now = new Date('2099-06-01T11:00:00')
    const { bookings, changed } = settleExpiredBookings(
      [{ id: 'b1', date, startHour: 9, durationHours: 2, status: 'active' }],
      now,
    )
    expect(changed).toBe(true)
    expect(bookings[0].status).toBe('done')
  })

  it('未到结束却被标成已结束的改回进行中', () => {
    const now = new Date('2099-06-01T09:30:00')
    const { bookings, changed } = settleExpiredBookings(
      [{ id: 'b1', date, startHour: 9, durationHours: 2, status: 'done' }],
      now,
    )
    expect(changed).toBe(true)
    expect(bookings[0].status).toBe('active')
  })

  it('未到点的预约保持进行中', () => {
    const { bookings, changed } = settleExpiredBookings(
      [{ id: 'b1', date, startHour: 10, durationHours: 1, status: 'active' }],
      morning,
    )
    expect(changed).toBe(false)
    expect(bookings[0].status).toBe('active')
  })
})

describe('canUserCancelBooking', () => {
  it('开约前超过 30 分钟可以取消', () => {
    const now = new Date('2099-06-01T09:29:00')
    expect(canUserCancelBooking({ date, startHour: 10 }, now)).toBe(true)
  })

  it('开约前 30 分钟内不可取消', () => {
    const now = new Date('2099-06-01T09:30:00')
    expect(canUserCancelBooking({ date, startHour: 10 }, now)).toBe(false)
  })
})

describe('isSlotFullyBooked', () => {
  it('全部员工该格都有预约则约满', () => {
    const employees = [{ id: 'e1' }, { id: 'e2' }]
    const bookings = [
      { date, startHour: 9, durationHours: 1, employeeId: 'e1', status: 'active' },
      { date, startHour: 9, durationHours: 1, employeeId: 'e2', status: 'active' },
    ]
    expect(isSlotFullyBooked(bookings, date, 9, employees)).toBe(true)
  })

  it('仍有空闲员工则未约满', () => {
    const employees = [{ id: 'e1' }, { id: 'e2' }]
    const bookings = [
      { date, startHour: 9, durationHours: 1, employeeId: 'e1', status: 'active' },
    ]
    expect(isSlotFullyBooked(bookings, date, 9, employees)).toBe(false)
  })
})

describe('workingEmployeesAt', () => {
  it('只排除与该格重叠的请假', () => {
    const employees = [
      { id: 'e1', leaves: [{ date, startMinutes: 9 * 60, endMinutes: 10 * 60 }] },
      { id: 'e2', leaves: [] },
    ]
    expect(isEmployeeOnLeave(employees[0].leaves, 'e1', date, 9 * 60, 10 * 60)).toBe(true)
    expect(workingEmployeesAt(employees, date, 9, 60).map((item) => item.id)).toEqual(['e2'])
    expect(workingEmployeesAt(employees, date, 10, 60).map((item) => item.id)).toEqual(['e1', 'e2'])
  })

  it('跨天请假挡住中间格子，结束时刻那格不算', () => {
    const employees = [
      {
        id: 'e1',
        leaves: [{ date, endDate: '2099-06-02', startMinutes: 15 * 60, endMinutes: 10 * 60 }],
      },
    ]
    expect(workingEmployeesAt(employees, date, 14, 60).map((item) => item.id)).toEqual(['e1'])
    expect(workingEmployeesAt(employees, date, 15, 60)).toEqual([])
    expect(workingEmployeesAt(employees, '2099-06-02', 9, 60)).toEqual([])
    expect(workingEmployeesAt(employees, '2099-06-02', 10, 60).map((item) => item.id)).toEqual(['e1'])
  })
})

describe('employeePresence', () => {
  const now = new Date('2099-06-01T09:30:00')

  it('请假优先于在忙，否则看是否有进行中预约', () => {
    const onLeave = {
      id: 'e1',
      leaves: [{ date, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
    }
    const bookings = [
      { employeeId: 'e1', date, startHour: 9, durationHours: 1, status: 'active' },
    ]
    expect(employeePresence(onLeave, bookings, now)).toBe('leave')
    expect(employeePresence({ id: 'e1', leaves: [] }, bookings, now)).toBe('busy')
    expect(employeePresence({ id: 'e1', leaves: [] }, [], now)).toBe('free')
  })

  it('服务未结束时即使已被标成已结束也算在忙', () => {
    const bookings = [
      { employeeId: 'e1', date, startHour: 9, durationHours: 1, status: 'done' },
    ]
    expect(employeePresence({ id: 'e1', leaves: [] }, bookings, now)).toBe('busy')
  })
})

describe('occupancy and revenue', () => {
  it('按可上班人数算占用率', () => {
    const rows = [{ startHour: 9 }, { startHour: 10 }]
    const bookings = [
      { date, startHour: 9, durationHours: 1, employeeId: 'e1', status: 'active' },
    ]
    expect(dayOccupancyRate(bookings, date, rows, [{ id: 'e1' }, { id: 'e2' }], 60)).toBe(0.25)
  })

  it('已到开始时刻才按项目汇总营收', () => {
    const rows = revenueByService(
      [
        { serviceName: '服务1', price: 100, date, startHour: 9 },
        { serviceName: '服务1', price: 50, date, startHour: 10 },
        { serviceName: '服务2', price: 80, date: '2099-06-02', startHour: 9 },
      ],
      new Date('2099-06-01T10:30:00'),
    )
    expect(rows).toEqual([{ name: '服务1', total: 150 }])
  })

  it('已结束的预约不挡请假，未结束的挡住', () => {
    const now = new Date('2099-06-01T10:30:00')
    const bookings = [
      { employeeId: 'e1', date, startHour: 9, durationHours: 1, status: 'active' },
      { employeeId: 'e1', date, startHour: 14, durationHours: 1, status: 'active' },
    ]
    const pastLeave = { date, endDate: date, startMinutes: 9 * 60, endMinutes: 10 * 60 }
    const futureLeave = { date, endDate: date, startMinutes: 14 * 60, endMinutes: 15 * 60 }
    expect(leaveOverlapsBooking(pastLeave, bookings, 'e1', now)).toBe(false)
    expect(leaveOverlapsBooking(futureLeave, bookings, 'e1', now)).toBe(true)
  })

  it('请假重叠的格子不计入员工容量', () => {
    const employees = [
      {
        id: 'e1',
        name: '甲',
        leaves: [{ date, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
      },
    ]
    const rates = employeeFillRates(
      [],
      employees,
      [date],
      [{ startHour: 9 }, { startHour: 10 }],
      60,
    )
    expect(rates[0].capacity).toBe(1)
    expect(rates[0].rate).toBe(0)
  })
})

describe('normalize', () => {
  it('非法时间格回退默认 60 分钟', () => {
    expect(normalizeSlotMinutes(45)).toBe(60)
    expect(normalizeSlotMinutes(30)).toBe(30)
  })

  it('看板列数少于 7 回退默认', () => {
    expect(normalizeDayCount(3)).toBe(7)
    expect(normalizeDayCount(10)).toBe(10)
  })
})
