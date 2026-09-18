import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
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
    await pool.query(
      'INSERT INTO users (id, phone, password, name, role, builtin) VALUES (?, ?, ?, ?, ?, 1)',
      [ADMIN_ID, ADMIN_PHONE, ADMIN_PASSWORD, ADMIN_NAME, 'admin'],
    )
  }

  // 看板和预约都读这一行；没有则写入默认营业时间
  const [settings] = await pool.query('SELECT id FROM settings WHERE id = 1')
  if (!settings.length) {
    await pool.query(
      'INSERT INTO settings (id, start_hour, end_hour, day_count, slot_minutes) VALUES (1, 9, 18, 7, 60)',
    )
  }
}
