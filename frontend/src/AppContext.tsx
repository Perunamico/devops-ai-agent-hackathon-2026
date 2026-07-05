'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PetResponse, SelectedLabel } from './types';
import { getCurrentPet } from './api';
import {
  reloadCurrentUser,
  signOutUser,
  subscribeAuthState,
  type AuthState,
} from './firebase';

type ExchangeSetupStep = null | 'mic' | 'requesting_mic' | 'volume';

interface AppCtx {
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
  // --- 認証 / ルートガード用の状態 ---
  auth: AuthState | null;
  authLoading: boolean;
  // 確認待ち画面がポーリングで取得した最新の AuthState を反映するために公開する。
  setAuth: (state: AuthState) => void;
  // 既存ペットの有無を確認し終えたか。確認前はオンボーディング判定を保留する。
  petResolved: boolean;
  // 名付け前のラベル選択が済んだか。
  labelsChosen: boolean;
  setLabelsChosen: (v: boolean) => void;
  // メールのリンク経由（?relogin=verify|reset）で開いたときの案内文。
  // 非 null の間はログイン画面から始める。
  reloginNotice: string | null;
}

export const AppContext = createContext<AppCtx>({
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
  auth: null,
  authLoading: true,
  setAuth: () => {},
  petResolved: false,
  labelsChosen: false,
  setLabelsChosen: () => {},
  reloginNotice: null,
});

export function useApp() {
  return useContext(AppContext);
}

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

// ルート layout にマウントする Provider。ページ間のクライアント遷移では再マウントされないため、
// pet / sessionId / analysisId / petBubble などの画面横断 state はここに置くことで生存する。
export function AppProvider({ initialPet = null, children }: { initialPet?: PetResponse | null; children: ReactNode }) {
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
  const [labelsChosen, setLabelsChosen] = useState(initialPet !== null);
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
  }, [initialPet]);

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
  }, [auth, initialPet]);

  const ctx: AppCtx = {
    pet, setPet,
    sessionId, setSessionId,
    analysisId, setAnalysisId,
    exchangeSetupStep, setExchangeSetupStep,
    homeLoading, setHomeLoading,
    naming, setNaming,
    reviewCount, setReviewCount,
    petBubble, setPetBubble,
    selectedLabels, setSelectedLabels,
    interactionActive, setInteractionActive,
    auth,
    authLoading,
    setAuth,
    petResolved,
    labelsChosen, setLabelsChosen,
    reloginNotice,
  };

  return <AppContext.Provider value={ctx}>{children}</AppContext.Provider>;
}
