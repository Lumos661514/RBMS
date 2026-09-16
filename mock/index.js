import { canCreateBooking } from '../src/utils/schedule.js'
import { getServiceById } from '../src/config/services.js'
import { publicUser, readStore, tokenForUser, writeStore } from './store.js'

/**
 * 从 Authorization 头解析当前用户；无效则 null。
 * @param {Record<string, string> | undefined} headers
 */
function currentUser(headers) {
  const raw = headers?.authorization || headers?.Authorization || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token.startsWith('tok-')) return null
  const userId = token.slice(4)
  const store = readStore()
  return store.users.find((item) => item.id === userId) || null
}

function unauthorized() {
  return { code: 401, message: '未登录', data: null }
}

function fail(message) {
  return { code: 1, message, data: null }
}

function ok(data) {
  return { code: 0, message: 'ok', data }
}

function parseBody(body) {
  return typeof body === 'string' ? JSON.parse(body) : body || {}
}

/**
 * 按 userId 筛预约，给用户管理详情用。
 * @param {object[]} bookings
 * @param {string} userId
 */
function bookingsOfUser(bookings, userId) {
  return bookings.filter((item) => item.userId === userId)
}

export default [
  {
    url: '/api/login',
    method: 'post',
    response: ({ body }) => {
      const payload = parseBody(body)
      const store = readStore()
      const user = store.users.find(
        (item) => item.phone === payload.phone && item.password === payload.password,
      )
      if (!user) return fail('手机号或密码错误')
      return ok({
        token: tokenForUser(user.id),
        name: user.name,
        role: user.role,
        userId: user.id,
      })
    },
  },
  {
    url: '/api/register',
    method: 'post',
    response: ({ body }) => {
      const payload = parseBody(body)
      const phone = String(payload.phone || '').trim()
      const password = String(payload.password || '')
      const name = String(payload.name || '').trim()
      if (!phone || !password || !name) return fail('请填写手机号、姓名和密码')
      const store = readStore()
      if (store.users.some((item) => item.phone === phone)) return fail('该手机号已注册')
      const user = {
        id: `u-${Date.now()}`,
        phone,
        password,
        name,
        role: 'user',
        builtin: false,
      }
      store.users.push(user)
      writeStore(store)
      return ok({ id: user.id })
    },
  },
  {
    url: '/api/settings',
    method: 'get',
    response: ({ headers }) => {
      if (!currentUser(headers)) return unauthorized()
      return ok(readStore().settings)
    },
  },
  {
    url: '/api/settings',
    method: 'put',
    response: ({ body, headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const payload = parseBody(body)
      const startHour = Number(payload.startHour)
      const endHour = Number(payload.endHour)
      const weekDays = Array.isArray(payload.weekDays) ? payload.weekDays.map(Number) : []
      if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour >= endHour) {
        return fail('开始时间必须早于结束时间')
      }
      if (!weekDays.length) return fail('至少选择一个营业日')
      const store = readStore()
      store.settings = {
        slotHours: store.settings.slotHours,
        startHour,
        endHour,
        weekDays,
      }
      writeStore(store)
      return ok(store.settings)
    },
  },
  {
    url: '/api/bookings',
    method: 'get',
    response: ({ headers }) => {
      if (!currentUser(headers)) return unauthorized()
      return ok({ list: readStore().bookings })
    },
  },
  {
    url: '/api/bookings',
    method: 'post',
    response: ({ body, headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      const payload = parseBody(body)
      const service = getServiceById(payload.serviceId)
      if (!service) return fail('服务不存在')
      const store = readStore()
      const check = canCreateBooking(
        store.bookings,
        payload.weekday,
        payload.startHour,
        service.durationHours,
        store.settings.endHour,
        store.settings.slotHours,
      )
      if (!check.ok) return fail(check.message)
      const created = {
        id: `b-${Date.now()}`,
        weekday: payload.weekday,
        startHour: payload.startHour,
        serviceId: service.id,
        serviceName: service.name,
        durationHours: service.durationHours,
        userId: me.id,
        contactName: me.name,
        remark: payload.remark || '',
      }
      store.bookings.push(created)
      writeStore(store)
      return ok(created)
    },
  },
  {
    url: '/api/bookings/:id/cancel',
    method: 'post',
    response: ({ url, headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      const id = String(url).match(/\/api\/bookings\/([^/]+)\/cancel/)?.[1]
      const store = readStore()
      const booking = store.bookings.find((item) => item.id === id)
      if (!booking) return fail('预约不存在')
      // 普通用户只能取消自己的单；管理员可取消任意单
      if (me.role !== 'admin' && booking.userId !== me.id) return fail('没有权限')
      store.bookings = store.bookings.filter((item) => item.id !== id)
      writeStore(store)
      return ok({ id })
    },
  },
  {
    url: '/api/users',
    method: 'get',
    response: ({ headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const list = readStore()
        .users.filter((item) => !item.builtin)
        .map(publicUser)
      return ok({ list })
    },
  },
  {
    url: '/api/users/:id/password',
    method: 'put',
    response: ({ body, headers, url }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      const id = String(url).match(/\/api\/users\/([^/]+)\/password/)?.[1]
      const store = readStore()
      const target = store.users.find((item) => item.id === id)
      if (!target || target.builtin) return fail('用户不存在')
      if (me.role !== 'admin' && me.id !== target.id) return fail('没有权限')
      const password = String(parseBody(body).password || '')
      if (!password) return fail('请填写新密码')
      target.password = password
      writeStore(store)
      return ok({ id: target.id })
    },
  },
  {
    url: '/api/users/:id',
    method: 'get',
    response: ({ headers, url }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      const id = String(url).match(/\/api\/users\/([^/?]+)/)?.[1]
      const store = readStore()
      const target = store.users.find((item) => item.id === id)
      if (!target || target.builtin) return fail('用户不存在')
      if (me.role !== 'admin' && me.id !== target.id) return fail('没有权限')
      return ok({
        user: publicUser(target),
        bookings: bookingsOfUser(store.bookings, target.id),
      })
    },
  },
  {
    url: '/api/users/:id',
    method: 'delete',
    response: ({ headers, url }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const id = String(url).match(/\/api\/users\/([^/?]+)/)?.[1]
      const store = readStore()
      const target = store.users.find((item) => item.id === id)
      if (!target || target.builtin) return fail('用户不存在')
      store.users = store.users.filter((item) => item.id !== id)
      writeStore(store)
      return ok({ id })
    },
  },
]
