import axios from 'axios'

/** 登录态存在 localStorage 的键，和守卫、登录页共用。 */
export const TOKEN_KEY = 'booking_token'
export const NAME_KEY = 'booking_name'

/** 业务码/HTTP 401 时清登录态；已在登录页则不再跳，避免死循环。 */
function clearAuthAndGoLogin() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(NAME_KEY)
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

const service = axios.create({
  baseURL: '/api',
  timeout: 8000,
})

service.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  // 登录后所有业务请求带上 token，Mock 用它判断是否已登录
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

service.interceptors.response.use(
  (response) => {
    const payload = response.data
    // Mock 用业务码 401 表示登录失效，清 token 并回登录页
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
