/**
 * 没有图片时，按项目 id 取一套固定的几何标记和色块。
 * 演示四档钉死，避免哈希撞色；其它项目用同一套四色循环。
 */

const COVERS = [
  { accent: '#1a4d4a', wash: '#d7e4e2', mark: 'bars' },
  { accent: '#c45c26', wash: '#f3e4d8', mark: 'ring' },
  { accent: '#243044', wash: '#dce3ea', mark: 'diamond' },
  { accent: '#3f6f62', wash: '#dceae4', mark: 'grid' },
]

/** 演示种子 id → 下标，保证四张卡片互不相同 */
const PINNED = {
  's-demo-basic': 0,
  's-demo-standard': 1,
  's-demo-premium': 2,
  's-demo-custom': 3,
}

/**
 * @param {string} id
 * @returns {number}
 */
function coverIndex(id) {
  if (Object.prototype.hasOwnProperty.call(PINNED, id)) return PINNED[id]
  const text = String(id || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash % COVERS.length
}

/**
 * @param {string} id
 * @returns {{ accent: string, wash: string, mark: 'bars' | 'ring' | 'diamond' | 'grid' }}
 */
export function serviceCover(id) {
  return COVERS[coverIndex(id)]
}
