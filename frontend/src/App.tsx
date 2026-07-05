'use client';

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { PetResponse, SelectedLabel } from './types';
import { getCurrentPet } from './api';
import {
  createAccountWithEmail,
  reloadCurrentUser,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmail,
  signOutUser,
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
import LabelSelectScreen from './screens/LabelSelectScreen';
import LandingScreen from './screens/LandingScreen';

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
  // 名付け前のラベル選択で選んだ「好きなもの」。命名完了(createPet)後に登録するため保持する。
  selectedLabels: SelectedLabel[];
  setSelectedLabels: (v: SelectedLabel[]) => void;
  // 交流成立中(session_active)フラグ。true の間は上部ホーム戻りバーを隠す（Issue #103）。
  interactionActive: boolean;
  setInteractionActive: (v: boolean) => void;
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
  selectedLabels: [],
  setSelectedLabels: () => {},
  interactionActive: false,
  setInteractionActive: () => {},
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
  const { screen, setScreen, setExchangeSetupStep, homeLoading, naming, reviewCount, interactionActive } = useApp();

  if (homeLoading || naming) return null;

  // 交流成立中はホームへの戻りバーを出さない（Issue #103）。バイバイで終える導線に一本化する。
  if (interactionActive) return null;

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
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-white border border-gray-200 shadow-sm rounded-2xl transition-all"
        >
          <div className="relative">
            <img src={item.iconImg} className="w-8 h-8 object-contain" alt={item.label} />
            {item.screen === 'review' && reviewCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  padding: '0 2px',
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#fff',
                  background: '#4670e6',
                }}
              >
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

type AuthView = 'landing' | 'signin' | 'signup' | 'reset';

// 確認/再設定メールの continue URL に付く ?relogin=verify|reset を読み取り、URL から除去する。
// リロードや履歴共有で強制サインアウトが再発火しないよう、読み取りと同時に消す。
function consumeReloginParam(): 'verify' | 'reset' | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const mode = url.searchParams.get('relogin');
  if (mode !== 'verify' && mode !== 'reset') return null;
  url.searchParams.delete('relogin');
  const query = url.searchParams.toString();
  window.history.replaceState(null, '', url.pathname + (query ? `?${query}` : ''));
  return mode;
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}

