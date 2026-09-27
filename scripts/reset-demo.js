import 'dotenv/config'
import { waitForDb } from '../server/db.js'
import { initDatabase } from '../server/init.js'
import { resetDemoData } from '../server/seedDemo.js'

/**
 * 演示站一键/定时入口：确保表结构后重置种子数据，然后退出。
 */
async function main() {
  await waitForDb()
  await initDatabase()
  await resetDemoData()
  console.log(`[reset-demo] ${new Date().toISOString()} ok`)
  process.exit(0)
}

main().catch((error) => {
  console.error('[reset-demo] failed', error)
  process.exit(1)
})
