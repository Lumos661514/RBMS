import { createRouter, createWebHistory } from 'vue-router'
import { ROLE_KEY, TOKEN_KEY } from '@/api/request'
import Login from '@/views/Login.vue'
import Register from '@/views/Register.vue'
import AppLayout from '@/views/AppLayout.vue'
import ScheduleBoard from '@/views/ScheduleBoard.vue'
import UserManage from '@/views/UserManage.vue'
import SystemSettings from '@/views/SystemSettings.vue'
import ServiceIntro from '@/views/ServiceIntro.vue'
import ServiceManage from '@/views/ServiceManage.vue'
import EmployeeManage from '@/views/EmployeeManage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    {
      path: '/',
      component: AppLayout,
      meta: {
        /** 布局内页面都要先登录 */
        requiresAuth: true,
      },
      children: [
        { path: '', redirect: '/board' },
        { path: 'board', component: ScheduleBoard },
        { path: 'users', component: UserManage },
        { path: 'services', component: ServiceIntro },
        {
          path: 'service-manage',
          component: ServiceManage,
          meta: {
            /** 项目管理仅管理员 */
            roles: ['admin'],
          },
        },
        {
          path: 'employees',
          component: EmployeeManage,
          meta: {
            /** 员工管理仅管理员 */
            roles: ['admin'],
          },
        },
        {
          path: 'settings',
          component: SystemSettings,
          meta: {
            /** 系统设置仅管理员 */
            roles: ['admin'],
          },
        },
      ],
    },
  ],
})

/** 未登录进不了后台；已登录访问登录/注册则进看板；非管理员进不了设置。 */
router.beforeEach((to) => {
  const token = localStorage.getItem(TOKEN_KEY)
  const role = localStorage.getItem(ROLE_KEY)
  const needsAuth = to.matched.some((record) => record.meta.requiresAuth)
  if (needsAuth && !token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if ((to.path === '/login' || to.path === '/register') && token) {
    return '/board'
  }
  const roles = to.matched.map((record) => record.meta.roles).find(Boolean)
  if (roles && !roles.includes(role)) {
    return '/board'
  }
})

export default router
