import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

export async function getFirebaseIdToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !isConfigured) {
    return null;
  }

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return user.getIdToken();
  } catch (error) {
    console.warn('Firebase anonymous sign-in failed; falling back to local dev token.', error);
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
  if (typeof window === 'undefined' || !isConfigured) {
    return { configured: false, signedIn: false, uid: null, isAnonymous: false };
  }

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return { configured: true, signedIn: true, uid: user.uid, isAnonymous: user.isAnonymous };
  } catch (error) {
    console.warn('Failed to resolve auth state.', error);
    return { configured: true, signedIn: false, uid: null, isAnonymous: false };
  }
}

export async function signOutUser(): Promise<void> {
  if (typeof window === 'undefined' || !isConfigured) return;

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    await signOut(auth);
  } catch (error) {
    console.warn('Sign-out failed.', error);
  }
}
