import { spawn } from 'child_process'

const children = []

/**
 * 同时拉起 Express 与 Vite，开发时由 Vite 把 /api 转到 3000。
 * @param {string[]} args
 */
function start(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code) => {
    if (code) {
      children.forEach((item) => item.kill())
      process.exit(code)
    }
  })
}

function shutdown() {
  children.forEach((item) => item.kill())
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start(['server/index.js'])
start(['-r', './scripts/polyfill-crypto.cjs', './node_modules/vite/bin/vite.js'])
