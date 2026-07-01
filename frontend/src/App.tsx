'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { PetResponse } from './types';
import { getCurrentPet } from './api';
import {
  createAccountWithEmail,
  resendVerificationEmail,
  signInWithEmail,
  subscribeAuthState,
  type AuthState,
} from './firebase';
import HomeScreen from './screens/HomeScreen';
import ReviewScreen from './screens/ReviewScreen';
import ExchangeScreen from './screens/ExchangeScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import ReportScreen from './screens/ReportScreen';
import PetExchangeScreen from './screens/PetExchangeScreen';
import FriendsScreen from './screens/FriendsScreen';
import SettingsScreen from './screens/SettingsScreen';

type Screen = 'home' | 'review' | 'exchange' | 'analysis' | 'report' | 'petexchange' | 'friends' | 'settings';
type ExchangeSetupStep = null | 'mic' | 'requesting_mic' | 'volume';

interface AppCtx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  pet: PetResponse | null;
  setPet: (p: PetResponse | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;
  exchangeSetupStep: ExchangeSetupStep;
  setExchangeSetupStep: (step: ExchangeSetupStep) => void;
  homeLoading: boolean;
  setHomeLoading: (v: boolean) => void;
  naming: boolean;
  setNaming: (v: boolean) => void;
  reviewCount: number;
  setReviewCount: (n: number) => void;
  // ペットの直近の返答。ホーム離脱→復帰で HomeScreen が再マウントされても保持するため
  // AppContext に置く（ローカル state だと戻るたびに初期挨拶へ戻ってしまう）。
  petBubble: string | null;
  setPetBubble: (v: string | null) => void;
}

export const AppContext = createContext<AppCtx>({
  screen: 'home',
  setScreen: () => {},
  pet: null,
  setPet: () => {},
  sessionId: null,
  setSessionId: () => {},
  analysisId: null,
  setAnalysisId: () => {},
  exchangeSetupStep: null,
  setExchangeSetupStep: () => {},
  homeLoading: false,
  setHomeLoading: () => {},
  naming: false,
  setNaming: () => {},
  reviewCount: 0,
  setReviewCount: () => {},
  petBubble: null,
  setPetBubble: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

const NAV_ITEMS: { screen: Screen; label: string; iconImg: string }[] = [
  { screen: 'petexchange', label: 'あそぶ',   iconImg: '/icons/interact.png' },
  { screen: 'friends',     label: 'ともだち', iconImg: '/icons/friends.png'  },
  { screen: 'review',      label: 'ひみつ',   iconImg: '/icons/secrets.png'  },
  { screen: 'settings',    label: '設定',     iconImg: '/icons/settings.png' },
];

function TopNav() {
  const { screen, setScreen, setExchangeSetupStep, homeLoading, naming, reviewCount } = useApp();

  if (homeLoading || naming) return null;

  // ホーム以外（記憶/ひみつ画面を含む）は上部にホーム戻りバーを表示する。
  if (screen !== 'home') {
    return (
      <nav className="side-nav side-nav--sub" style={{ willChange: 'transform' }}>
        <button
          onClick={() => setScreen('home')}
          className="flex items-center gap-1.5 text-gray-900 text-sm font-medium"
        >
          <img src="/icons/home.png" className="w-10 h-10 object-contain" alt="" />
          ホーム
        </button>
      </nav>
    );
  }

  return (
    <nav className="side-nav side-nav--home" style={{ willChange: 'transform' }}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.screen}
          onClick={() => {
            if (item.screen === 'petexchange') setExchangeSetupStep('mic');
            else setScreen(item.screen);
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-gray-50 border border-gray-200 shadow-sm rounded-2xl transition-all"
        >
          <div className="relative">
            <img src={item.iconImg} className="w-8 h-8 object-contain" alt={item.label} />
            {item.screen === 'review' && reviewCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {reviewCount}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function authErrorMessage(error: unknown): string {
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
  return '処理に失敗しました。時間をおいてもう一度試してください。';
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signup') {
        await createAccountWithEmail(email.trim(), password);
        setNotice('確認メールを送信しました。');
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-svh bg-white flex items-center justify-center px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-bold text-gray-900">おかえりなさい</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            ペットの名前や記憶をあなたのアカウントに保存します。
          </p>
        </div>

        <div className="flex rounded-full bg-gray-100 p-1 border border-gray-200">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError('');
              setNotice('');
            }}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
              setNotice('');
            }}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            新規登録
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="w-full bg-gray-100 rounded-full px-5 py-4 border border-gray-200 outline-none text-base text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white"
            required
          />
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            className="w-full bg-gray-100 rounded-full px-5 py-4 border border-gray-200 outline-none text-base text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white"
            minLength={6}
            required
          />
        </div>

        <button
          type="submit"
          disabled={!email.trim() || password.length < 6 || submitting}
          className="w-full h-14 rounded-full bg-violet-600 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {submitting ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : mode === 'signup' ? '登録する' : 'ログインする'}
        </button>

        <div className="min-h-[44px] text-center text-sm leading-relaxed">
          {error && <p className="text-red-500">{error}</p>}
          {notice && <p className="text-gray-500">{notice}</p>}
        </div>
      </form>
    </div>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center">
      <span className="w-10 h-10 rounded-full border-4 border-violet-200 border-t-violet-500 animate-spin" />
    </div>
  );
}

function VerifyNotice({ auth }: { auth: AuthState }) {
  const [sent, setSent] = useState(false);

  if (!auth.signedIn || auth.emailVerified) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-[80] rounded-2xl bg-white border border-violet-100 shadow-lg px-4 py-3 flex items-center gap-3">
      <p className="flex-1 text-xs text-gray-600 leading-relaxed">
        確認メールを送信済みです。届いていない場合は再送できます。
      </p>
      <button
        type="button"
        onClick={() => {
          resendVerificationEmail()
            .then(() => setSent(true))
            .catch(() => setSent(false));
        }}
        className="text-xs font-bold text-violet-600 whitespace-nowrap"
      >
        {sent ? '送信済み' : '再送'}
      </button>
    </div>
  );
}

