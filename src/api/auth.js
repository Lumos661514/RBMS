import request from './request.js'

/**
 * 管理员登录。
 * @param {{ phone: string, password: string }} payload
 */
export function login(payload) {
  return request.post('/login', payload)
}
