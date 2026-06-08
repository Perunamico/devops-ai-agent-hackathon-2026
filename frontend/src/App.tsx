'use client';

import { createContext, useContext, useState } from 'react';
import type { PetResponse } from './types';
import SetupScreen from './screens/SetupScreen';
import HomeScreen from './screens/HomeScreen';
import ReviewScreen from './screens/ReviewScreen';
import ExchangeScreen from './screens/ExchangeScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import ReportScreen from './screens/ReportScreen';
import PetExchangeScreen from './screens/PetExchangeScreen';

type Screen = 'setup' | 'home' | 'review' | 'exchange' | 'analysis' | 'report' | 'petexchange';

interface AppCtx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  pet: PetResponse | null;
  setPet: (p: PetResponse | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;
  showExchangeConfirm: boolean;
  setShowExchangeConfirm: (v: boolean) => void;
}

export const AppContext = createContext<AppCtx>({
  screen: 'setup',
  setScreen: () => {},
  pet: null,
  setPet: () => {},
  sessionId: null,
  setSessionId: () => {},
  analysisId: null,
  setAnalysisId: () => {},
  showExchangeConfirm: false,
  setShowExchangeConfirm: () => {},
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
  const { screen, setScreen, setShowExchangeConfirm } = useApp();

  if (screen !== 'home') {
    return (
      <nav className="fixed top-0 left-0 right-0 bg-white flex items-center px-4 z-50 max-w-md mx-auto h-14">
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
    <nav className="fixed top-0 left-0 right-0 bg-white flex gap-2 px-3 py-2 z-50 max-w-md mx-auto h-20">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.screen}
          onClick={() => {
            if (item.screen === 'petexchange') setShowExchangeConfirm(true);
            else if (item.screen === 'exchange') setScreen('petexchange');
            else setScreen(item.screen);
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-white rounded-2xl transition-all"
        >
          <img src={item.iconImg} className="w-8 h-8 object-contain" alt={item.label} />
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
  const [screen, setScreen] = useState<Screen>(hasQrToken ? 'exchange' : 'setup');
  const [pet, setPet] = useState<PetResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [showExchangeConfirm, setShowExchangeConfirm] = useState(false);

  const ctx: AppCtx = {
    screen, setScreen,
    pet, setPet,
    sessionId, setSessionId,
    analysisId, setAnalysisId,
    showExchangeConfirm, setShowExchangeConfirm,
  };

  function handleExchangeConfirmYes() {
    setShowExchangeConfirm(false);
    setScreen('exchange');
  }

  function renderScreen() {
    switch (screen) {
      case 'setup': return <SetupScreen />;
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
        {screen !== 'setup' && <TopNav />}
        <div className={screen === 'setup' ? '' : screen === 'home' ? 'pt-20' : 'pt-14'}>
          {renderScreen()}
        </div>

        {/* 交流確認モーダル（ホーム画面からのポップ）*/}
        {showExchangeConfirm && (
          <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
              <div className="text-center space-y-2">
                <div className="text-4xl">🐾</div>
                <h2 className="text-lg font-bold text-gray-900">お相手のペットと交流を開始しますか？</h2>
                <p className="text-sm text-gray-500">マイクを使って近くのペットを探します</p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleExchangeConfirmYes}
                  className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
                >
                  はい
                </button>
                <button
                  onClick={() => setShowExchangeConfirm(false)}
                  className="w-full text-gray-500 text-sm py-2"
                >
                  いいえ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
