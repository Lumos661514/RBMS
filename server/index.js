import 'dotenv/config'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import express from 'express'
import {
  hashPassword,
  signToken,
  userIdFromToken,
  verifyPassword,
} from './auth.js'
import { pool, waitForDb } from './db.js'
import { initDatabase } from './init.js'
import {
  canCreateBooking,
  canUserCancelBooking,
  durationFitsSlot,
  formatBookingDateDisplay,
  formatClockFromMinutes,
  formatISODate,
  leaveOverlapsBooking,
  leaveRangesOverlap,
  normalizeDayCount,
  normalizeSlotMinutes,
  settleExpiredBookings,
} from '../src/utils/schedule.js'

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function ok(data) {
  return { code: 0, message: 'ok', data }
}

function fail(message) {
  return { code: 1, message, data: null }
}

function unauthorized() {
  return { code: 401, message: '未登录', data: null }
}

function publicUser(user) {
  return { id: user.id, phone: user.phone, name: user.name, role: user.role }
}

/**
 * 从 Bearer JWT 解析当前用户。
 * @param {import('express').Request} req
 */
async function currentUser(req) {
  const raw = req.headers.authorization || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  const userId = userIdFromToken(token)
  if (!userId) return null
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId])
  return rows[0] ? mapUser(rows[0]) : null
}

/**
 * @param {object} row
 */
function mapUser(row) {
  return {
    id: row.id,
    phone: row.phone,
    password: row.password,
    name: row.name,
    role: row.role,
    builtin: Boolean(row.builtin),
  }
}

/**
 * @param {object} row
 */
function mapBooking(row) {
  return {
    id: row.id,
    date: row.date,
    dateDisplay: row.date_display,
    startHour: Number(row.start_hour),
    serviceId: row.service_id,
    serviceName: row.service_name,
    durationHours: Number(row.duration_hours),
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    userId: row.user_id,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    price: Number(row.price),
    remark: row.remark,
    status: row.status,
  }
}

/**
 * @param {object} row
 */
function mapService(row) {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    durationHours: Number(row.duration_hours),
    description: row.description,
  }
}

/**
 * 到点的预约标为 done，看板不再占用。
 */
