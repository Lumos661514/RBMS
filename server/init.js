import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { hashPassword, hashPlaintextPasswords } from './auth.js'
import { pool } from './db.js'

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql')

/** 空库写入的内置管理员，不出现在用户管理列表。 */
const ADMIN_ID = 'u-admin'
const ADMIN_PHONE = '15158572063'
const ADMIN_PASSWORD = '123456'
const ADMIN_NAME = '蔡博闻'

/**
 * 建表；users 为空时只写入内置管理员，settings 为空时写入营业默认值。
 * 不灌演示项目、员工和预约。
 */
export async function initDatabase() {
  const sql = fs.readFileSync(schemaPath, 'utf8')
  await pool.query(sql)

  const [users] = await pool.query('SELECT id FROM users LIMIT 1')
  if (!users.length) {
    const hashed = await hashPassword(ADMIN_PASSWORD)
    await pool.query(
      'INSERT INTO users (id, phone, password, name, role, builtin) VALUES (?, ?, ?, ?, ?, 1)',
      [ADMIN_ID, ADMIN_PHONE, hashed, ADMIN_NAME, 'admin'],
    )
  }
  // 旧库明文密码启动时改成哈希
  await hashPlaintextPasswords(pool)

  // 看板和预约都读这一行；没有则写入默认营业时间
  const [settings] = await pool.query('SELECT id FROM settings WHERE id = 1')
  if (!settings.length) {
    await pool.query(
      'INSERT INTO settings (id, start_hour, end_hour, day_count, slot_minutes) VALUES (1, 9, 18, 7, 60)',
    )
  }
  await migrateLeaveTimes()
  await ensureLeaveEndDate()
}

/**
 * 旧表是按天休息/请假。改成当天时段后丢掉旧行，避免半套字段。
 */
async function migrateLeaveTimes() {
  const [cols] = await pool.query("SHOW COLUMNS FROM employee_leaves LIKE 'kind'")
  if (!cols.length) return
  await pool.query('DROP TABLE employee_leaves')
  await pool.query(`
    CREATE TABLE employee_leaves (
      id VARCHAR(32) PRIMARY KEY,
      employee_id VARCHAR(32) NOT NULL,
      leave_date DATE NOT NULL,
      end_date DATE NOT NULL,
      start_minutes INT NOT NULL,
      end_minutes INT NOT NULL,
      CONSTRAINT fk_el_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
      INDEX idx_el_employee_date (employee_id, leave_date)
    )
  `)
}

/**
 * 已有时段表补结束日。旧行结束日等于开始日，不删已有请假。
 */
async function ensureLeaveEndDate() {
  const [cols] = await pool.query("SHOW COLUMNS FROM employee_leaves LIKE 'end_date'")
  if (cols.length) return
  await pool.query('ALTER TABLE employee_leaves ADD COLUMN end_date DATE NULL')
  await pool.query('UPDATE employee_leaves SET end_date = leave_date')
  await pool.query('ALTER TABLE employee_leaves MODIFY end_date DATE NOT NULL')
}
