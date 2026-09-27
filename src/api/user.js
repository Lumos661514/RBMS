import request from './request.js'

/**
 * 管理员拉取普通用户列表（不含内置管理员）。
 */
export function getUsers() {
  return request.get('/users')
}

/**
 * 用户详情及名下预约；管理员看任意普通用户，用户只能看自己。
 * @param {string} id
 */
export function getUserDetail(id) {
  return request.get(`/users/${id}`)
}

/**
 * 修改密码。
 * 管理员重置普通用户只传新密码；顾客改自己的还要带原密码和确认密码。
 * @param {string} id
 * @param {string} password
 * @param {{ oldPassword?: string, confirmPassword?: string }} [extra]
 */
export function updateUserPassword(id, password, extra) {
  return request.put(`/users/${id}/password`, { password, ...extra })
}

/**
 * 删除普通用户账号，不级联删除其预约。
 * @param {string} id
 */
export function deleteUser(id) {
  return request.delete(`/users/${id}`)
}
