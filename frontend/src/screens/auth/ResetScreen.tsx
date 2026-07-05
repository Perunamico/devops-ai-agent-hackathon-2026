'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendPasswordReset } from '../../firebase';
import { AuthShell, authErrorMessage } from './shared';

export default function ResetScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handlePasswordReset() {
    if (!email.trim()) {
      setError('パスワード再設定にはメールアドレスを入力してください。');
      setNotice('');
      return;
    }
    if (resetting) return;
    setResetting(true);
    setError('');
    setNotice('');
    try {
      await sendPasswordReset(email.trim());
      setNotice('パスワード再設定メールを送信しました。');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setResetting(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={(e) => {
        e.preventDefault();
        void handlePasswordReset();
      }} className="space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold text-gray-900">パスワード再設定</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            登録したメールアドレスに再設定用のメールを送ります。
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            メールが迷惑メールに振り分けられることがあります。届かない場合は迷惑メールフォルダをご確認ください。
          </p>
        </div>

        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          className="w-full bg-gray-100 rounded-full px-5 py-4 border border-gray-200 outline-none text-base text-gray-700 placeholder-gray-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white"
          required
        />

        <button
          type="submit"
          disabled={!email.trim() || resetting}
          className="w-full h-14 rounded-full bg-sky-600 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {resetting ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : '再設定メールを送る'}
        </button>

        <div className="min-h-[52px] text-center text-sm leading-relaxed">
          {error && <p className="text-red-500">{error}</p>}
          {notice && <p className="text-gray-500">{notice}</p>}
        </div>

        <button
          type="button"
          onClick={() => router.push('/signin')}
          className="w-full text-sm font-bold text-sky-600"
        >
          ログインに戻る
        </button>
      </form>
    </AuthShell>
  );
}
