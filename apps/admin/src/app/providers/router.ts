import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from './pinia'
import { useSessionStore } from '@/entities/session'
import { AdminHomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginPage },
    { path: '/', component: AdminHomePage, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore(pinia)
  if (!session.token) session.hydrate()

  if (to.meta.requiresAuth && !session.token) return '/login'
  if (to.path === '/login' && session.token) return '/'

  if (to.meta.requiresAuth && !session.user) {
    try {
      await session.fetchMe()
    } catch {
      return '/login'
    }
  }
})
