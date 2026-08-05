/**
 * @file AuthService
 * @description 处理 Firebase Authentication 身份验证逻辑 (支持 Popup 弹窗与 Redirect 页面跳转双模兜底机制)。
 * 
 * 备注 (经验教训):
 * 1. 优先尝试 `signInWithPopup`，当浏览器防跨域策略拦截或弹出受限时，无缝降级为 `signInWithRedirect` 页面跳转。
 * 2. `prompt: 'select_account'` 确保用户每次点击均能明确选择 Google 账号。
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/firebaseConfig";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

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
  checkRedirectResult,
  signOut,
  getToken,
  onAuthStateChanged,
  get currentUser() {
    return auth.currentUser;
  },
};