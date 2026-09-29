import { hashPassword } from './auth.js'
import { pool } from './db.js'

/** 内置店长：密码只来自环境变量 ADMIN_PASSWORD，不进前端包 */
const ADMIN_USER = {
  id: 'u-admin',
  phone: '13800138001',
  password: process.env.ADMIN_PASSWORD || '123456',
  name: '店长',
}

/** 演示顾客：与登录页一键填入账号一致。号码是明显的占位号，不是真人手机。 */
const DEMO_USER = {
  id: 'u-demo-customer',
  phone: '13800000000',
  password: '88888888',
  name: '演示顾客',
}

/** 演示项目：与当前本地演示库一致。时间格 60 分钟，时长都是整小时 */
const DEMO_SERVICES = [
  {
    id: 's-demo-basic',
    name: '基础服务',
    price: 50,
    durationHours: 2,
    description: '适合很快办完的常规事项。',
  },
  {
    id: 's-demo-standard',
    name: '标准服务',
    price: 100,
    durationHours: 1,
    description: '大多数到店需求用这一档。',
  },
  {
    id: 's-demo-premium',
    name: '高级服务',
    price: 160,
    durationHours: 2,
    description: '时间更宽裕，适合稍复杂的安排。',
  },
  {
    id: 's-demo-custom',
    name: '专属定制',
    price: 260,
    durationHours: 2,
    description: '先沟通再安排，时长最长。',
  },
]

/** 演示员工：四名顾问，均挂全部演示项目 */
const DEMO_EMPLOYEES = [
  { id: 'e-demo-lin', name: '顾问小林' },
  { id: 'e-demo-zhou', name: '顾问小周' },
  { id: 'e-demo-chen', name: '顾问小陈' },
  { id: 'e-demo-wu', name: '顾问小吴' },
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

    // 旧库可能还没有密码版本列；重置前补上，改密时才能作废旧 JWT
    const [pvCols] = await conn.query("SHOW COLUMNS FROM users LIKE 'password_version'")
    if (!pvCols.length) {
      await conn.query('ALTER TABLE users ADD COLUMN password_version INT NOT NULL DEFAULT 0')
    }

    const adminHashed = await hashPassword(ADMIN_USER.password)
    await conn.query(
      'UPDATE users SET password = ?, name = ?, phone = ?, password_version = password_version + 1 WHERE id = ? AND builtin = 1',
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

    // 60 分钟一格，与本地演示库一致，整小时项目才能约上
    await conn.query(
      `INSERT INTO settings (id, start_hour, end_hour, day_count, slot_minutes)
       VALUES (1, 9, 18, 7, 60)
       ON DUPLICATE KEY UPDATE start_hour = 9, end_hour = 18, day_count = 7, slot_minutes = 60`,
    )

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}
