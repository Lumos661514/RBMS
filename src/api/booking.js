import request from './request.js'

/**
 * 拉预约列表，用来给看板涂占用格。
 * @param {string} [_rangeStart] 保留参数位，Mock 目前返回全部
 */
export function getBookings(_rangeStart) {
  return request.get('/bookings', { params: { rangeStart: _rangeStart } })
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
