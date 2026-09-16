import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const storePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'store.json')

/**
 * 读出当前用户、预约、营业设置。
 */
export function readStore() {
  return JSON.parse(fs.readFileSync(storePath, 'utf8'))
}

/**
 * 把内存里的改动写回 JSON，重启开发服务后还能读到注册用户。
 * @param {object} data
 */
export function writeStore(data) {
  fs.writeFileSync(storePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/**
 * 列表/详情对外不带密码。
 * @param {{ id: string, phone: string, name: string, role: string }} user
 */
export function publicUser(user) {
  return { id: user.id, phone: user.phone, name: user.name, role: user.role }
}

/**
 * 登录态 token 与用户 id 一一对应，便于 Mock 认出当前是谁。
 * @param {string} userId
 */
export function tokenForUser(userId) {
  return `tok-${userId}`
}