async function settleBookings() {
  const [rows] = await pool.query('SELECT * FROM bookings')
  const mapped = rows.map(mapBooking)
  const settled = settleExpiredBookings(mapped)
  if (!settled.changed) return mapped
  // 先按目标状态把要翻转的 id 归堆，每种状态一条 UPDATE，替掉逐条 UPDATE 的 N+1
  const idsByStatus = new Map()
  for (const item of settled.bookings) {
    const prev = mapped.find((row) => row.id === item.id)
    if (!prev || prev.status === item.status) continue
    if (!idsByStatus.has(item.status)) idsByStatus.set(item.status, [])
    idsByStatus.get(item.status).push(item.id)
  }
  if (!idsByStatus.size) return settled.bookings
  const conn = await pool.getConnection()
  try {
    // 同一次结算的状态翻转要整体生效，避免看板读到改了一半的状态
    await conn.beginTransaction()
    for (const [status, ids] of idsByStatus) {
      await conn.query('UPDATE bookings SET status = ? WHERE id IN (?)', [status, ids])
    }
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
  return settled.bookings
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} [date] 传入则只取该天。下单校验只看同一天的格子，没必要把历史预约全读进内存；
 *   请假冲突要跨天比对，所以不传时仍取全量。
 */
async function listBookings(conn = pool, date) {
  const [rows] = date
    ? await conn.query('SELECT * FROM bookings WHERE date = ?', [date])
    : await conn.query('SELECT * FROM bookings')
  return rows.map(mapBooking)
}

/**
 * @param {string} id
 * @param {import('mysql2/promise').PoolConnection} [conn]
 */
async function findService(id, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM services WHERE id = ?', [id])
  return rows[0] ? mapService(rows[0]) : null
}

/**
 * @param {object} row
 */
function mapLeave(row) {
  const raw = row.leave_date
  const endRaw = row.end_date || row.leave_date
  const date = raw instanceof Date ? formatISODate(raw) : String(raw).slice(0, 10)
  const endDate = endRaw instanceof Date ? formatISODate(endRaw) : String(endRaw).slice(0, 10)
  return {
    id: row.id,
    employeeId: row.employee_id,
    date,
    endDate,
    startMinutes: Number(row.start_minutes),
    endMinutes: Number(row.end_minutes),
  }
}

/**
 * @param {string} id
 * @param {import('mysql2/promise').PoolConnection} [conn]
 */
async function findEmployee(id, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM employees WHERE id = ?', [id])
  if (!rows[0]) return null
  const [links] = await conn.query(
    'SELECT service_id FROM employee_services WHERE employee_id = ?',
    [id],
  )
  const [leaveRows] = await conn.query('SELECT * FROM employee_leaves WHERE employee_id = ?', [id])
  return {
    id: rows[0].id,
    name: rows[0].name,
    serviceIds: links.map((item) => item.service_id),
    leaves: leaveRows.map(mapLeave),
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} [conn]
 */
async function listEmployees(conn = pool) {
  const [employees] = await conn.query('SELECT * FROM employees')
  const [links] = await conn.query('SELECT employee_id, service_id FROM employee_services')
  const [leaveRows] = await conn.query('SELECT * FROM employee_leaves')
  const byEmp = new Map()
  for (const item of links) {
    if (!byEmp.has(item.employee_id)) byEmp.set(item.employee_id, [])
    byEmp.get(item.employee_id).push(item.service_id)
  }
  const leavesByEmp = new Map()
  for (const item of leaveRows) {
    if (!leavesByEmp.has(item.employee_id)) leavesByEmp.set(item.employee_id, [])
    leavesByEmp.get(item.employee_id).push(mapLeave(item))
  }
  return employees.map((item) => ({
    id: item.id,
    name: item.name,
    serviceIds: byEmp.get(item.id) || [],
    leaves: leavesByEmp.get(item.id) || [],
  }))
}

/**
 * @param {object} payload
 * @param {object[]} services
 * @param {{ open: number, close: number }} windowMinutes 营业时间，分钟
 */
function parseEmployeePayload(payload, services, windowMinutes) {
  const name = String(payload.name || '').trim()
  const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds.map(String) : []
  if (!name) return { ok: false, message: '请填写员工姓名' }
  if (!serviceIds.length) return { ok: false, message: '请至少选择一个可做项目' }
  const validIds = new Set((services || []).map((item) => item.id))
  if (serviceIds.some((id) => !validIds.has(id))) {
    return { ok: false, message: '所选项目无效' }
  }
  const parsedLeaves = parseEmployeeLeaves(payload.leaves, windowMinutes)
  if (!parsedLeaves.ok) return parsedLeaves
  return { ok: true, data: { name, serviceIds, leaves: parsedLeaves.data } }
}

/**
 * 校验请假时段：起止都在营业时间内，结束必须晚于开始，时段之间不重叠。
 * @param {unknown} raw
 * @param {{ open: number, close: number }} windowMinutes
 */
function parseEmployeeLeaves(raw, windowMinutes) {
  if (raw == null) return { ok: true, data: [] }
  if (!Array.isArray(raw)) return { ok: false, message: '请假安排格式无效' }
  const open = windowMinutes.open
  const close = windowMinutes.close
  const leaves = []
  for (const item of raw) {
    const date = String(item?.date || '').trim()
    const endDate = String(item?.endDate || item?.date || '').trim()
    const startMinutes = Number(item?.startMinutes)
    const endMinutes = Number(item?.endMinutes)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { ok: false, message: '请假日期无效' }
    }
    if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes)) {
      return { ok: false, message: '请假时间无效' }
    }
    const endsAfter = endDate > date || (endDate === date && endMinutes > startMinutes)
    if (!endsAfter) return { ok: false, message: '结束时间必须晚于开始时间' }
    if (startMinutes < open || startMinutes >= close || endMinutes < open || endMinutes > close) {
      return {
        ok: false,
        message: `请假须在营业时间 ${formatClockFromMinutes(open)}–${formatClockFromMinutes(close)} 内`,
      }
    }
    const next = { date, endDate, startMinutes, endMinutes }
    if (leaves.some((prev) => leaveRangesOverlap(prev, next))) {
      return { ok: false, message: '请假时段不能重叠' }
    }
    leaves.push({
      id: String(item?.id || '').trim() || `el-${Date.now()}-${leaves.length}`,
      ...next,
    })
  }
  return { ok: true, data: leaves }
}

