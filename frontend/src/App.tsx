import { createContext, useContext, useState } from 'react';
import type { PetResponse } from './types';
import SetupScreen from './screens/SetupScreen';
import HomeScreen from './screens/HomeScreen';
import ReviewScreen from './screens/ReviewScreen';
import ExchangeScreen from './screens/ExchangeScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import ReportScreen from './screens/ReportScreen';

type Screen = 'setup' | 'home' | 'review' | 'exchange' | 'analysis' | 'report';

interface AppCtx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  pet: PetResponse | null;
  setPet: (p: PetResponse | null) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;
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
});

export function useApp() {
  return useContext(AppContext);
}

const NAV_ITEMS: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'home', label: 'ホーム', icon: '🏠' },
  { screen: 'review', label: '確認', icon: '🔔' },
  { screen: 'exchange', label: '交換', icon: '🐾' },
  { screen: 'report', label: 'レポート', icon: '📄' },
];

function BottomNav() {
  const { screen, setScreen } = useApp();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50 max-w-md mx-auto">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.screen}
          onClick={() => setScreen(item.screen)}
          className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs transition-colors
            ${screen === item.screen ? 'text-violet-600 font-semibold' : 'text-gray-400'}`}
        >
          <span className="text-lg leading-none">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [pet, setPet] = useState<PetResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const ctx: AppCtx = {
    screen, setScreen,
    pet, setPet,
    sessionId, setSessionId,
    analysisId, setAnalysisId,
  };

  function renderScreen() {
    switch (screen) {
      case 'setup': return <SetupScreen />;
      case 'home': return <HomeScreen />;
      case 'review': return <ReviewScreen />;
      case 'exchange': return <ExchangeScreen />;
      case 'analysis': return <AnalysisScreen />;
      case 'report': return <ReportScreen />;
    }
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="max-w-md mx-auto min-h-svh relative bg-white shadow-sm">
        <div className={screen !== 'setup' ? 'pb-16' : ''}>
          {renderScreen()}
        </div>
        {screen !== 'setup' && <BottomNav />}
      </div>
    </AppContext.Provider>
  );
}
