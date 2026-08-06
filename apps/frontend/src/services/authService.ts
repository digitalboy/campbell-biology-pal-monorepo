/**
 * @file AuthService
 * @description 处理 Firebase Authentication 身份验证逻辑 (支持 Google One Tap 快捷登录、Popup 弹窗与 Redirect 页面跳转多模兜底机制)。
 * 
 * 备注 (经验教训):
 * 1. 【Google One Tap 快捷登录】基于 Google Identity Services (GIS) 原生唤起 One Tap 悬浮卡片，获取凭证后通过 `signInWithCredential(auth, GoogleAuthProvider.credential(token))` 实现 Firebase Auth 无缝接轨。
 * 2. 优先尝试 `signInWithPopup`，当浏览器防跨域策略拦截或弹出受限时，无缝降级为 `signInWithRedirect` 页面跳转。
 * 3. `prompt: 'select_account'` 确保用户每次点击均能明确选择 Google 账号。
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/firebaseConfig";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (notification?: (notification: any) => void) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Google One Tap Web Client ID (来自 Firebase 项目 beike-e6301)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '889627047453-e6301.apps.googleusercontent.com';

/**
 * 初始化并智能提示 Google One Tap 快捷登录
 */
function initGoogleOneTap(onSuccess?: (cred: UserCredential) => void) {
  if (typeof window === 'undefined') return;

  const checkAndPrompt = () => {
    if (!window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: any) => {
          if (response && response.credential) {
            try {
              console.log('[AuthService] One Tap credential received, signing in to Firebase...');
              const credential = GoogleAuthProvider.credential(response.credential);
              const userCred = await signInWithCredential(auth, credential);
              if (onSuccess) {
                onSuccess(userCred);
              }
            } catch (err) {
              console.error('[AuthService] One Tap Firebase sign-in error:', err);
            }
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.prompt((notification: any) => {
        if (notification.isNotDisplayed()) {
          console.log('[AuthService] One Tap prompt not displayed:', notification.getNotDisplayedReason());
        } else if (notification.isSkippedMoment()) {
          console.log('[AuthService] One Tap prompt skipped:', notification.getSkippedReason());
        } else if (notification.isDismissedMoment()) {
          console.log('[AuthService] One Tap prompt dismissed:', notification.getDismissedReason());
        }
      });
    } catch (e) {
      console.warn('[AuthService] Failed to initialize Google One Tap:', e);
    }
  };

  if (window.google?.accounts?.id) {
    checkAndPrompt();
  } else {
    // 脚本异步加载保护
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        checkAndPrompt();
      }
    }, 300);
    setTimeout(() => clearInterval(timer), 5000);
  }
}

/**
 * 智能 Google 登录流程：优先 Popup 弹窗，拦截时降级为 Redirect
 */
async function signInWithGoogle(): Promise<UserCredential | void> {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.warn("Popup authentication failed or was blocked, trying redirect fallback...", error);
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request' ||
      error.message?.includes('Cross-Origin-Opener-Policy')
    ) {
      return await signInWithRedirect(auth, googleProvider);
    }
    throw error;
  }
}

/**
 * 显式页面跳转登录
 */
async function signInWithGoogleRedirect() {
  return signInWithRedirect(auth, googleProvider);
}

/**
 * 检查 Redirect 返回授权结果
 */
async function checkRedirectResult() {
  try {
    return await getRedirectResult(auth);
  } catch (error) {
    console.error('Redirect sign in error:', error);
    return null;
  }
}

/**
 * 退出登录
 */
async function signOut() {
  if (window.google?.accounts?.id) {
    try { window.google.accounts.id.cancel(); } catch (e) {}
  }
  return firebaseSignOut(auth);
}

/**
 * 获取当前 Firebase 用户 JWT Token
 */
async function getToken(): Promise<string | null> {
  if (!auth.currentUser) {
    return null;
  }
  return auth.currentUser.getIdToken();
}

/**
 * 监听 Auth 状态变化
 */
function onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
  return onFirebaseAuthStateChanged(auth, callback);
}

export const authService = {
  signInWithGoogle,
  signInWithGoogleRedirect,
  initGoogleOneTap,
  checkRedirectResult,
  signOut,
  getToken,
  onAuthStateChanged,
  get currentUser() {
    return auth.currentUser;
  },
};