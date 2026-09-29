import { describe, expect, it } from 'vitest'
import { parseServiceImageUrl, serviceDescriptionText } from './serviceText.js'

describe('serviceDescriptionText', () => {
  it('空串、空白和占位「无」都不展示', () => {
    expect(serviceDescriptionText('')).toBe('')
    expect(serviceDescriptionText('   ')).toBe('')
    expect(serviceDescriptionText('无')).toBe('')
    expect(serviceDescriptionText(' 无 ')).toBe('')
  })

  it('有内容的简介原样保留', () => {
    expect(serviceDescriptionText(' 到店后先确认时长 ')).toBe('到店后先确认时长')
  })
})

describe('parseServiceImageUrl', () => {
  it('留空视为没有图片', () => {
    expect(parseServiceImageUrl('')).toEqual({ ok: true, imageUrl: '' })
    expect(parseServiceImageUrl('  ')).toEqual({ ok: true, imageUrl: '' })
  })

  it('接受 http 和 https', () => {
    expect(parseServiceImageUrl('https://example.com/a.png')).toEqual({
      ok: true,
      imageUrl: 'https://example.com/a.png',
    })
    expect(parseServiceImageUrl(' http://example.com/a.jpg ').ok).toBe(true)
  })

  it('拒绝不是链接或不是 http(s) 的地址', () => {
    expect(parseServiceImageUrl('不是链接').ok).toBe(false)
    expect(parseServiceImageUrl('javascript:alert(1)').ok).toBe(false)
    expect(parseServiceImageUrl('data:image/svg+xml,x').ok).toBe(false)
  })

  it('超长地址拒绝', () => {
    const result = parseServiceImageUrl(`https://example.com/${'a'.repeat(500)}`)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/过长/)
  })
})
