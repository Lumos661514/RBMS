import { describe, expect, it } from 'vitest'
import { serviceCover } from './serviceCover.js'

describe('serviceCover', () => {
  it('演示四档标记和颜色互不相同', () => {
    const covers = ['s-demo-basic', 's-demo-standard', 's-demo-premium', 's-demo-custom'].map(
      serviceCover,
    )
    expect(new Set(covers.map((item) => item.mark)).size).toBe(4)
    expect(new Set(covers.map((item) => item.accent)).size).toBe(4)
  })

  it('同一个 id 每次结果相同', () => {
    expect(serviceCover('s-admin-1')).toEqual(serviceCover('s-admin-1'))
  })

  it('空 id 也能落到一套封面', () => {
    const cover = serviceCover('')
    expect(cover.accent).toMatch(/^#/)
    expect(['bars', 'ring', 'diamond', 'grid']).toContain(cover.mark)
  })
})