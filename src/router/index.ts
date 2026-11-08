import { createRouter, createWebHistory } from 'vue-router'
import ReleasesView from '../views/ReleasesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'releases',
      component: ReleasesView,
    },
    {
      path: '/project',
      name: 'project',
      // Detail view is lazy-loaded: it is only needed after clicking a project.
      component: () => import('../views/ProjectReleasesView.vue'),
    },
  ],
})

export default router