function AuthScreen({ initialView = 'landing', initialNotice = '' }: { initialView?: AuthView; initialNotice?: string } = {}) {
  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice);

  function moveTo(nextView: AuthView) {
    setView(nextView);
    setError('');
    setNotice('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (view === 'signup') {
        await createAccountWithEmail(email.trim(), password);
        setNotice('確認メールを送信しました。メール内のリンクを開いてから続けてください。');
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

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

  if (view === 'landing') {
    return (
      <LandingScreen
        onSignup={() => moveTo('signup')}
        onLogin={() => moveTo('signin')}
      />
    );
  }

  if (view === 'reset') {
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
            className="w-full bg-gray-100 rounded-full px-5 py-4 border border-gray-200 outline-none text-base text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white"
            required
          />

          <button
            type="submit"
            disabled={!email.trim() || resetting}
            className="w-full h-14 rounded-full bg-violet-600 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {resetting ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : '再設定メールを送る'}
          </button>

          <div className="min-h-[52px] text-center text-sm leading-relaxed">
            {error && <p className="text-red-500">{error}</p>}
            {notice && <p className="text-gray-500">{notice}</p>}
          </div>

          <button
            type="button"
            onClick={() => moveTo('signin')}
            className="w-full text-sm font-bold text-violet-600"
          >
            ログインに戻る
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-bold text-gray-900">{view === 'signup' ? '新規登録' : 'ログイン'}</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {view === 'signup' ? 'メール確認後にペットの登録へ進めます。' : '登録したメールアドレスで続けます。'}
          </p>
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
            autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
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
          {submitting ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : view === 'signup' ? '登録する' : 'ログインする'}
        </button>

        <div className="min-h-[52px] text-center text-sm leading-relaxed">
          {error && <p className="text-red-500">{error}</p>}
          {notice && <p className="text-gray-500">{notice}</p>}
          {view === 'signin' && (
            <button
              type="button"
              onClick={() => moveTo('reset')}
              disabled={resetting}
              className="mt-2 text-xs font-bold text-violet-600 disabled:text-gray-300"
            >
              パスワードを忘れた場合
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 text-sm font-bold text-violet-600">
          <button
            type="button"
            onClick={() => moveTo(view === 'signup' ? 'signin' : 'signup')}
          >
            {view === 'signup' ? 'ログインへ' : '新規登録へ'}
          </button>
          <button type="button" onClick={() => moveTo('landing')}>
            最初に戻る
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

function EmailVerificationScreen({ auth, onVerified }: { auth: AuthState; onVerified: (state: AuthState) => void }) {
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleCheckVerified() {
    if (checking) return;
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const state = await reloadCurrentUser();
      onVerified(state);
      if (!state.emailVerified) {
        setNotice('まだ確認が完了していません。メール内のリンクを開いてからもう一度確認してください。');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

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
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">メールを確認してください</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            {auth.email ?? '登録メールアドレス'} の確認がまだ完了していません。登録時に届いた確認メールのリンクを開いてから、「確認できたので続ける」を押してください。
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            メールが迷惑メールに振り分けられることがあります。届かない場合は迷惑メールフォルダをご確認ください。
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCheckVerified}
            disabled={checking}
            className="w-full h-14 rounded-full bg-violet-600 text-white font-bold disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {checking ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : '確認できたので続ける'}
          </button>
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={resending}
            className="w-full h-14 rounded-full bg-gray-100 text-gray-900 font-bold border border-gray-200 disabled:text-gray-400"
          >
            {resending ? '送信中...' : '確認メールを再送'}
          </button>
        </div>

        <div className="min-h-[52px] text-sm leading-relaxed">
          {error && <p className="text-red-500">{error}</p>}
          {notice && <p className="text-gray-500">{notice}</p>}
        </div>

        <button
          type="button"
          onClick={() => void signOutUser()}
          className="text-sm font-bold text-violet-600"
        >
          別のアカウントでログイン
        </button>
      </div>
    </AuthShell>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="min-h-svh bg-white flex items-center justify-center">
      <span className="w-10 h-10 rounded-full border-4 border-violet-200 border-t-violet-500 animate-spin" />
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
  const [selectedLabels, setSelectedLabels] = useState<SelectedLabel[]>([]);
  const [interactionActive, setInteractionActive] = useState(false);
  // 名付け前のラベル選択が済んだか。pet が未作成のとき、まずラベル選択を出す。
  const [labelsChosen, setLabelsChosen] = useState(initialPet !== null);
  // 既存ペットの有無を確認し終えるまで、名付け前オンボーディングを出さない。
  const [petResolved, setPetResolved] = useState(initialPet !== null);
  const [auth, setAuth] = useState<AuthState | null>(initialPet ? {
    configured: false,
    signedIn: true,
    uid: initialPet.user_id,
    isAnonymous: false,
    email: null,
    emailVerified: true,
  } : null);
  const [authLoading, setAuthLoading] = useState(!initialPet);
  // メールのリンク経由（?relogin=verify|reset）で開いたときの案内文。
  // 非 null の間は AuthScreen をログイン画面から開始する。
  const [reloginNotice, setReloginNotice] = useState<string | null>(null);
  // サインインごとに一度だけ、未確認判定を出す前のサーバ再取得を行うためのフラグ。
  const verifyRecheckedRef = useRef(false);

  useEffect(() => {
    if (initialPet) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const start = async () => {
      // 確認/再設定メールのリンク経由（?relogin=...）では、ブラウザにキャッシュされた
      // セッション（別アカウントの可能性がある）を信用せず、必ずサインアウトして
      // ログインからやり直させる。パラメータはリロードで再発火しないよう即座に消す。
      const relogin = consumeReloginParam();
      if (relogin) {
        await signOutUser();
        if (cancelled) return;
        setReloginNotice(relogin === 'verify'
          ? 'メールの確認ができたら、登録したメールアドレスでログインしてください。'
          : 'パスワードを再設定したら、新しいパスワードでログインしてください。');
      }
      if (cancelled) return;

      unsubscribe = subscribeAuthState((state) => {
        if (state.signedIn && !state.emailVerified && !verifyRecheckedRef.current) {
          // キャッシュされたユーザーの emailVerified は古いことがある（別セッション/前回訪問で
          // 確認済みでも false のまま）。確認待ち画面を出す前に一度だけサーバから取り直す。
          // 確認済みだった場合は reloadCurrentUser が ID トークンも強制更新する。
          verifyRecheckedRef.current = true;
          reloadCurrentUser()
            .then((fresh) => setAuth(fresh))
            .catch(() => setAuth(state))
            .finally(() => setAuthLoading(false));
          return;
        }
        setAuth(state);
        setAuthLoading(false);
        if (state.signedIn) {
          // ログインし直したら案内は役目を終える（次回の手動ログアウトで landing に戻す）。
          setReloginNotice(null);
        } else {
          // 次のサインインでも未確認判定の取り直しが効くようにリセットする。
          verifyRecheckedRef.current = false;
          setPet(null);
          setPetBubble(null);
          setPetResolved(false);
          setReviewCount(0);
          setScreen('home');
          // サインアウト時はラベル選択オンボーディングもリセットする。
          setLabelsChosen(false);
          setSelectedLabels([]);
        }
      });
    };
    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [initialPet, setPetBubble]);

  useEffect(() => {
    if (initialPet || !auth || !auth.configured || !auth.signedIn || !auth.emailVerified) return;
    let cancelled = false;
    setPetResolved(false);
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
        if (!cancelled) {
          setPetResolved(true);
          setHomeLoading(false);
        }
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
    selectedLabels, setSelectedLabels,
    interactionActive, setInteractionActive,
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

  // 名付け前のオンボーディング: 好きなものラベルの選択。pet 未作成かつ未選択のとき表示する。
  // QRトークンから来た交流フローは対象外（そのまま exchange へ）。
  // 既存ペット取得前は判定を保留し、オンボーディングのちらつきを防ぐ。
  const shouldWaitForPet = Boolean(!initialPet && auth?.configured && auth.signedIn && auth.emailVerified && !petResolved);
  const showLabelOnboarding = petResolved && pet === null && !labelsChosen && !hasQrToken && !homeLoading;

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
  if (!initialPet && auth?.configured && !auth.signedIn) {
    // メールのリンク経由で来たときは LP を飛ばしてログイン画面から始める。
    return (
      <AuthScreen
        key={reloginNotice ?? 'default'}
        initialView={reloginNotice ? 'signin' : 'landing'}
        initialNotice={reloginNotice ?? ''}
      />
    );
  }
  if (!initialPet && auth?.configured && auth.signedIn && !auth.emailVerified) {
    return <EmailVerificationScreen auth={auth} onVerified={setAuth} />;
  }
  if (shouldWaitForPet) return <AuthLoadingScreen />;
  if (showLabelOnboarding) {
    return (
      <AppContext.Provider value={ctx}>
        <div className="app-shell">
          <LabelSelectScreen
            initial={selectedLabels}
            mode="onboarding"
            onDone={(labels) => {
              setSelectedLabels(labels);
              setLabelsChosen(true);
            }}
          />
        </div>
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
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