/**
 * 覆盖写入某员工的请假时段。
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} employeeId
 * @param {Array<{ id: string, date: string, endDate: string, startMinutes: number, endMinutes: number }>} leaves
 */
async function replaceEmployeeLeaves(conn, employeeId, leaves) {
  await conn.query('DELETE FROM employee_leaves WHERE employee_id = ?', [employeeId])
  for (const item of leaves) {
    await conn.query(
      'INSERT INTO employee_leaves (id, employee_id, leave_date, end_date, start_minutes, end_minutes) VALUES (?, ?, ?, ?, ?, ?)',
      [item.id, employeeId, item.date, item.endDate, item.startMinutes, item.endMinutes],
    )
  }
}

/**
 * 当前营业起止，用来限制请假时段。
 */
async function currentBusinessMinutes() {
  const [rows] = await pool.query('SELECT start_hour, end_hour FROM settings WHERE id = 1')
  const start = Number(rows[0]?.start_hour)
  const end = Number(rows[0]?.end_hour)
  return {
    open: (Number.isFinite(start) ? start : 9) * 60,
    close: (Number.isFinite(end) ? end : 18) * 60,
  }
}

/**
 * 当前营业时间格，保存项目时用来校验时长。
 */
async function currentSlotMinutes() {
  const [rows] = await pool.query('SELECT slot_minutes FROM settings WHERE id = 1')
  return normalizeSlotMinutes(rows[0]?.slot_minutes)
}

/**
 * @param {object} payload
 * @param {number} slotMinutes 当前时间格；时长须为其整数倍
 */
function parseServicePayload(payload, slotMinutes) {
  const name = String(payload.name || '').trim()
  const description = String(payload.description || '').trim()
  const price = Number(payload.price)
  const durationHours = Number(payload.durationHours)
  if (!name) return { ok: false, message: '请填写服务名称' }
  if (!Number.isFinite(price) || price < 0) return { ok: false, message: '价格须为非负数字' }
  if (!Number.isFinite(durationHours) || durationHours < 0.5 || Math.round(durationHours * 2) !== durationHours * 2) {
    return { ok: false, message: '服务时长须为至少 0.5 小时，且为 0.5 的倍数' }
  }
  const fit = durationFitsSlot(durationHours, slotMinutes)
  if (!fit.ok) return { ok: false, message: fit.message }
  if (!description) return { ok: false, message: '请填写简单介绍' }
  return { ok: true, data: { name, price, durationHours, description } }
}

/**
 * 登录接口以外都要带 token。
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function requireAuth(req, res, next) {
  try {
    const me = await currentUser(req)
    if (!me) {
      res.json(unauthorized())
      return
    }
    req.user = me
    next()
  } catch (error) {
    next(error)
  }
}

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/login', async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || '').trim()
    const password = String(req.body?.password || '')
    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone])
    const row = rows[0]
    if (!row || !(await verifyPassword(password, row.password))) {
      res.json(fail('手机号或密码错误'))
      return
    }
    const user = mapUser(row)
    res.json(
      ok({
        token: signToken(user.id),
        name: user.name,
        role: user.role,
        userId: user.id,
      }),
    )
  } catch (error) {
    next(error)
  }
})

/** 演示站注册时间戳，用来挡住脚本连续注册 */
const registerHits = []

