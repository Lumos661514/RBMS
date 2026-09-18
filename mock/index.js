import {
  canCreateBooking,
  canUserCancelBooking,
  formatBookingDateDisplay,
  normalizeDayCount,
  normalizeSlotMinutes,
  settleExpiredBookings,
} from '../src/utils/schedule.js'
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
 * 按 userId 筛预约，给用户管理详情用；补齐旧单缺失的消费金额。
 * @param {object} store
 * @param {string} userId
 */
function bookingsOfUser(store, userId) {
  return (store.bookings || [])
    .filter((item) => item.userId === userId)
    .map((item) => {
      if (item.price != null && Number.isFinite(Number(item.price))) return item
      const service = findService(store, item.serviceId)
      return { ...item, price: service ? service.price : 0 }
    })
}

/**
 * 读库并把已到点的预约标为 done 写回，保证看板与记录一致。
 */
function loadSettledStore() {
  const store = readStore()
  const settled = settleExpiredBookings(store.bookings)
  if (settled.changed) {
    store.bookings = settled.bookings
    writeStore(store)
  }
  return store
}

/**
 * 按 id 取服务；旧数据无 services 时返回 null。
 * @param {object} store
 * @param {string} id
 */
function findService(store, id) {
  return (store.services || []).find((item) => item.id === id) || null
}

/**
 * 按 id 取员工。
 * @param {object} store
 * @param {string} id
 */
function findEmployee(store, id) {
  return (store.employees || []).find((item) => item.id === id) || null
}

