import { createRouter, createWebHistory } from 'vue-router'
import { ROLE_KEY, TOKEN_KEY } from '@/api/request'
import { homePath } from '@/utils/portal'
import Login from '@/views/Login.vue'
import Register from '@/views/Register.vue'
import AppLayout from '@/views/AppLayout.vue'
import ClientLayout from '@/views/ClientLayout.vue'
import ScheduleBoard from '@/views/ScheduleBoard.vue'
import UserManage from '@/views/UserManage.vue'
import SystemSettings from '@/views/SystemSettings.vue'
import ServiceIntro from '@/views/ServiceIntro.vue'
import ServiceManage from '@/views/ServiceManage.vue'
import EmployeeManage from '@/views/EmployeeManage.vue'
import OpsStats from '@/views/OpsStats.vue'
import ClientBook from '@/views/ClientBook.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    {
      path: '/',
      redirect: () => {
        const token = localStorage.getItem(TOKEN_KEY)
        if (!token) return '/login'
        return homePath(localStorage.getItem(ROLE_KEY))
      },
    },
    {
      path: '/',
      component: AppLayout,
      meta: {
        /** 后台布局：须登录且为管理员 */
        requiresAuth: true,
        roles: ['admin'],
      },
      children: [
        { path: 'board', component: ScheduleBoard },
        { path: 'users', component: UserManage },
        { path: 'services', component: ServiceIntro },
        {
          path: 'service-manage',
          component: ServiceManage,
        },
        {
          path: 'employees',
          component: EmployeeManage,
        },
        {
          path: 'stats',
          component: OpsStats,
        },
        {
          path: 'settings',
          component: SystemSettings,
        },
      ],
    },
    {
      path: '/book',
      component: ClientLayout,
      meta: {
        /** 顾客端布局：须登录且为普通用户 */
        requiresAuth: true,
        roles: ['user'],
      },
      children: [
        {
          path: '',
          component: ServiceIntro,
          beforeEnter(to) {
            const service = typeof to.query.service === 'string' ? to.query.service : ''
            // 旧地址 /book?service= 进向导选日期，避免落到介绍页丢预选
            if (service) return { path: '/book/schedule', query: { service } }
          },
        },
        { path: 'catalog', redirect: '/book' },
        { path: 'schedule', component: ClientBook },
        { path: 'account', component: UserManage },
      ],
    },
  ],
})

/** 未登录进不了两端；已登录按角色回自己的首页；串端访问会被拉回。 */
router.beforeEach((to) => {
  const token = localStorage.getItem(TOKEN_KEY)
  const role = localStorage.getItem(ROLE_KEY)
  const needsAuth = to.matched.some((record) => record.meta.requiresAuth)
  if (needsAuth && !token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if ((to.path === '/login' || to.path === '/register') && token) {
    return homePath(role)
  }
  const roles = to.matched.map((record) => record.meta.roles).find(Boolean)
  if (roles && !roles.includes(role)) {
    return homePath(role)
  }
})

export default router
