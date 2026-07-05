'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../src/AppContext';
import { resolvePostAuthPath, stashPendingExchangeToken } from '../src/lib/postAuth';
import LandingScreen from '../src/screens/LandingScreen';
import { AuthLoadingScreen } from '../src/screens/auth/shared';

// エントリの振り分けページ。未ログインなら LP を表示し、ログイン済みなら本体へ送る。
// バックエンド発行のQR URL（/?exchangeToken=...）とメールリンク（/?relogin=...）の受け口でもある。
// ?relogin は AppProvider の初期化処理が消費して reloginNotice に変換する。
export default function Page() {
  const { auth, authLoading, reloginNotice } = useApp();
  const router = useRouter();

  // QRトークンはログイン導線をまたいで失われないよう、最初の描画時に退避する。
  useState(() => {
    if (typeof window !== 'undefined') {
      const token = new URLSearchParams(window.location.search).get('exchangeToken');
      if (token) stashPendingExchangeToken(token);
    }
    return null;
  });

  const destination = authLoading || !auth
    ? null
    : !auth.configured
      ? '/home'
      : auth.signedIn
        ? (auth.emailVerified ? 'post-auth' : '/verify-email')
        : reloginNotice
          ? '/signin' // メールのリンク経由で来たときは LP を飛ばしてログイン画面から始める。
          : null;

  useEffect(() => {
    if (!destination) return;
    // resolvePostAuthPath は保留中の交流トークンを消費するため、遷移時のみ呼ぶ。
    router.replace(destination === 'post-auth' ? resolvePostAuthPath() : destination);
  }, [destination, router]);

  if (authLoading || destination) return <AuthLoadingScreen />;
  return (
    <LandingScreen
      onSignup={() => router.push('/signup')}
      onLogin={() => router.push('/signin')}
    />
  );
}
