import request from './request.js'

/**
 * 拉取全部服务（项目介绍、预约下拉、项目管理共用）。
 */
export function getServices() {
  return request.get('/services')
}

/**
 * 新增服务；仅管理员。
 * @param {{ name: string, price: number, durationHours: number, description: string }} payload
 */
export function createService(payload) {
  return request.post('/services', payload)
}

/**
 * 修改服务名称、价格、时长、简介；仅管理员。
 * @param {string} id
 * @param {{ name: string, price: number, durationHours: number, description: string }} payload
 */
export function updateService(id, payload) {
  return request.put(`/services/${id}`, payload)
}

/**
 * 删除服务；仅管理员。已有预约记录保留名称快照。
 * @param {string} id
 */
export function deleteService(id) {
  return request.delete(`/services/${id}`)
}