export default function App({ initialPet = null }: { initialPet?: PetResponse | null } = {}) {
  const hasQrToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).has('exchangeToken')
    : false;
  const [screen, setScreen] = useState<Screen>(hasQrToken ? 'exchange' : 'home');
  // 通常は null（命名フローから開始）。プレビュー等で初期ペットを渡すと active ホームから始まる。
  const [pet, setPet] = useState<PetResponse | null>(initialPet);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [exchangeSetupStep, setExchangeSetupStep] = useState<ExchangeSetupStep>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [naming, setNaming] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [petBubble, setPetBubble] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(initialPet ? {
    configured: false,
    signedIn: true,
    uid: initialPet.user_id,
    isAnonymous: false,
    email: null,
    emailVerified: true,
  } : null);
  const [authLoading, setAuthLoading] = useState(!initialPet);

  useEffect(() => {
    if (initialPet) return;
    return subscribeAuthState((state) => {
      setAuth(state);
      setAuthLoading(false);
      if (!state.signedIn) {
        setPet(null);
        setPetBubble(null);
        setReviewCount(0);
        setScreen('home');
      }
    });
  }, [initialPet, setPetBubble]);

  useEffect(() => {
    if (initialPet || !auth || !auth.configured || !auth.signedIn) return;
    let cancelled = false;
    setHomeLoading(true);
    getCurrentPet()
      .then((currentPet) => {
        if (cancelled) return;
        setPet(currentPet);
        setPetBubble(currentPet ? `おはよう！${currentPet.name}だよ！` : null);
      })
      .catch(() => {
        if (!cancelled) setPet(null);
      })
      .finally(() => {
        if (!cancelled) setHomeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, initialPet, setHomeLoading, setPet, setPetBubble]);

  const ctx: AppCtx = {
    screen, setScreen,
    pet, setPet,
    sessionId, setSessionId,
    analysisId, setAnalysisId,
    exchangeSetupStep,
    setExchangeSetupStep,
    homeLoading, setHomeLoading,
    naming, setNaming,
    reviewCount, setReviewCount,
    petBubble, setPetBubble,
  };

  async function handleMicNext() {
    setExchangeSetupStep('requesting_mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setExchangeSetupStep('volume');
    } catch {
      setExchangeSetupStep(null);
    }
  }

  function handleVolumeStart() {
    setExchangeSetupStep(null);
    setScreen('exchange');
  }

  function renderScreen() {
    switch (screen) {
      case 'home': return <HomeScreen />;
      case 'review': return <ReviewScreen />;
      case 'exchange': return <ExchangeScreen />;
      case 'analysis': return <AnalysisScreen />;
      case 'report': return <ReportScreen />;
      case 'petexchange': return <PetExchangeScreen />;
      case 'friends': return <FriendsScreen />;
      case 'settings': return <SettingsScreen />;
    }
  }

  if (authLoading) return <AuthLoadingScreen />;
  if (!initialPet && auth?.configured && !auth.signedIn) return <AuthScreen />;

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
        {auth && <VerifyNotice auth={auth} />}
        <TopNav />
        <div className={(screen === 'home' && homeLoading) ? 'app-content' : screen === 'home' ? 'app-content nav-bottom' : 'app-content nav-top'}>

          {renderScreen()}
        </div>

        {/* マイク確認ポップ（ホーム画面上） */}
        {exchangeSetupStep === 'mic' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40" style={{ willChange: 'transform' }}>
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
              <div className="text-center space-y-2">
                <img src="/icons/mic.png" className="w-10 h-10 mx-auto object-contain" alt="" />
                <h2 className="text-lg font-bold text-gray-900">マイクをONにしてください</h2>
                <p className="text-sm text-gray-500">鳴き声を使って近くのペットを探します</p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleMicNext}
                  className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
                >
                  次へ
                </button>
                <button
                  onClick={() => setExchangeSetupStep(null)}
                  className="w-full text-gray-500 rounded-2xl py-3 font-medium text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* マイク許可確認中ポップ */}
        {exchangeSetupStep === 'requesting_mic' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40" style={{ willChange: 'transform' }}>
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex flex-col items-center gap-3">
                <img src="/icons/mic.png" className="w-10 h-10 object-contain animate-pulse" alt="" />
                <p className="text-gray-600 text-sm">マイクの許可を確認中...</p>
              </div>
            </div>
          </div>
        )}

        {/* 音量調整ポップ（ホーム画面上） */}
        {exchangeSetupStep === 'volume' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40" style={{ willChange: 'transform' }}>
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
              <div className="text-center space-y-2">
                <img src="/icons/sound.png" className="w-10 h-10 mx-auto object-contain" alt="" />
                <h2 className="text-lg font-bold text-gray-900">音量を調整してください</h2>
                <p className="text-sm text-gray-500">端末の音量を上げて、相手の端末に近づけてください</p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={handleVolumeStart}
                  className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
                >
                  OK、始める
                </button>
                <button
                  onClick={() => setExchangeSetupStep(null)}
                  className="w-full text-gray-500 rounded-2xl py-3 font-medium text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