app.post('/api/register', async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || '').trim()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    if (!phone || !password || !name) {
      res.json(fail('请填写手机号、姓名和密码'))
      return
    }
    // 公开注册会被脚本灌入随机姓名；手机号和姓名先做基本格式限制
    if (!/^1\d{10}$/.test(phone) || name.length > 8) {
      res.json(fail('请填写 11 位手机号和不超过 8 个字的姓名'))
      return
    }
    const now = Date.now()
    while (registerHits.length && now - registerHits[0] > 60 * 60 * 1000) registerHits.shift()
    if (registerHits.length >= 5) {
      res.json(fail('注册过于频繁，请稍后再试'))
      return
    }
    // 先占名额再写库。校验在哈希之前，并发请求不能同时穿过次数检查
    registerHits.push(now)
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone])
    if (exists.length) {
      res.json(fail('该手机号已注册'))
      return
    }
    const id = `u-${Date.now()}`
    const hashed = await hashPassword(password)
    await pool.query(
      'INSERT INTO users (id, phone, password, name, role, builtin) VALUES (?, ?, ?, ?, ?, 0)',
      [id, phone, hashed, name, 'user'],
    )
    res.json(ok({ id }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/settings', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings WHERE id = 1')
    const settings = rows[0] || { start_hour: 9, end_hour: 18, day_count: 7, slot_minutes: 60 }
    const slotMinutes = normalizeSlotMinutes(settings.slot_minutes)
    res.json(
      ok({
        startHour: settings.start_hour,
        endHour: settings.end_hour,
        dayCount: normalizeDayCount(settings.day_count ?? 7),
        slotMinutes,
      }),
    )
  } catch (error) {
    next(error)
  }
})

app.put('/api/settings', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const startHour = Number(req.body?.startHour)
    const endHour = Number(req.body?.endHour)
    const dayCount = normalizeDayCount(req.body?.dayCount)
    const rawSlot = Number(req.body?.slotMinutes)
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour >= endHour) {
      res.json(fail('开始时间必须早于结束时间'))
      return
    }
    if (Number(req.body?.dayCount) < 7) {
      res.json(fail('看板列数至少为 7'))
      return
    }
    if (!Number.isInteger(rawSlot) || rawSlot < 30 || rawSlot % 30 !== 0) {
      res.json(fail('时间段须为至少 30 分钟，且为 30 的倍数'))
      return
    }
    const slotMinutes = normalizeSlotMinutes(rawSlot)
    await pool.query(
      'UPDATE settings SET start_hour = ?, end_hour = ?, day_count = ?, slot_minutes = ? WHERE id = 1',
      [startHour, endHour, dayCount, slotMinutes],
    )
    res.json(ok({ startHour, endHour, dayCount, slotMinutes }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/bookings', requireAuth, async (req, res, next) => {
  try {
    const list = await settleBookings()
    // 管理员看全部；顾客只拿自己的单，别人的姓名手机不随列表出去
    if (req.user.role === 'admin') {
      res.json(ok({ list }))
      return
    }
    res.json(ok({ list: list.filter((item) => item.userId === req.user.id) }))
  } catch (error) {
    next(error)
  }
})

/**
 * 进行中占用：只给员工与时段，不含预约人。顾客端算空位用。
 */
app.get('/api/occupancy', requireAuth, async (req, res, next) => {
  try {
    const list = await settleBookings()
    const from = String(req.query.from || '').slice(0, 10)
    const to = String(req.query.to || '').slice(0, 10)
    const blocks = list
      .filter((item) => item.status === 'active')
      .map((item) => ({
        employeeId: item.employeeId,
        date:
          item.date instanceof Date ? formatISODate(item.date) : String(item.date).slice(0, 10),
        startHour: Number(item.startHour),
        durationHours: Number(item.durationHours),
      }))
      .filter((item) => {
        if (from && item.date < from) return false
        if (to && item.date > to) return false
        return true
      })
    res.json(ok({ list: blocks }))
  } catch (error) {
    next(error)
  }
})

