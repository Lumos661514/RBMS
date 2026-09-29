import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import viteCompression from 'vite-plugin-compression'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 这些 chunk 只在离开登录页后才需要。
 * Vite 默认会把路由里所有动态 import 写进 index.html 的 modulepreload，
 * 登录首屏就会把管理端和顾客端一起拉下来。
 */
const DEFERRED_ROUTE_CHUNK =
  /\/(AppLayout|ClientLayout|ScheduleBoard|UserManage|SystemSettings|ServiceIntro|ServiceManage|EmployeeManage|OpsStats|ClientBook|Register|BookingCreateDialog|BookingDetailDialog)-/

const elementPlusResolver = ElementPlusResolver({ importStyle: 'css' })

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [elementPlusResolver],
      dts: false,
    }),
    Components({
      // 只按需解析 Element Plus，不扫描 src/components，避免对话框进登录包
      dirs: [],
      resolvers: [elementPlusResolver],
      dts: false,
    }),
    // 产物旁生成同名 .gz，线上 Nginx gzip_static 可直接发
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
      deleteOriginFile: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !DEFERRED_ROUTE_CHUNK.test(dep))
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/')
          if (
            normalized.includes('/node_modules/vue/') ||
            normalized.includes('/node_modules/vue-router/') ||
            normalized.includes('/node_modules/@vue/')
          ) {
            // 全站共用、体积小，单独长期缓存
            return 'vue-vendor'
          }
          // element-plus 不收进同一个 vendor：登录页只用到表单，
          // 表格和日期选择器留在各自路由 chunk 里
        },
      },
    },
  },
  server: {
    // 开发态浏览器仍请求 /api，由 Vite 转到 Express，避免跨域
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
