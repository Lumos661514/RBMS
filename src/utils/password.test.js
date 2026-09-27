import { describe, expect, it } from 'vitest'
import { validateNewPassword, validateSelfPasswordChange } from './password.js'

describe('validateNewPassword', () => {
  it('空密码拒绝', () => {
    expect(validateNewPassword('').ok).toBe(false)
    expect(validateNewPassword('').message).toMatch(/新密码/)
  })

  it('短于 6 位拒绝', () => {
    const result = validateNewPassword('12345')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/至少/)
  })

  it('长于 32 位拒绝', () => {
    const result = validateNewPassword('a'.repeat(33))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/不超过/)
  })

  it('合法密码原样返回，不裁剪空格', () => {
    expect(validateNewPassword('abc 12')).toEqual({ ok: true, password: 'abc 12' })
  })
})

describe('validateSelfPasswordChange', () => {
  it('缺少原密码时拒绝', () => {
    const result = validateSelfPasswordChange({
      oldPassword: '',
      newPassword: '123456',
      confirmPassword: '123456',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/原密码/)
  })

  it('两次新密码不一致时拒绝', () => {
    const result = validateSelfPasswordChange({
      oldPassword: 'old-pass',
      newPassword: '123456',
      confirmPassword: '123457',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/不一致/)
  })

  it('新密码与原密码相同时拒绝', () => {
    const result = validateSelfPasswordChange({
      oldPassword: '123456',
      newPassword: '123456',
      confirmPassword: '123456',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/不能与原密码相同/)
  })

  it('格式通过时带回原密码和新密码', () => {
    expect(
      validateSelfPasswordChange({
        oldPassword: 'old-pass',
        newPassword: '123456',
        confirmPassword: '123456',
      }),
    ).toEqual({ ok: true, oldPassword: 'old-pass', password: '123456' })
  })
})
