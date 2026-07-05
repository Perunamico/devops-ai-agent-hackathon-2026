'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  consumeGoogleRedirectDiagnostic,
  createAccountWithEmail,
  signInWithEmail,
  signInWithGoogle,
} from '../../firebase';
import { useApp } from '../../AppContext';
import { AuthShell, GoogleIcon, authErrorMessage } from './shared';

// ログイン / 新規登録フォーム。旧 AuthScreen の signin/signup ビューを mode prop で分離した。
export default function EmailAuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const { reloginNotice } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState('');
  // メールリンク経由（?relogin=...）で来たときはログイン画面に案内文を出す。
  const [notice, setNotice] = useState(mode === 'signin' ? (reloginNotice ?? '') : '');

  // Google の signInWithRedirect でこのページに戻ってきた直後、一度だけ結果を確認する。
  // 成功時は subscribeAuthState 側で自然に進むので、ここでは失敗時のみ扱う。
  // 「no-user」は authDomain とホスティングのドメインが異なる環境（iOS Safari 等）で
  // 実際に起こりうる既知の失敗パターンで、他の想定外エラーと同じ扱いにする。
  useEffect(() => {
    let cancelled = false;
    consumeGoogleRedirectDiagnostic().then((diag) => {
      if (cancelled || diag.status === 'skipped' || diag.status === 'signed-in') return;
      if (diag.status === 'error') console.warn('Google redirect sign-in failed.', diag.code);
      setError('Googleでのログインに失敗しました。時間をおいてもう一度お試しください。');
    });
    return () => { cancelled = true; };
  }, []);

  async function handleGoogleSignIn() {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    setError('');
    setNotice('');
    try {
      // ページ遷移するため、通常はここで戻ってこない（成功時は Google の画面へ移動する）。
      await signInWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signup') {
        await createAccountWithEmail(email.trim(), password);
        setNotice('確認メールを送信しました。メール内のリンクを開いてから続けてください。');
      } else {
        await signInWithEmail(email.trim(), password);
        // 成功後は PublicOnly のリダイレクトが本体へ進める。
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-bold text-gray-900">{mode === 'signup' ? '新規登録' : 'ログイン'}</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {mode === 'signup' ? 'メール確認後にペットの登録へ進めます。' : '登録したメールアドレスで続けます。'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={googleSubmitting}
          className="w-full h-14 rounded-full border border-gray-200 bg-white text-gray-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {googleSubmitting ? (
            <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
          ) : (
            <>
              <GoogleIcon />
              Googleで続ける
            </>
          )}
        </button>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          または
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="w-full bg-gray-100 rounded-full px-5 py-4 border border-gray-200 outline-none text-base text-gray-700 placeholder-gray-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white"
            required
          />
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            className="w-full bg-gray-100 rounded-full px-5 py-4 border border-gray-200 outline-none text-base text-gray-700 placeholder-gray-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white"
            minLength={6}
            required
          />
        </div>

        <button
          type="submit"
          disabled={!email.trim() || password.length < 6 || submitting}
          className="w-full h-14 rounded-full bg-sky-600 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {submitting ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : mode === 'signup' ? '登録する' : 'ログインする'}
        </button>

        <div className="min-h-[52px] text-center text-sm leading-relaxed">
          {error && <p className="text-red-500">{error}</p>}
          {notice && <p className="text-gray-500">{notice}</p>}
          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => router.push('/reset')}
              className="mt-2 text-xs font-bold text-sky-600"
            >
              パスワードを忘れた場合
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-sm font-bold">
          <button
            type="button"
            onClick={() => router.push(mode === 'signup' ? '/signin' : '/signup')}
            className="text-sky-600"
          >
            {mode === 'signup' ? 'ログインへ' : '新規登録へ'}
          </button>
          <button type="button" onClick={() => router.push('/')} className="text-sky-600">
            最初に戻る
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
