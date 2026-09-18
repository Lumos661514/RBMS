import request from './request.js'

/**
 * 当前营业时段与看板列数，看板按此画表。
 */
export function getSettings() {
  return request.get('/settings')
}

/**
 * 仅管理员可改开始/结束整点、时间段与看板列数。
 * @param {{ startHour: number, endHour: number, dayCount: number, slotMinutes: number }} payload
 */
export function updateSettings(payload) {
  return request.put('/settings', payload)
}
