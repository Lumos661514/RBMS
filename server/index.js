import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import express from 'express'
import { pool, waitForDb } from './db.js'
import { initDatabase } from './init.js'
import {
  canCreateBooking,
  canUserCancelBooking,
  formatBookingDateDisplay,
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

function tokenForUser(userId) {
  return `tok-${userId}`
}

function publicUser(user) {
  return { id: user.id, phone: user.phone, name: user.name, role: user.role }
}

/**
 * 从 Bearer tok-{userId} 解析当前用户。
 * @param {import('express').Request} req
 */
async function currentUser(req) {
  const raw = req.headers.authorization || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token.startsWith('tok-')) return null
  const userId = token.slice(4)
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
  for (const item of settled.bookings) {
    const prev = mapped.find((row) => row.id === item.id)
    if (prev && prev.status !== item.status) {
      await pool.query('UPDATE bookings SET status = ? WHERE id = ?', [item.status, item.id])
    }
  }
  return settled.bookings
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function listBookings(conn = pool) {
  const [rows] = await conn.query('SELECT * FROM bookings')
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
  return {
    id: rows[0].id,
    name: rows[0].name,
    serviceIds: links.map((item) => item.service_id),
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} [conn]
 */
async function listEmployees(conn = pool) {
  const [employees] = await conn.query('SELECT * FROM employees')
  const [links] = await conn.query('SELECT employee_id, service_id FROM employee_services')
  const byEmp = new Map()
  for (const item of links) {
    if (!byEmp.has(item.employee_id)) byEmp.set(item.employee_id, [])
    byEmp.get(item.employee_id).push(item.service_id)
  }
  return employees.map((item) => ({
    id: item.id,
    name: item.name,
    serviceIds: byEmp.get(item.id) || [],
  }))
}

/**
 * @param {object} payload
 * @param {object[]} services
 */
function parseEmployeePayload(payload, services) {
  const name = String(payload.name || '').trim()
  const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds.map(String) : []
  if (!name) return { ok: false, message: '请填写员工姓名' }
  if (!serviceIds.length) return { ok: false, message: '请至少选择一个可做项目' }
  const validIds = new Set((services || []).map((item) => item.id))
  if (serviceIds.some((id) => !validIds.has(id))) {
    return { ok: false, message: '所选项目无效' }
  }
  return { ok: true, data: { name, serviceIds } }
}

/**
 * @param {object} payload
 */
function parseServicePayload(payload) {
  const name = String(payload.name || '').trim()
  const description = String(payload.description || '').trim()
  const price = Number(payload.price)
  const durationHours = Number(payload.durationHours)
  if (!name) return { ok: false, message: '请填写服务名称' }
  if (!Number.isFinite(price) || price < 0) return { ok: false, message: '价格须为非负数字' }
  if (!Number.isFinite(durationHours) || durationHours < 0.5 || Math.round(durationHours * 2) !== durationHours * 2) {
    return { ok: false, message: '服务时长须为至少 0.5 小时，且为 0.5 的倍数' }
  }
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
    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? AND password = ?', [
      phone,
      password,
    ])
    if (!rows[0]) {
      res.json(fail('手机号或密码错误'))
      return
    }
    const user = mapUser(rows[0])
    res.json(
      ok({
        token: tokenForUser(user.id),
        name: user.name,
        role: user.role,
        userId: user.id,
      }),
    )
  } catch (error) {
    next(error)
  }
})

app.post('/api/register', async (req, res, next) => {
  try {
    const phone = String(req.body?.phone || '').trim()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    if (!phone || !password || !name) {
      res.json(fail('请填写手机号、姓名和密码'))
      return
    }
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone])
    if (exists.length) {
      res.json(fail('该手机号已注册'))
      return
    }
    const id = `u-${Date.now()}`
    await pool.query(
      'INSERT INTO users (id, phone, password, name, role, builtin) VALUES (?, ?, ?, ?, ?, 0)',
      [id, phone, password, name, 'user'],
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

app.get('/api/bookings', requireAuth, async (_req, res, next) => {
  try {
    const list = await settleBookings()
    res.json(ok({ list }))
  } catch (error) {
    next(error)
  }
})

app.post('/api/bookings', requireAuth, async (req, res, next) => {
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
    const bookings = await listBookings(conn)
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
    )
    if (!check.ok) {
      await conn.rollback()
      res.json(fail(check.message))
      return
    }
    const created = {
      id: `b-${Date.now()}`,
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
    next(error)
  } finally {
    conn.release()
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
    const parsed = parseEmployeePayload(req.body || {}, serviceRows.map(mapService))
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
    const parsed = parseEmployeePayload(req.body || {}, serviceRows.map(mapService))
    if (!parsed.ok) {
      res.json(fail(parsed.message))
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
    const parsed = parseServicePayload(req.body || {})
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
    const parsed = parseServicePayload(req.body || {})
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
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [password, target.id])
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
