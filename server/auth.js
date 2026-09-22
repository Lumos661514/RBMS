import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

/** bcrypt 成本；演示库用户少，10 足够。 */
const BCRYPT_ROUNDS = 10
/** 登录态有效期，过期后前端按 401 回登录页。 */
const JWT_EXPIRES_IN = '7d'

/**
 * 签名用密钥；未配置时用开发兜底，生产应在 .env 写 JWT_SECRET。
 */
function jwtSecret() {
  return process.env.JWT_SECRET || 'dev-jwt-secret'
}

/**
 * 是否已是 bcrypt 哈希，用来区分旧库明文。
 * @param {string} stored
 */
export function isHashedPassword(stored) {
  return typeof stored === 'string' && stored.startsWith('$2')
}

/**
 * 把明文密码打成哈希再入库。
 * @param {string} plain
 */
export function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS)
}

/**
 * 校验登录密码；兼容尚未迁移的明文。
 * @param {string} plain
 * @param {string} stored
 */
export async function verifyPassword(plain, stored) {
  if (isHashedPassword(stored)) {
    return bcrypt.compare(String(plain), stored)
  }
  return String(plain) === String(stored)
}

/**
 * 签发登录 JWT，payload 只放用户 id。
 * @param {string} userId
 */
export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, jwtSecret(), { expiresIn: JWT_EXPIRES_IN })
}

/**
 * 从 Bearer token 取出用户 id；过期或伪造则返回空。
 * @param {string} token
 */
export function userIdFromToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), jwtSecret())
    return payload?.sub ? String(payload.sub) : null
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return null
    }
    throw error
  }
}

/**
 * 启动时把仍是明文的密码改成哈希，避免旧数据继续明文存放。
 * @param {import('mysql2/promise').Pool} pool
 */
export async function hashPlaintextPasswords(pool) {
  const [rows] = await pool.query('SELECT id, password FROM users')
  for (const row of rows) {
    if (isHashedPassword(row.password)) continue
    const hashed = await hashPassword(row.password)
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, row.id])
  }
}
