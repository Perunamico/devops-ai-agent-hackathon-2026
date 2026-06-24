'use client';

import { createContext, useContext, useState } from 'react';
import type { PetResponse } from './types';
import HomeScreen from './screens/HomeScreen';
import ReviewScreen from './screens/ReviewScreen';
import ExchangeScreen from './screens/ExchangeScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import ReportScreen from './screens/ReportScreen';
import PetExchangeScreen from './screens/PetExchangeScreen';

type Screen = 'home' | 'review' | 'exchange' | 'analysis' | 'report' | 'petexchange';
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
});

export function useApp() {
  return useContext(AppContext);
}

const NAV_ITEMS: { screen: Screen; label: string; iconImg: string }[] = [
  { screen: 'petexchange', label: 'ペット交流', iconImg: '/icons/interact.png' },
  { screen: 'exchange',    label: 'ペット友達', iconImg: '/icons/friends.png'  },
  { screen: 'review',      label: '飼い主の秘密', iconImg: '/icons/secrets.png'  },
  { screen: 'report',      label: '設定',       iconImg: '/icons/settings.png' },
];

function TopNav() {
  const { screen, setScreen, setExchangeSetupStep, homeLoading, naming, reviewCount } = useApp();

  if (homeLoading || naming) return null;

  if (screen !== 'home') {
    return (
      <nav className="fixed top-0 left-0 right-0 bg-white flex items-center px-4 z-50 max-w-md mx-auto h-14" style={{ willChange: 'transform' }}>
        <button
          onClick={() => setScreen('home')}
          className="flex items-center gap-1.5 text-gray-600 text-sm font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
            <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
          </svg>
          ホーム
        </button>
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white flex gap-2 px-3 py-2 z-50 max-w-md mx-auto h-20" style={{ willChange: 'transform' }}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.screen}
          onClick={() => {
            if (item.screen === 'petexchange') setExchangeSetupStep('mic');
            else if (item.screen === 'exchange') setScreen('exchange');
            else setScreen(item.screen);
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-white rounded-2xl transition-all"
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

export default function App() {
  const hasQrToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).has('exchangeToken')
    : false;
  const [screen, setScreen] = useState<Screen>(hasQrToken ? 'exchange' : 'home');
  const [pet, setPet] = useState<PetResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [exchangeSetupStep, setExchangeSetupStep] = useState<ExchangeSetupStep>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [naming, setNaming] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);

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
    }
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="max-w-md mx-auto min-h-svh relative bg-white">
        <TopNav />
        <div className={(screen === 'home' && (homeLoading || naming)) ? '' : screen === 'home' ? 'pb-20' : 'pt-14'}>

          {renderScreen()}
        </div>

        {/* マイク確認ポップ（ホーム画面上） */}
        {exchangeSetupStep === 'mic' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40" style={{ willChange: 'transform' }}>
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
              <div className="text-center space-y-2">
                <div className="text-4xl">🎤</div>
                <h2 className="text-lg font-bold text-gray-900">マイクをONにしてください</h2>
                <p className="text-sm text-gray-500">鳴き声を使って近くのペットを探します</p>
              </div>
              <button
                onClick={handleMicNext}
                className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
              >
                次へ
              </button>
            </div>
          </div>
        )}

        {/* マイク許可確認中ポップ */}
        {exchangeSetupStep === 'requesting_mic' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40" style={{ willChange: 'transform' }}>
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex flex-col items-center gap-3">
                <div className="text-4xl animate-pulse">🎤</div>
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
                <div className="text-4xl">🔊</div>
                <h2 className="text-lg font-bold text-gray-900">音量を調整してください</h2>
                <p className="text-sm text-gray-500">端末の音量を上げて、相手の端末に近づけてください</p>
              </div>
              <button
                onClick={handleVolumeStart}
                className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
              >
                OK、始める
              </button>
            </div>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
