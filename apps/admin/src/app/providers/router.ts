import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from './pinia'
import { useSessionStore } from '@/entities/session'
import { CasePage } from '@/pages/case'
import { CasesPage } from '@/pages/cases'
import { ImportPage } from '@/pages/import'
import { LoginPage } from '@/pages/login'
import { MetricsPage } from '@/pages/metrics'
import { OverviewPage } from '@/pages/overview'
import { TechPage } from '@/pages/tech'
import { DemoShell } from '@/widgets/demo-shell'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginPage },
    {
      path: '/',
      component: DemoShell,
      meta: { requiresAuth: true },
      children: [
        { path: '', component: OverviewPage },
        { path: 'import', component: ImportPage },
        { path: 'leads', component: CasesPage },
        { path: 'leads/:id', component: CasePage },
        { path: 'funnel', component: MetricsPage },
        { path: 'tech', component: TechPage },
      ],
    },
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
