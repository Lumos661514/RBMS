import axios from 'axios'

/** 登录态存在 localStorage 的键，和守卫、登录页共用。 */
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

/**
 * 已发起跳转的标志位：并发请求同时 401 时只跳一次。
 * 不需要复位——assign 会整页重载，模块状态随之重建。
 */
let redirectingToLogin = false

/** 业务码/HTTP 401 时清登录态；已在登录页或已在跳转则不再跳，避免死循环与重复跳转。 */
function clearAuthAndGoLogin() {
  clearSession()
  if (redirectingToLogin || window.location.pathname === '/login') return
  redirectingToLogin = true
  window.location.assign('/login')
}

const service = axios.create({
  /** 开发走 Vite 代理；上线可设 VITE_API_BASE 指向 Express */
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 8000,
})

service.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  // 登录后所有业务请求带上 token，后端用它判断是否已登录
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

service.interceptors.response.use(
  (response) => {
    const payload = response.data
    // 业务码 401 表示登录失效，清 token 并回登录页
    if (payload.code === 401) {
      clearAuthAndGoLogin()
      return Promise.reject(new Error(payload.message || '未登录'))
    }
    if (payload.code !== 0) {
      return Promise.reject(new Error(payload.message || '请求失败'))
    }
    return payload.data
  },
  (error) => {
    if (error.response?.status === 401) {
      clearAuthAndGoLogin()
    }
    return Promise.reject(error)
  },
)

export default service
