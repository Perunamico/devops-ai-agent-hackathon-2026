import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged as _onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as _signOut,
  type User,
} from 'firebase/auth';

function resolveAuthDomain(): string | undefined {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const { hostname, host } = window.location;
  if (hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com')) {
    return host;
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

function getApp(): FirebaseApp {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

function getActionCodeSettings() {
  return {
    url: typeof window === 'undefined' ? 'https://gen-lang-client-0099285268.web.app' : window.location.origin,
    handleCodeInApp: false,
  };
}

export function onAuthStateChanged(cb: (user: User | null) => void): () => void {
  if (typeof window === 'undefined' || !isFirebaseConfigured) {
    cb(null);
    return () => {};
  }
  return _onAuthStateChanged(getAuth(getApp()), cb);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getAuth(getApp()), email, password);
}

export async function createAccountWithEmail(email: string, password: string): Promise<void> {
  const credential = await createUserWithEmailAndPassword(getAuth(getApp()), email, password);
  await sendEmailVerification(credential.user, getActionCodeSettings());
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getAuth(getApp()), email, getActionCodeSettings());
}

export async function sendVerificationToCurrentUser(): Promise<void> {
  const user = getAuth(getApp()).currentUser;
  if (!user) throw new Error('No current user');
  await sendEmailVerification(user, getActionCodeSettings());
}

export async function isCurrentUserEmailVerified(): Promise<boolean> {
  const user = getAuth(getApp()).currentUser;
  if (!user) return false;
  await user.reload();
  return getAuth(getApp()).currentUser?.emailVerified ?? false;
}

export async function signOutUser(): Promise<void> {
  if (typeof window === 'undefined' || !isFirebaseConfigured) return;
  await _signOut(getAuth(getApp()));
}

export async function getFirebaseIdToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !isFirebaseConfigured) {
    return null;
  }

  try {
    const user = getAuth(getApp()).currentUser;
    if (!user) return null;
    return user.getIdToken();
  } catch (error) {
    console.warn('Firebase token is unavailable.', error);
    return null;
  }
}

export interface AuthState {
  /** Firebase の設定が揃っているか（ローカル開発では false になりうる） */
  configured: boolean;
  /** サインイン済みか */
  signedIn: boolean;
  /** ユーザー UID（未サインイン時は null） */
  uid: string | null;
  /** 匿名認証かどうか */
  isAnonymous: boolean;
}

export async function getAuthState(): Promise<AuthState> {
  if (typeof window === 'undefined' || !isFirebaseConfigured) {
    return { configured: false, signedIn: false, uid: null, isAnonymous: false };
  }

  try {
    const user = getAuth(getApp()).currentUser;
    if (!user) return { configured: true, signedIn: false, uid: null, isAnonymous: false };
    return { configured: true, signedIn: true, uid: user.uid, isAnonymous: user.isAnonymous };
  } catch (error) {
    console.warn('Failed to resolve auth state.', error);
    return { configured: true, signedIn: false, uid: null, isAnonymous: false };
  }
}
