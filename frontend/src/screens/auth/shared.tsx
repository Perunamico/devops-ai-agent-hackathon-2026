'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../AppContext';
import { resolvePostAuthPath } from '../../lib/postAuth';

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
  if (code.includes('invalid-email')) return 'メールアドレスの形式を確認してください。';
  if (code.includes('weak-password')) return 'パスワードは6文字以上で入力してください。';
  if (code.includes('email-already-in-use')) return 'このメールアドレスはすでに登録されています。';
  if (code.includes('operation-not-allowed')) return 'メール/パスワード認証がまだ有効になっていません。Firebase Console の Authentication で有効化してください。';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'メールアドレスまたはパスワードが違います。';
  }
  if (code.includes('too-many-requests')) return '試行回数が多すぎます。少し待ってから再試行してください。';
  if (code.includes('unauthorized-domain')) return 'このURLはGoogleログインの承認済みドメインに登録されていません。';
  if (code.includes('popup-blocked')) return 'ポップアップがブロックされました。ブラウザの設定を確認してください。';
  return '処理に失敗しました。時間をおいてもう一度試してください。';
}

export function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.31Z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20Z" />
      <path fill="#FBBC05" d="M4.41 11.9a6 6 0 0 1 0-3.8V5.5H1.06a10 10 0 0 0 0 9l3.35-2.6Z" />
      <path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0a10 10 0 0 0-8.94 5.5l3.35 2.6C5.2 5.74 7.4 3.98 10 3.98Z" />
    </svg>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}

export function AuthLoadingScreen() {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center">
      <span className="w-10 h-10 rounded-full border-4 border-sky-200 border-t-sky-500 animate-spin" />
    </div>
  );
}

// 認証系ページ（/signin /signup /reset）のラッパ。ログイン済みユーザーを本体へ送り出す。
// 旧コードではログイン成功後に App の再レンダーで暗黙に本体へ進んでいたが、
// ページ分割後はこのリダイレクトがその役割を担う。
export function PublicOnly({ children }: { children: ReactNode }) {
  const { auth, authLoading } = useApp();
  const router = useRouter();

  const redirectReady = !authLoading && auth !== null;
  const destination = !redirectReady
    ? null
    : !auth.configured
      ? '/home'
      : auth.signedIn
        ? (auth.emailVerified ? 'post-auth' : '/verify-email')
        : null;

  useEffect(() => {
    if (!destination) return;
    // resolvePostAuthPath は保留トークンを消費するため、実際に遷移する時だけ呼ぶ。
    router.replace(destination === 'post-auth' ? resolvePostAuthPath() : destination);
  }, [destination, router]);

  if (authLoading || destination) return <AuthLoadingScreen />;
  return <>{children}</>;
}