/**
 * 校验员工表单：姓名 + 至少一个项目。
 * @param {object} payload
 * @param {object[]} services
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
function parseEmployeePayload(payload, services) {
  const name = String(payload.name || '').trim()
  const serviceIds = Array.isArray(payload.serviceIds)
    ? payload.serviceIds.map(String)
    : []
  if (!name) return { ok: false, message: '请填写员工姓名' }
  if (!serviceIds.length) return { ok: false, message: '请至少选择一个可做项目' }
  const validIds = new Set((services || []).map((item) => item.id))
  if (serviceIds.some((id) => !validIds.has(id))) {
    return { ok: false, message: '所选项目无效' }
  }
  return { ok: true, data: { name, serviceIds } }
}

/**
 * 校验并整理服务表单字段。
 * @param {object} payload
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
function parseServicePayload(payload) {
  const name = String(payload.name || '').trim()
  const description = String(payload.description || '').trim()
  const price = Number(payload.price)
  const durationHours = Number(payload.durationHours)
  if (!name) return { ok: false, message: '请填写服务名称' }
  if (!Number.isFinite(price) || price < 0) return { ok: false, message: '价格须为非负数字' }
  // 时长按小时存，允许 0.5 起，且须为 0.5 的倍数（对齐 30 分钟格）
  if (!Number.isFinite(durationHours) || durationHours < 0.5 || Math.round(durationHours * 2) !== durationHours * 2) {
    return { ok: false, message: '服务时长须为至少 0.5 小时，且为 0.5 的倍数' }
  }
  if (!description) return { ok: false, message: '请填写简单介绍' }
  return {
    ok: true,
    data: { name, price, durationHours, description },
  }
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
      const settings = readStore().settings
      const slotMinutes = normalizeSlotMinutes(
        settings.slotMinutes ?? (settings.slotHours != null ? settings.slotHours * 60 : 60),
      )
      return ok({
        startHour: settings.startHour,
        endHour: settings.endHour,
        dayCount: normalizeDayCount(settings.dayCount ?? 7),
        slotMinutes,
      })
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
      const dayCount = normalizeDayCount(payload.dayCount)
      const rawSlot = Number(payload.slotMinutes)
      if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour >= endHour) {
        return fail('开始时间必须早于结束时间')
      }
      if (Number(payload.dayCount) < 7) return fail('看板列数至少为 7')
      if (!Number.isInteger(rawSlot) || rawSlot < 30 || rawSlot % 30 !== 0) {
        return fail('时间段须为至少 30 分钟，且为 30 的倍数')
      }
      const slotMinutes = normalizeSlotMinutes(rawSlot)
      const store = readStore()
      store.settings = {
        startHour,
        endHour,
        dayCount,
        slotMinutes,
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
      const store = loadSettledStore()
      return ok({ list: store.bookings })
    },
  },
  {
    url: '/api/bookings',
    method: 'post',
    response: ({ body, headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      const payload = parseBody(body)
      const store = loadSettledStore()
      const service = findService(store, payload.serviceId)
      if (!service) return fail('服务不存在')
      const employee = findEmployee(store, payload.employeeId)
      if (!employee) return fail('请选择员工')
      // 管理员只能代约普通用户；普通用户只能约自己
      let targetUser = me
      if (me.role === 'admin') {
        const targetId = String(payload.userId || '').trim()
        if (!targetId) return fail('请选择预约用户')
        if (targetId === me.id) return fail('管理员不能为自己预约')
        const found = store.users.find((item) => item.id === targetId)
        if (!found || found.builtin || found.role === 'admin') {
          return fail('预约用户无效')
        }
        targetUser = found
      }
      const date = String(payload.date || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('预约日期无效')
      const slotMinutes = normalizeSlotMinutes(
        store.settings.slotMinutes ??
          (store.settings.slotHours != null ? store.settings.slotHours * 60 : 60),
      )
      const check = canCreateBooking(
        store.bookings,
        date,
        payload.startHour,
        service.durationHours,
        store.settings.endHour,
        slotMinutes,
        new Date(),
        employee,
        service.id,
        targetUser.id,
      )
      if (!check.ok) return fail(check.message)
      const created = {
        id: `b-${Date.now()}`,
        date,
        /** 列表展示用带年份日期，如 2026/9/18 */
        dateDisplay: formatBookingDateDisplay(date),
        startHour: payload.startHour,
        serviceId: service.id,
        serviceName: service.name,
        durationHours: service.durationHours,
        employeeId: employee.id,
        employeeName: employee.name,
        userId: targetUser.id,
        contactName: targetUser.name,
        contactPhone: targetUser.phone,
        /** 下单时锁定服务价格，作为本次消费 */
        price: service.price,
        remark: payload.remark || '',
        /** active 占看板；到点后改为 done 保留记录 */
        status: 'active',
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
      const store = loadSettledStore()
      const booking = store.bookings.find((item) => item.id === id)
      if (!booking) return fail('预约不存在')
      if (booking.status === 'done') return fail('预约已结束，无法取消')
      // 普通用户只能取消自己的单；管理员可取消任意单
      if (me.role !== 'admin' && booking.userId !== me.id) return fail('没有权限')
      // 开约前 30 分钟内普通用户不可取消；管理员不受限
      if (me.role !== 'admin' && !canUserCancelBooking(booking)) {
        return fail('开约前 30 分钟内无法取消预约')
      }
      store.bookings = store.bookings.filter((item) => item.id !== id)
      writeStore(store)
      return ok({ id })
    },
  },
  {
    url: '/api/employees',
    method: 'get',
    response: ({ headers }) => {
      if (!currentUser(headers)) return unauthorized()
      return ok({ list: readStore().employees || [] })
    },
  },
  {
    url: '/api/employees',
    method: 'post',
    response: ({ body, headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const store = readStore()
      const parsed = parseEmployeePayload(parseBody(body), store.services || [])
      if (!parsed.ok) return fail(parsed.message)
      if (!Array.isArray(store.employees)) store.employees = []
      const created = {
        id: `e-${Date.now()}`,
        ...parsed.data,
      }
      store.employees.push(created)
      writeStore(store)
      return ok(created)
    },
  },
  {
    url: '/api/employees/:id',
    method: 'put',
    response: ({ body, headers, url }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const id = String(url).match(/\/api\/employees\/([^/?]+)/)?.[1]
      const store = readStore()
      const target = findEmployee(store, id)
      if (!target) return fail('员工不存在')
      const parsed = parseEmployeePayload(parseBody(body), store.services || [])
      if (!parsed.ok) return fail(parsed.message)
      Object.assign(target, parsed.data)
      writeStore(store)
      return ok(target)
    },
  },
  {
    url: '/api/services',
    method: 'get',
    response: ({ headers }) => {
      if (!currentUser(headers)) return unauthorized()
      return ok({ list: readStore().services || [] })
    },
  },
  {
    url: '/api/services',
    method: 'post',
    response: ({ body, headers }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const parsed = parseServicePayload(parseBody(body))
      if (!parsed.ok) return fail(parsed.message)
      const store = readStore()
      if (!Array.isArray(store.services)) store.services = []
      const created = {
        id: `s-${Date.now()}`,
        ...parsed.data,
      }
      store.services.push(created)
      writeStore(store)
      return ok(created)
    },
  },
  {
    url: '/api/services/:id',
    method: 'put',
    response: ({ body, headers, url }) => {
      const me = currentUser(headers)
      if (!me) return unauthorized()
      if (me.role !== 'admin') return fail('没有权限')
      const id = String(url).match(/\/api\/services\/([^/?]+)/)?.[1]
      const store = readStore()
      const target = findService(store, id)
      if (!target) return fail('服务不存在')
      const parsed = parseServicePayload(parseBody(body))
      if (!parsed.ok) return fail(parsed.message)
      Object.assign(target, parsed.data)
      writeStore(store)
      return ok(target)
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
      const store = loadSettledStore()
      const target = store.users.find((item) => item.id === id)
      if (!target || target.builtin) return fail('用户不存在')
      if (me.role !== 'admin' && me.id !== target.id) return fail('没有权限')
      return ok({
        user: publicUser(target),
        bookings: bookingsOfUser(store, target.id),
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
