import { createRouter, createWebHistory } from 'vue-router'
import Login from '@/views/Login.vue'
import ScheduleBoard from '@/views/ScheduleBoard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/board' },
    { path: '/login', component: Login },
    {
      path: '/board',
      component: ScheduleBoard,
      meta: {
        /** 看板需要登录态，无 token 会被守卫拦到登录页 */
        requiresAuth: true,
      },
    },
  ],
})

/** 看板必须先有 token；已登录再进 /login 则送回看板。 */
router.beforeEach((to) => {
  const token = localStorage.getItem('booking_token')
  // 看板等需登录页：没 token 则带上原路径，登录完跳回
  if (to.meta.requiresAuth && !token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 已登录访问登录页时直接进看板，避免重复登录
  if (to.path === '/login' && token) {
    return '/board'
  }
})

export default router
