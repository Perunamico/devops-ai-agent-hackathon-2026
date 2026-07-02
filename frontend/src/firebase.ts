import { initializeApp, getApps } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';

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
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  } catch (error) {
    console.warn('Failed to resolve Firebase ID token.', error);
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
  email: string | null;
  emailVerified: boolean;
}

export async function getAuthState(): Promise<AuthState> {
  if (typeof window === 'undefined' || !isConfigured) {
    return {
      configured: false,
      signedIn: false,
      uid: null,
      isAnonymous: false,
      email: null,
      emailVerified: false,
    };
  }

  try {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const user = auth.currentUser;
    return authStateFromUser(user);
  } catch (error) {
    console.warn('Failed to resolve auth state.', error);
    return {
      configured: true,
      signedIn: false,
      uid: null,
      isAnonymous: false,
      email: null,
      emailVerified: false,
    };
  }
}

function getConfiguredAuth() {
  if (typeof window === 'undefined' || !isConfigured) return null;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(app);
}

function authStateFromUser(user: User | null): AuthState {
  return {
    configured: isConfigured,
    signedIn: Boolean(user),
    uid: user?.uid ?? null,
    isAnonymous: user?.isAnonymous ?? false,
    email: user?.email ?? null,
    emailVerified: user?.emailVerified ?? false,
  };
}

export function subscribeAuthState(callback: (state: AuthState) => void): () => void {
  const auth = getConfiguredAuth();
  if (!auth) {
    callback({
      configured: false,
      signedIn: false,
      uid: null,
      isAnonymous: false,
      email: null,
      emailVerified: false,
    });
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => callback(authStateFromUser(user)));
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const auth = getConfiguredAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  await signInWithEmailAndPassword(auth, email, password);
}

export async function createAccountWithEmail(email: string, password: string): Promise<void> {
  const auth = getConfiguredAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(credential.user).catch((error) => {
    console.warn('Email verification failed.', error);
  });
}

export async function resendVerificationEmail(): Promise<void> {
  const auth = getConfiguredAuth();
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  await sendEmailVerification(user);
}

export async function reloadCurrentUser(): Promise<AuthState> {
  const auth = getConfiguredAuth();
  const user = auth?.currentUser;
  if (!user) {
    return {
      configured: isConfigured,
      signedIn: false,
      uid: null,
      isAnonymous: false,
      email: null,
      emailVerified: false,
    };
  }
  await reload(user);
  return authStateFromUser(auth.currentUser);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getConfiguredAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  await sendPasswordResetEmail(auth, email);
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
