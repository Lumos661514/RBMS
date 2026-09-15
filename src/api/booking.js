import request from './request.js'

/**
 * 拉本周预约列表，用来给看板涂占用格。
 * @param {string} weekStart 本周一 YYYY-MM-DD
 */
export function getBookings(weekStart) {
  return request.get('/bookings', { params: { weekStart } })
}

/**
 * 创建预约；服务耗时由 Mock 按 serviceId 计算。
 * @param {{ weekday: number, startHour: number, serviceId: string, contactName: string, remark?: string }} payload
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
