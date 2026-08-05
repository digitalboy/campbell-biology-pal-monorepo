/**
 * @file authStore.ts
 * @description 管理用户身份验证状态与用户 Profile 信息。
 * 
 * 备注 (经验教训):
 * 1. 在 `onAuthStateChanged` 回调中添加了详尽的登录同步日志，保障调试体验。
 * 2. 成功后调用 `api.getUserProfile()` 并直接推动 `router.push('/')` 进入题目学习页。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, UserSyncPayload } from '@/types/api';
import { api } from '@/services/apiClient';
import { authService } from '@/services/authService';
import router from '@/router';

const USER_PROFILE_STORAGE_KEY = 'user_profile';

const getInitialUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  const storedUser = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (storedUser) {
    try {
      return JSON.parse(storedUser) as User;
    } catch (e) {
      console.error('Failed to parse stored user profile, removing it.', e);
      localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
      return null;
    }
  }
  return null;
};

// Auth 初始化完成的 Promise
let authReadyResolver: (value: unknown) => void;
const isAuthReady = new Promise((resolve) => {
  authReadyResolver = resolve;
});

export const useAuthStore = defineStore('auth', () => {
  // --- State ---
  const user = ref<User | null>(getInitialUser());
  const isLoading = ref(false);
  const isAuthInitialized = ref(false);

  // --- Getters ---
  const isLoggedIn = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.roles?.includes('admin'));

  // --- Actions ---

  function initializeAuthListener() {
    if (isAuthInitialized.value) return;

    isLoading.value = true;
    
    // 处理 Redirect 授权返回
    authService.checkRedirectResult().catch(err => {
      console.warn('[Auth Store] Check redirect result warning:', err);
    });

    authService.onAuthStateChanged(async (firebaseUser) => {
      console.log('[Auth Store] Auth state changed, firebaseUser:', firebaseUser?.email || 'none');

      if (firebaseUser) {
        if (!firebaseUser.uid || !firebaseUser.email) {
          console.error('Firebase user is missing UID or email. Cannot sync.');
          user.value = null;
          localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
          isLoading.value = false;
          isAuthInitialized.value = true;
          return;
        }

        try {
          const userPayload: UserSyncPayload = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            nickname: firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'New User',
            avatar_url: firebaseUser.photoURL || user.value?.avatar_url || '',
          };

          console.log('[Auth Store] Syncing user to backend D1...', userPayload);
          await api.syncUser(userPayload);

          console.log('[Auth Store] Fetching full user profile...');
          const fullUserProfile = await api.getUserProfile();

          console.log('[Auth Store] User sync success, profile:', fullUserProfile);
          user.value = fullUserProfile;
          localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(fullUserProfile));
          
          if (router.currentRoute.value.path === '/login') {
            console.log('[Auth Store] Redirecting from /login to /...');
            router.push('/');
          }
        } catch (error) {
          console.error('[Auth Store] Failed to sync user:', error);
          // 兜底机制：即使后端 sync 偶发网络问题，也维持 Firebase 登录态，使用基础用户信息
          const fallbackUser: User = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            nickname: firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'User',
            avatar_url: firebaseUser.photoURL || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            roles: ['user'],
          };
          user.value = fallbackUser;
          localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(fallbackUser));

          if (router.currentRoute.value.path === '/login') {
            router.push('/');
          }
        }
      } else {
        user.value = null;
        localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
      }
      isLoading.value = false;
      isAuthInitialized.value = true;
      authReadyResolver(true);
    });
  }

  async function logout() {
    await authService.signOut();
    user.value = null;
    localStorage.removeItem(USER_PROFILE_STORAGE_KEY);
    if (router.currentRoute.value.path !== '/login') {
      router.push('/login');
    }
  }

  return {
    user,
    isLoading,
    isLoggedIn,
    isAdmin,
    isAuthInitialized,
    initializeAuthListener,
    logout,
    isAuthReady,
  };
});
