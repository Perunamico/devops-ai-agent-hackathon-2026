import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
  type Auth,
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
  try {
    const user = getConfiguredAuth()?.currentUser;
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
  try {
    const auth = getConfiguredAuth();
    return authStateFromUser(auth?.currentUser ?? null);
  } catch (error) {
    console.warn('Failed to resolve auth state.', error);
    return {
      configured: isConfigured,
      signedIn: false,
      uid: null,
      isAnonymous: false,
      email: null,
      emailVerified: false,
    };
  }
}

let _auth: Auth | null = null;

// Firebase Hosting は同一プロジェクトの全ドメイン（本番/dev/プレビューチャンネル）で
// `/__/auth/handler` `/__/auth/iframe` を自動的に配信する。authDomain を env の固定値
// （本番の *.firebaseapp.com）のままにしていると、dev/プレビュー環境ではアプリのドメインと
// authDomain が別オリジンになり、Safari の ITP 等でリダイレクト結果 (getRedirectResult) が
// サイレントに失敗する（エラーも出ずユーザー情報が来ない）。今アクセスしているホスト自体が
// Firebase Hosting ドメインなら、そのホストを authDomain として使うことで常に同一オリジンにする。
function resolveAuthDomain(): string | undefined {
  const host = window.location.hostname;
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return host;
  return firebaseConfig.authDomain;
}

function getConfiguredAuth(): Auth | null {
  if (typeof window === 'undefined' || !isConfigured) return null;
  if (_auth) return _auth;
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ ...firebaseConfig, authDomain: resolveAuthDomain() });
  try {
    // ローカル永続化: ログイン状態はブラウザに保存され、タブを閉じても・
    // 再訪しても維持される（サインアウトするまでログインしたまま）。
    // メール確認/再設定リンク経由での強制再ログインは consumeReloginParam 側の
    // 明示的な signOutUser 呼び出しで担保しているため、ここでは影響しない。
    // popupRedirectResolver: initializeAuth はデフォルトでは付与されないため、
    // 明示的に渡さないと signInWithRedirect が auth/argument-error で落ちる。
    _auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // 既に初期化済み（HMR 等で二重初期化した場合）は既存インスタンスを使う。
    _auth = getAuth(app);
  }
  return _auth;
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

const GOOGLE_REDIRECT_PENDING_KEY = 'google-auth-redirect-pending';

export async function signInWithGoogle(): Promise<void> {
  const auth = getConfiguredAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  // iOS Safari は ITP（サイト越えトラッキング防止）の影響で signInWithPopup が
  // 失敗しやすいため、ページ遷移を伴う signInWithRedirect を使う。
  // Google アカウントはメール確認済み前提のため、メール確認待ち画面は経由しない。
  sessionStorage.setItem(GOOGLE_REDIRECT_PENDING_KEY, '1');
  await signInWithRedirect(auth, new GoogleAuthProvider());
}

export type GoogleRedirectDiagnostic =
  | { status: 'skipped' }
  | { status: 'no-auth' }
  | { status: 'no-user' }
  | { status: 'signed-in'; uid: string }
  | { status: 'error'; code: string };

// リダイレクトから戻ってきた直後に一度だけ呼び、結果を診断情報として返す。
// signInWithGoogle を呼んでいない通常の訪問では getRedirectResult 自体を呼ばない
// （authDomain とホスティングのドメインが異なる環境では、pending なリダイレクトが
// なくても内部の iframe チェックが失敗し、無関係なアクセスにまでエラーが出てしまうため）。
export async function consumeGoogleRedirectDiagnostic(): Promise<GoogleRedirectDiagnostic> {
  if (typeof window === 'undefined') return { status: 'skipped' };
  if (!sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY)) return { status: 'skipped' };
  sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
  const auth = getConfiguredAuth();
  if (!auth) return { status: 'no-auth' };
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) return { status: 'signed-in', uid: result.user.uid };
    return { status: 'no-user' };
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : 'unknown';
    return { status: 'error', code };
  }
}

// メールのリンクから戻ってきたときの continue URL。`?relogin=<mode>` を付けておき、
// App 側でこのパラメータを検知したらキャッシュ済みセッションを破棄して必ずログインさせる
// （リンクを開いたブラウザに別アカウントのセッションが残っていても本体へ進ませない）。
function emailActionSettings(mode: 'verify' | 'reset') {
  return { url: `${window.location.origin}/?relogin=${mode}` };
}

async function sendVerificationTo(user: User): Promise<void> {
  try {
    await sendEmailVerification(user, emailActionSettings('verify'));
  } catch {
    // continue URL のドメインが Firebase の承認済みドメイン外（プレビュー環境など）だと
    // 失敗するため、その場合は設定なしで送る（強制再ログインは効かないがメールは届く）。
    await sendEmailVerification(user);
  }
}

export async function createAccountWithEmail(email: string, password: string): Promise<void> {
  const auth = getConfiguredAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await sendVerificationTo(credential.user).catch((error) => {
    console.warn('Email verification failed.', error);
  });
}

export async function resendVerificationEmail(): Promise<void> {
  const auth = getConfiguredAuth();
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in.');
  await sendVerificationTo(user);
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
  const fresh = auth.currentUser;
  // ID トークンには発行時点の email_verified が焼き込まれている。確認済みになったら
  // トークンを強制更新しないと、バックエンドが古いトークンを 403 で弾き続けて
  // ペット作成（名付け）から先に進めなくなる。
  if (fresh?.emailVerified) {
    await fresh.getIdToken(true).catch(() => null);
  }
  return authStateFromUser(fresh);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getConfiguredAuth();
  if (!auth) throw new Error('Firebase is not configured.');
  try {
    await sendPasswordResetEmail(auth, email, emailActionSettings('reset'));
  } catch {
    // 承認済みドメイン外では continue URL なしで送る（sendVerificationTo と同じ理由）。
    await sendPasswordResetEmail(auth, email);
  }
}

export async function signOutUser(): Promise<void> {
  try {
    const auth = getConfiguredAuth();
    if (!auth) return;
    await signOut(auth);
  } catch (error) {
    console.warn('Sign-out failed.', error);
  }
}
