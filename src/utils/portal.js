/**
 * 管理员进后台看板，顾客进项目介绍。
 * @param {string} [role]
 */
export function homePath(role) {
  return role === 'admin' ? '/board' : '/book'
}

/**
 * 登录后的 redirect 是否属于当前角色的那一端。
 * @param {string} path
 * @param {string} [role]
 */
export function isPathForRole(path, role) {
  const raw = String(path || '').split('?')[0]
  if (!raw.startsWith('/')) return false
  if (role === 'admin') return !raw.startsWith('/book')
  return raw === '/book' || raw.startsWith('/book/')
}
