/** 新密码最短位数。演示口令更长，这里只挡住过短的口令。 */
export const PASSWORD_MIN_LENGTH = 6
/** 新密码最长位数。哈希入库，这个上限只是避免无意义的超长输入。 */
export const PASSWORD_MAX_LENGTH = 32

/**
 * 新密码格式。不裁剪空格，空格也算密码的一部分。
 * @param {unknown} password
 * @returns {{ ok: true, password: string } | { ok: false, message: string }}
 */
export function validateNewPassword(password) {
  const value = String(password ?? '')
  if (!value) return { ok: false, message: '请填写新密码' }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `新密码至少 ${PASSWORD_MIN_LENGTH} 位` }
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `新密码不超过 ${PASSWORD_MAX_LENGTH} 位` }
  }
  return { ok: true, password: value }
}

/**
 * 顾客改自己的密码：原密码必填，新密码填写两次且一致，且不能与原密码相同。
 * 原密码对不对由服务端用哈希核对，这里只做格式。
 * @param {{ oldPassword?: unknown, newPassword?: unknown, confirmPassword?: unknown }} input
 * @returns {{ ok: true, oldPassword: string, password: string } | { ok: false, message: string }}
 */
export function validateSelfPasswordChange(input) {
  const oldPassword = String(input?.oldPassword ?? '')
  if (!oldPassword) return { ok: false, message: '请填写原密码' }
  const next = validateNewPassword(input?.newPassword)
  if (!next.ok) return next
  if (String(input?.confirmPassword ?? '') !== next.password) {
    return { ok: false, message: '两次输入的新密码不一致' }
  }
  if (next.password === oldPassword) {
    return { ok: false, message: '新密码不能与原密码相同' }
  }
  return { ok: true, oldPassword, password: next.password }
}
