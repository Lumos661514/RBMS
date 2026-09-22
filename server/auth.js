import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

/** bcrypt 成本；演示库用户少，10 足够。 */
const BCRYPT_ROUNDS = 10
/** 登录态有效期，过期后前端按 401 回登录页。 */
const JWT_EXPIRES_IN = '7d'

/**
 * 签名用密钥；必须由环境变量提供。
 * 不留兜底默认值：仓库公开，一旦生产漏配就等于任何人都能伪造任意用户（含管理员）的 token，
 * 因此缺配置时直接让服务启动失败。
 */
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('缺少环境变量 JWT_SECRET，请在 .env 中配置一个随机长字符串后再启动')
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
 * 校验登录密码，只认 bcrypt 哈希。
 * 启动时 hashPlaintextPasswords 已把旧明文全部迁移（早于 app.listen，不可能有请求漏过去），
 * 因此不留明文比较分支——留着等于「往库里写明文口令也能登录」。
 * stored 不是哈希时 bcrypt.compare 直接返回 false，失败关闭。
 * @param {string} plain
 * @param {string} stored
 */
export async function verifyPassword(plain, stored) {
  return bcrypt.compare(String(plain), String(stored))
}

/**
 * 签发登录 JWT，payload 只放用户 id。
 * @param {string} userId
 */
export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/**
 * 从 Bearer token 取出用户 id；过期或伪造则返回空。
 * @param {string} token
 */
export function userIdFromToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), JWT_SECRET)
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
