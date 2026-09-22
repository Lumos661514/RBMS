import request from './request.js'

/**
 * 拉预约列表。管理员为全部；顾客为自己的单。
 * @param {string} [_rangeStart] 保留参数，便于以后按日起筛
 */
export function getBookings(_rangeStart) {
  return request.get('/bookings', { params: { rangeStart: _rangeStart } })
}

/**
 * 进行中占用格：只有员工和时段，没有预约人资料。
 * @param {{ from?: string, to?: string }} [range]
 */
export function getOccupancy(range = {}) {
  return request.get('/occupancy', { params: range })
}

/**
 * 创建预约；须指定服务与员工。管理员须传 userId 代约普通用户。
 * @param {{ date: string, startHour: number, serviceId: string, employeeId: string, remark?: string, userId?: string }} payload
 */
export function createBooking(payload) {
  return request.post('/bookings', payload)
}

/**
 * 取消一条预约，占用格释放。
 * @param {string} id
 */
export function cancelBooking(id) {
  return request.post(`/bookings/${id}/cancel`)
}
