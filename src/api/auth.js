import request from './request.js'

/**
 * 手机号密码登录，管理员和普通用户走同一接口。
 * @param {{ phone: string, password: string }} payload
 */
export function login(payload) {
  return request.post('/login', payload)
}

/**
 * 注册普通用户，成功后需再登录。
 * @param {{ phone: string, password: string, name: string }} payload
 */
export function register(payload) {
  return request.post('/register', payload)
}
