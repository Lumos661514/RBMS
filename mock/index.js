import { canCreateBooking } from '../src/utils/schedule.js'
import { getServiceById } from '../src/config/services.js'

const DEMO_TOKEN = 'mock-token-admin'
const DEMO_PHONE = '13800000000'
const DEMO_PASSWORD = '123456'

/** 进程内预约表；刷新 dev server 会回到下面两条示例 */
let bookings = [
  {
    id: 'b1',
    weekday: 1,
    startHour: 9,
    serviceId: 's1',
    serviceName: '服务1',
    durationHours: 1,
    contactName: '张三',
    remark: '示例：占 1 小时',
  },
  {
    id: 'b2',
    weekday: 3,
    startHour: 14,
    serviceId: 's2',
    serviceName: '服务2',
    durationHours: 2,
    contactName: '李四',
    remark: '示例：连占 14:00–16:00',
  },
]

/**
 * Mock 只认演示 token，无头或错 token 一律当未登录。
 * @param {Record<string, string> | undefined} headers
 */
function hasToken(headers) {
  const raw = headers?.authorization || headers?.Authorization || ''
  return String(raw).includes(DEMO_TOKEN)
}

export default [
  {
    url: '/api/login',
    method: 'post',
    response: ({ body }) => {
      const payload = typeof body === 'string' ? JSON.parse(body) : body || {}
      if (payload.phone === DEMO_PHONE && payload.password === DEMO_PASSWORD) {
        return {
          code: 0,
          message: 'ok',
          data: { token: DEMO_TOKEN, name: '管理员' },
        }
      }
      return { code: 1, message: '手机号或密码错误', data: null }
    },
  },
  {
    url: '/api/bookings',
    method: 'get',
    response: ({ headers }) => {
      if (!hasToken(headers)) {
        return { code: 401, message: '未登录', data: null }
      }
      // weekStart 仅标识当前周，第一版内存里就是这一张表
      return { code: 0, message: 'ok', data: { list: bookings } }
    },
  },
  {
    url: '/api/bookings',
    method: 'post',
    response: ({ body, headers }) => {
      if (!hasToken(headers)) {
        return { code: 401, message: '未登录', data: null }
      }
      const payload = typeof body === 'string' ? JSON.parse(body) : body || {}
      const service = getServiceById(payload.serviceId)
      if (!service) {
        return { code: 1, message: '服务不存在', data: null }
      }
      const check = canCreateBooking(
        bookings,
        payload.weekday,
        payload.startHour,
        service.durationHours,
      )
      if (!check.ok) {
        return { code: 1, message: check.message, data: null }
      }
      const created = {
        id: `b-${Date.now()}`,
        weekday: payload.weekday,
        startHour: payload.startHour,
        serviceId: service.id,
        serviceName: service.name,
        durationHours: service.durationHours,
        contactName: payload.contactName,
        remark: payload.remark || '',
      }
      bookings = bookings.concat(created)
      return { code: 0, message: 'ok', data: created }
    },
  },
  {
    url: '/api/bookings/:id/cancel',
    method: 'post',
    response: ({ url, headers }) => {
      if (!hasToken(headers)) {
        return { code: 401, message: '未登录', data: null }
      }
      const id = String(url).match(/\/api\/bookings\/([^/]+)\/cancel/)?.[1]
      const exists = bookings.some((item) => item.id === id)
      if (!exists) {
        return { code: 1, message: '预约不存在', data: null }
      }
      bookings = bookings.filter((item) => item.id !== id)
      return { code: 0, message: 'ok', data: { id } }
    },
  },
]
