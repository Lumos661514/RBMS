import request from './request.js'

/**
 * 拉取员工列表（含可做项目）。
 */
export function getEmployees() {
  return request.get('/employees')
}

/**
 * 新增员工；仅管理员。
 * @param {{ name: string, serviceIds: string[], leaves?: object[] }} payload
 */
export function createEmployee(payload) {
  return request.post('/employees', payload)
}

/**
 * 修改员工姓名、可做项目与请假时段；仅管理员。
 * @param {string} id
 * @param {{ name: string, serviceIds: string[], leaves?: object[] }} payload
 */
export function updateEmployee(id, payload) {
  return request.put(`/employees/${id}`, payload)
}
