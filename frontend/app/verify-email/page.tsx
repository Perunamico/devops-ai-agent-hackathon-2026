'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../src/AppContext';
import { resolvePostAuthPath } from '../../src/lib/postAuth';
import EmailVerificationScreen from '../../src/screens/auth/EmailVerificationScreen';
import { AuthLoadingScreen } from '../../src/screens/auth/shared';

export default function Page() {
  const { auth, authLoading, setAuth } = useApp();
  const router = useRouter();

  const destination = authLoading || !auth
    ? null
    : !auth.configured
      ? '/home'
      : !auth.signedIn
        ? '/'
        : auth.emailVerified
          ? 'post-auth'
          : null;

  useEffect(() => {
    if (!destination) return;
    // resolvePostAuthPath は保留中の交流トークンを消費するため、遷移時のみ呼ぶ。
    router.replace(destination === 'post-auth' ? resolvePostAuthPath() : destination);
  }, [destination, router]);

  if (authLoading || !auth || destination) return <AuthLoadingScreen />;
  return <EmailVerificationScreen auth={auth} onVerified={setAuth} />;
}
