/** 图片地址上限，和 services.image_url 列宽对齐。 */
const IMAGE_URL_MAX = 500

/**
 * 顾客端要展示的简介。
 * 空串、纯空白，以及演示数据里用来占位的「无」，都视为没有简介。
 * @param {unknown} description
 * @returns {string}
 */
export function serviceDescriptionText(description) {
  const value = String(description ?? '').trim()
  if (!value || value === '无') return ''
  return value
}

/**
 * 项目图片地址。留空表示没有图；只接受 http / https，避免 javascript: 之类的地址进到 img。
 * @param {unknown} raw
 * @returns {{ ok: true, imageUrl: string } | { ok: false, message: string }}
 */
export function parseServiceImageUrl(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: true, imageUrl: '' }
  if (value.length > IMAGE_URL_MAX) return { ok: false, message: '图片地址过长' }
  let url
  try {
    url = new URL(value)
  } catch {
    return { ok: false, message: '图片地址须为 http 或 https 链接' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: '图片地址须为 http 或 https 链接' }
  }
  return { ok: true, imageUrl: value }
}
