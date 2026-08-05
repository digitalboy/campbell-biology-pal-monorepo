import { createRouter, createWebHistory } from 'vue-router';
import LearningView from '@/views/LearningView.vue';
import LoginView from '@/views/LoginView.vue';
import NotFoundView from '@/views/NotFoundView.vue';

import { useAuthStore } from '@/stores/authStore';

const routes = [
  {
    path: '/',
    name: 'Learning',
    component: LearningView,
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
  },
  
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFoundView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Wait until the auth state is first initialized
  if (!authStore.isAuthInitialized) {
    await (authStore as any).isAuthReady;
  }

  const isLoggedIn = authStore.isLoggedIn;
  const requiresAuth = to.meta.requiresAuth;

  if (requiresAuth && !isLoggedIn) {
    // If the route requires auth and the user is not logged in, redirect to login.
    next({ name: 'Login' });
  } else if (to.name === 'Login' && isLoggedIn) {
    // If the user is logged in and tries to access the login page, redirect to home.
    next({ name: 'Learning' });
  } else {
    // Otherwise, allow navigation.
    next();
  }
});

export default router;
