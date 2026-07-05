'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from '../AppContext';
import { peekPendingExchangeToken, stashPendingExchangeToken } from '../lib/postAuth';
import { AuthLoadingScreen } from '../screens/auth/shared';

// (app) ルートグループのクライアントガード。旧 App.tsx の early return 群を再現する:
// 認証解決待ち → 未サインイン(/) → メール未確認(/verify-email) → ペット確認待ち →
// ラベル未選択(/onboarding) → 本体。リダイレクト保留中は children を描画しない。
export default function AppGuard({ children }: { children: ReactNode }) {
  const { auth, authLoading, pet, petResolved, labelsChosen } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  let redirect: string | null = null;
  if (!authLoading && auth && auth.configured) {
    if (!auth.signedIn) {
      redirect = '/';
    } else if (!auth.emailVerified) {
      redirect = '/verify-email';
    } else if (petResolved && pet === null && !labelsChosen) {
      // QRトークン経由の交流フローはオンボーディング対象外（そのまま exchange へ）。
      const isQrEntry = pathname === '/exchange' && peekPendingExchangeToken() !== null;
      if (!isQrEntry) redirect = '/onboarding';
    }
  }

  useEffect(() => {
    if (!redirect) return;
    if (redirect === '/') {
      // 未ログインで /exchange?exchangeToken=... を直接開いた場合、ログイン後に
      // 交流へ戻れるようトークンを退避してから入口へ戻す。
      const token = new URLSearchParams(window.location.search).get('exchangeToken');
      if (token) stashPendingExchangeToken(token);
    }
    router.replace(redirect);
  }, [redirect, router]);

  if (authLoading) return <AuthLoadingScreen />;
  // Firebase 未設定のローカルモード（または auth 未確定）は従来どおり本体へ通す。
  if (!auth || !auth.configured) return <>{children}</>;
  if (redirect) return <AuthLoadingScreen />;
  // 既存ペットの有無を確認し終えるまで、オンボーディング判定を保留する。
  if (!petResolved) return <AuthLoadingScreen />;
  return <>{children}</>;
}