/** 下单事务因死锁被牺牲后的最大重试次数。 */
const BOOKING_DEADLOCK_RETRIES = 3

/**
 * 跑一次下单事务：锁当天进行中预约 → 二次校验 → 写入。
 * 业务校验不通过时直接写出失败响应；数据库错误（含死锁）整体回滚后向上抛，由调用方决定是否重试。
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function createBookingOnce(req, res) {
  const conn = await pool.getConnection()
  try {
    const me = req.user
    const payload = req.body || {}
    await conn.beginTransaction()
    // 锁当天进行中预约，二次校验员工占用与用户同时段唯一，避免并发双写下重复占用
    await conn.query("SELECT id FROM bookings WHERE date = ? AND status = 'active' FOR UPDATE", [
      payload.date,
    ])
    const service = await findService(payload.serviceId, conn)
    if (!service) {
      await conn.rollback()
      res.json(fail('服务不存在'))
      return
    }
    const employee = await findEmployee(payload.employeeId, conn)
    if (!employee) {
      await conn.rollback()
      res.json(fail('请选择员工'))
      return
    }
    let targetUser = me
    if (me.role === 'admin') {
      const targetId = String(payload.userId || '').trim()
      if (!targetId) {
        await conn.rollback()
        res.json(fail('请选择预约用户'))
        return
      }
      if (targetId === me.id) {
        await conn.rollback()
        res.json(fail('管理员不能为自己预约'))
        return
      }
      const [found] = await conn.query('SELECT * FROM users WHERE id = ?', [targetId])
      const user = found[0] ? mapUser(found[0]) : null
      if (!user || user.builtin || user.role === 'admin') {
        await conn.rollback()
        res.json(fail('预约用户无效'))
        return
      }
      targetUser = user
    }
    const date = String(payload.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await conn.rollback()
      res.json(fail('预约日期无效'))
      return
    }
    const [settingRows] = await conn.query('SELECT * FROM settings WHERE id = 1')
    const settings = settingRows[0]
    const slotMinutes = normalizeSlotMinutes(settings.slot_minutes)
    const bookings = await listBookings(conn, date)
    const check = canCreateBooking(
      bookings,
      date,
      payload.startHour,
      service.durationHours,
      settings.end_hour,
      slotMinutes,
      new Date(),
      employee,
      service.id,
      targetUser.id,
      employee.leaves,
    )
    if (!check.ok) {
      await conn.rollback()
      res.json(fail(check.message))
      return
    }
    const created = {
      // 行锁只覆盖同一天的 active 预约，不同日期的下单会并发走到这里，
      // 用毫秒时间戳做主键同毫秒即冲突；
      // 去掉连字符后取 30 位，加上前缀刚好填满 bookings.id 的 VARCHAR(32)
      id: `b-${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      date,
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
      price: service.price,
      remark: payload.remark || '',
      status: 'active',
    }
    await conn.query(
      `INSERT INTO bookings (
        id, date, date_display, start_hour, service_id, service_name, duration_hours,
        employee_id, employee_name, user_id, contact_name, contact_phone, price, remark, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        created.id,
        created.date,
        created.dateDisplay,
        created.startHour,
        created.serviceId,
        created.serviceName,
        created.durationHours,
        created.employeeId,
        created.employeeName,
        created.userId,
        created.contactName,
        created.contactPhone,
        created.price,
        created.remark,
        created.status,
      ],
    )
    await conn.commit()
    res.json(ok(created))
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

app.post('/api/bookings', requireAuth, async (req, res, next) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await createBookingOnce(req, res)
      return
    } catch (error) {
      // 当天还没有预约时 FOR UPDATE 取到的是间隙锁，间隙锁之间相容，
      // 但各自 INSERT 需要的插入意向锁与别人的间隙锁冲突，并发下单会互等成环。
      // 被牺牲的事务已整体回滚，没有任何副作用残留，重试是安全的。
      if (error?.code === 'ER_LOCK_DEADLOCK' && attempt < BOOKING_DEADLOCK_RETRIES) {
        // 立刻重试会和其他同时被牺牲的事务再次撞在同一个间隙上，
        // 递增加随机抖动把它们错开，否则高并发下重试仍会成片失败
        const backoffMs = 20 * (attempt + 1) + Math.floor(Math.random() * 20)
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        continue
      }
      next(error)
      return
    }
  }
})

app.post('/api/bookings/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    await settleBookings()
    const me = req.user
    const [rows] = await pool.query('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!rows[0]) {
      res.json(fail('预约不存在'))
      return
    }
    const booking = mapBooking(rows[0])
    if (booking.status === 'done') {
      res.json(fail('预约已结束，无法取消'))
      return
    }
    if (me.role !== 'admin' && booking.userId !== me.id) {
      res.json(fail('没有权限'))
      return
    }
    if (me.role !== 'admin' && !canUserCancelBooking(booking)) {
      res.json(fail('开约前 30 分钟内无法取消预约'))
      return
    }
    await pool.query('DELETE FROM bookings WHERE id = ?', [booking.id])
    res.json(ok({ id: booking.id }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/employees', requireAuth, async (_req, res, next) => {
  try {
    res.json(ok({ list: await listEmployees() }))
  } catch (error) {
    next(error)
  }
})

app.post('/api/employees', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const [serviceRows] = await pool.query('SELECT * FROM services')
    const parsed = parseEmployeePayload(
      req.body || {},
      serviceRows.map(mapService),
      await currentBusinessMinutes(),
    )
    if (!parsed.ok) {
      res.json(fail(parsed.message))
      return
    }
    const created = { id: `e-${Date.now()}`, ...parsed.data }
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('INSERT INTO employees (id, name) VALUES (?, ?)', [created.id, created.name])
      for (const serviceId of created.serviceIds) {
        await conn.query('INSERT INTO employee_services (employee_id, service_id) VALUES (?, ?)', [
          created.id,
          serviceId,
        ])
      }
      await replaceEmployeeLeaves(conn, created.id, created.leaves)
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
    res.json(ok(created))
  } catch (error) {
    next(error)
  }
})

app.put('/api/employees/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const target = await findEmployee(req.params.id)
    if (!target) {
      res.json(fail('员工不存在'))
      return
    }
    const [serviceRows] = await pool.query('SELECT * FROM services')
    const parsed = parseEmployeePayload(
      req.body || {},
      serviceRows.map(mapService),
      await currentBusinessMinutes(),
    )
    if (!parsed.ok) {
      res.json(fail(parsed.message))
      return
    }
    const bookings = await listBookings()
    const blocked = parsed.data.leaves.some((leave) =>
      leaveOverlapsBooking(leave, bookings, target.id),
    )
    if (blocked) {
      res.json(fail('该时段已有预约，不能请假'))
      return
    }
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('UPDATE employees SET name = ? WHERE id = ?', [parsed.data.name, target.id])
      await conn.query('DELETE FROM employee_services WHERE employee_id = ?', [target.id])
      for (const serviceId of parsed.data.serviceIds) {
        await conn.query('INSERT INTO employee_services (employee_id, service_id) VALUES (?, ?)', [
          target.id,
          serviceId,
        ])
      }
      await replaceEmployeeLeaves(conn, target.id, parsed.data.leaves)
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
    res.json(ok({ id: target.id, ...parsed.data }))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/employees/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const target = await findEmployee(req.params.id)
    if (!target) {
      res.json(fail('员工不存在'))
      return
    }
    // 可做项目、请假随外键级联删除；预约不挂外键，记录仍保留当时的员工姓名
    await pool.query('DELETE FROM employees WHERE id = ?', [target.id])
    res.json(ok({ id: target.id }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/services', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM services')
    res.json(ok({ list: rows.map(mapService) }))
  } catch (error) {
    next(error)
  }
})

app.post('/api/services', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const parsed = parseServicePayload(req.body || {}, await currentSlotMinutes())
    if (!parsed.ok) {
      res.json(fail(parsed.message))
      return
    }
    const created = { id: `s-${Date.now()}`, ...parsed.data }
    await pool.query(
      'INSERT INTO services (id, name, price, duration_hours, description) VALUES (?, ?, ?, ?, ?)',
      [created.id, created.name, created.price, created.durationHours, created.description],
    )
    res.json(ok(created))
  } catch (error) {
    next(error)
  }
})

app.put('/api/services/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const target = await findService(req.params.id)
    if (!target) {
      res.json(fail('服务不存在'))
      return
    }
    const parsed = parseServicePayload(req.body || {}, await currentSlotMinutes())
    if (!parsed.ok) {
      res.json(fail(parsed.message))
      return
    }
    await pool.query(
      'UPDATE services SET name = ?, price = ?, duration_hours = ?, description = ? WHERE id = ?',
      [parsed.data.name, parsed.data.price, parsed.data.durationHours, parsed.data.description, target.id],
    )
    res.json(ok({ id: target.id, ...parsed.data }))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/services/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const target = await findService(req.params.id)
    if (!target) {
      res.json(fail('服务不存在'))
      return
    }
    // 员工可做项目关联随外键级联删掉；已产生的预约仍保留当时的服务名
    await pool.query('DELETE FROM services WHERE id = ?', [target.id])
    res.json(ok({ id: target.id }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/users', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE builtin = 0')
    res.json(ok({ list: rows.map((item) => publicUser(mapUser(item))) }))
  } catch (error) {
    next(error)
  }
})

app.put('/api/users/:id/password', requireAuth, async (req, res, next) => {
  try {
    const me = req.user
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id])
    const target = rows[0] ? mapUser(rows[0]) : null
    if (!target || target.builtin) {
      res.json(fail('用户不存在'))
      return
    }
    if (me.role !== 'admin' && me.id !== target.id) {
      res.json(fail('没有权限'))
      return
    }
    const password = String(req.body?.password || '')
    if (!password) {
      res.json(fail('请填写新密码'))
      return
    }
    const hashed = await hashPassword(password)
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, target.id])
    res.json(ok({ id: target.id }))
  } catch (error) {
    next(error)
  }
})

app.get('/api/users/:id', requireAuth, async (req, res, next) => {
  try {
    const me = req.user
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id])
    const target = rows[0] ? mapUser(rows[0]) : null
    if (!target || target.builtin) {
      res.json(fail('用户不存在'))
      return
    }
    if (me.role !== 'admin' && me.id !== target.id) {
      res.json(fail('没有权限'))
      return
    }
    const bookings = (await settleBookings()).filter((item) => item.userId === target.id)
    res.json(
      ok({
        user: publicUser(target),
        bookings,
      }),
    )
  } catch (error) {
    next(error)
  }
})

app.delete('/api/users/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      res.json(fail('没有权限'))
      return
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id])
    const target = rows[0] ? mapUser(rows[0]) : null
    if (!target || target.builtin) {
      res.json(fail('用户不存在'))
      return
    }
    await pool.query('DELETE FROM users WHERE id = ?', [target.id])
    res.json(ok({ id: target.id }))
  } catch (error) {
    next(error)
  }
})

const distDir = path.join(rootDir, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.json(fail('接口不存在'))
    return
  }
  if (req.method === 'GET' && fs.existsSync(distDir)) {
    res.sendFile(path.join(distDir, 'index.html'))
    return
  }
  next()
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json(fail(error.message || '服务器错误'))
})

const port = Number(process.env.PORT || 3000)

try {
  await waitForDb()
  await initDatabase()
  app.listen(port, () => {
    console.log(`API 已启动 http://127.0.0.1:${port}`)
  })
} catch (error) {
  console.error('无法连接 MySQL。请先执行 docker compose up -d，或在本机启动 MySQL 并复制 .env.example 为 .env')
  console.error(error.message || error)
  process.exit(1)
}
