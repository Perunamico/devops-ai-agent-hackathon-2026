import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';

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
