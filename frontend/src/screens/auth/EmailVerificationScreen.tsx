'use client';

import { useEffect, useRef, useState } from 'react';
import {
  reloadCurrentUser,
  resendVerificationEmail,
  signOutUser,
  type AuthState,
} from '../../firebase';
import { AuthShell, authErrorMessage } from './shared';

export default function EmailVerificationScreen({ auth, onVerified }: { auth: AuthState; onVerified: (state: AuthState) => void }) {
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pollingRef = useRef(false);

  // メール内のリンクを開いたら自動で本体へ進める。数秒おきに静かに確認するだけで、
  // ユーザーが手動で「確認できた」と申告する必要はない。
  useEffect(() => {
    const interval = setInterval(async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const state = await reloadCurrentUser();
        if (state.emailVerified) onVerified(state);
      } catch {
        // 一時的な通信エラーは無視し、次のポーリングに任せる。
      } finally {
        pollingRef.current = false;
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [onVerified]);

  async function handleResendVerification() {
    if (resending) return;
    setResending(true);
    setError('');
    setNotice('');
    try {
      await resendVerificationEmail();
      setNotice('確認メールを再送しました。');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell>
      <div className="space-y-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16v12H4z" stroke="#0284c7" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="m4 7 8 6 8-6" stroke="#0284c7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">確認メールを送信しました</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {auth.email ?? '登録したメールアドレス'} 宛に確認メールを送りました。メール内のリンクを開くと、このまま自動で続きに進みます。
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            メールが迷惑メールに振り分けられることがあります。届かない場合は迷惑メールフォルダをご確認ください。
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-sky-500 animate-spin" />
          確認を待っています…
        </div>

        <button
          type="button"
          onClick={handleResendVerification}
          disabled={resending}
          className="w-full h-14 rounded-full bg-gray-100 text-gray-900 font-bold border border-gray-200 disabled:text-gray-400"
        >
          {resending ? '送信中...' : '確認メールを再送'}
        </button>

        <div className="min-h-[24px] text-sm leading-relaxed">
          {error && <p className="text-red-500">{error}</p>}
          {notice && <p className="text-gray-500">{notice}</p>}
        </div>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="text-sm font-bold text-sky-600"
        >
          別のアカウントでログイン
        </button>
      </div>
    </AuthShell>
  );
}
