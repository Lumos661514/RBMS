/** 登录态存在 localStorage 的键。单独成模块，路由守卫不必带上 axios。 */

export const TOKEN_KEY = 'booking_token'
export const NAME_KEY = 'booking_name'
export const ROLE_KEY = 'booking_role'
export const USER_ID_KEY = 'booking_user_id'

/**
 * 登录成功后写入本地，供守卫、顶栏、看板取消权限使用。
 * @param {{ token: string, name: string, role: string, userId: string }} data
 */
export function saveSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(NAME_KEY, data.name)
  localStorage.setItem(ROLE_KEY, data.role)
  localStorage.setItem(USER_ID_KEY, data.userId)
}

/** 退出或 401 时清掉四份登录字段。 */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(NAME_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(USER_ID_KEY)
}
