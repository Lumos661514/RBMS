/**
 * Vite 5.4 启动时会调用 node:crypto.getRandomValues；
 * Node 18 主模块上没有该方法（在 webcrypto 上），不补会直接起不来。
 */
const crypto = require('crypto')

if (typeof crypto.getRandomValues !== 'function') {
  if (!crypto.webcrypto || typeof crypto.webcrypto.getRandomValues !== 'function') {
    throw new Error('当前 Node 过旧，请升级到 18.19+ 或 20 LTS 后再运行 npm run dev')
  }
  crypto.getRandomValues = function getRandomValues(typedArray) {
    return crypto.webcrypto.getRandomValues(typedArray)
  }
}
