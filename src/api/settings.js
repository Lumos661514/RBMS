import request from './request.js'

/**
 * 当前营业时段与工作日，看板按此画表。
 */
export function getSettings() {
  return request.get('/settings')
}

/**
 * 仅管理员可改开始/结束整点与营业日。
 * @param {{ startHour: number, endHour: number, weekDays: number[] }} payload
 */
export function updateSettings(payload) {
  return request.put('/settings', payload)
}
