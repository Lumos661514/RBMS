import { hashPassword } from './auth.js'
import { pool } from './db.js'

/** 内置店长：密码只来自环境变量 ADMIN_PASSWORD，不进前端包 */
const ADMIN_USER = {
  id: 'u-admin',
  phone: '13800138001',
  password: process.env.ADMIN_PASSWORD || '123456',
  name: '店长',
}

/** 演示顾客：与登录页一键填入账号一致 */
const DEMO_USER = {
  id: 'u-demo-customer',
  phone: '15158572063',
  password: '88888888',
  name: '演示顾客',
}

/** 演示项目：牙科门店常见三项，够顾客端介绍与后台管理展示 */
const DEMO_SERVICES = [
  {
    id: 's-demo-extract',
    name: '拔牙',
    price: 200,
    durationHours: 1,
    description: '拔牙前需要先吃饭，拔牙后2小时内不能吃东西',
  },
  {
    id: 's-demo-fill',
    name: '补牙',
    price: 150,
    durationHours: 1,
    description: '无',
  },
  {
    id: 's-demo-care',
    name: '牙齿护理',
    price: 120,
    durationHours: 1,
    description: '无',
  },
]

/** 演示员工：四名医生，均挂全部演示项目 */
const DEMO_EMPLOYEES = [
  { id: 'e-demo-li', name: '李医生' },
  { id: 'e-demo-chen', name: '陈医生' },
  { id: 'e-demo-xia', name: '夏医生' },
  { id: 'e-demo-huang', name: '黄医生' },
]

/**
 * 清空可变业务表并写入固定演示数据；保留内置店长与营业设置。
 * 供公网演示站定时任务调用，冲掉扫描器灌入的脏数据。
 */
export async function resetDemoData() {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 先清关联表与预约，再清主数据；内置管理员只改口令不删
    await conn.query('DELETE FROM bookings')
    await conn.query('DELETE FROM employee_leaves')
    await conn.query('DELETE FROM employee_services')
    await conn.query('DELETE FROM services')
    await conn.query('DELETE FROM employees')
    await conn.query('DELETE FROM users WHERE builtin = 0')

    const adminHashed = await hashPassword(ADMIN_USER.password)
    await conn.query(
      'UPDATE users SET password = ?, name = ?, phone = ? WHERE id = ? AND builtin = 1',
      [adminHashed, ADMIN_USER.name, ADMIN_USER.phone, ADMIN_USER.id],
    )

    const hashed = await hashPassword(DEMO_USER.password)
    await conn.query(
      'INSERT INTO users (id, phone, password, name, role, builtin) VALUES (?, ?, ?, ?, ?, 0)',
      [DEMO_USER.id, DEMO_USER.phone, hashed, DEMO_USER.name, 'user'],
    )

    for (const service of DEMO_SERVICES) {
      await conn.query(
        'INSERT INTO services (id, name, price, duration_hours, description) VALUES (?, ?, ?, ?, ?)',
        [service.id, service.name, service.price, service.durationHours, service.description],
      )
    }

    for (const employee of DEMO_EMPLOYEES) {
      await conn.query('INSERT INTO employees (id, name) VALUES (?, ?)', [employee.id, employee.name])
      for (const service of DEMO_SERVICES) {
        await conn.query('INSERT INTO employee_services (employee_id, service_id) VALUES (?, ?)', [
          employee.id,
          service.id,
        ])
      }
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}
