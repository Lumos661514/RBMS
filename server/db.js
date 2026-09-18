import mysql from 'mysql2/promise'

const baseConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  // 空字符串也要保留：本机 root 无密码时 .env 写 DB_PASSWORD=
  password: process.env.DB_PASSWORD ?? '123456',
}

const dbName = process.env.DB_NAME || 'booking'

/** 连接池：DATE 以字符串返回，避免时区把预约日改掉。 */
export const pool = mysql.createPool({
  ...baseConfig,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  decimalNumbers: true,
  multipleStatements: true,
})

/**
 * Docker 刚起来时 MySQL 可能还没就绪；库不存在则先建库。
 */
export async function waitForDb() {
  let lastError = null
  for (let i = 0; i < 20; i += 1) {
    try {
      const conn = await mysql.createConnection(baseConfig)
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``)
      await conn.end()
      await pool.query('SELECT 1')
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw lastError || new Error('无法连接 MySQL')
}
