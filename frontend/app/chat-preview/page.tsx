'use client';

// チャット画面（active フェーズ）だけを単独で確認するためのプレビュールート。
// 既存のアプリ本体（命名→ホーム→各画面）には一切影響しない。
// バックエンドやペット作成なしで http://localhost:3000/chat-preview を開けば、
// マイクボタン付きのチャット入力欄をそのまま目視確認できる。
//
// 仕組み: HomeScreen は phase = pet ? 'active' : 'naming' で初期化されるため、
// ダミーの非 null pet を入れた AppContext.Provider で包むと active 表示になる。
// HomeScreen 本体は改変しない。
import { useState } from 'react';
import { AppContext } from '../../src/App';
import HomeScreen from '../../src/screens/HomeScreen';
import type { PetResponse } from '../../src/types';

const dummyPet: PetResponse = {
  pet_id: 'preview-pet',
  user_id: 'preview-user',
  name: 'プレビュー',
  personality: '元気で友好的',
  tone: '自然体でカジュアル',
  created_at: new Date().toISOString(),
};

export default function ChatPreviewPage() {
  const [pet, setPet] = useState<PetResponse | null>(dummyPet);
  const [reviewCount, setReviewCount] = useState(0);
  const [homeLoading, setHomeLoading] = useState(false);

  const ctx = {
    screen: 'home' as const,
    setScreen: () => {},
    pet,
    setPet,
    sessionId: null,
    setSessionId: () => {},
    analysisId: null,
    setAnalysisId: () => {},
    exchangeSetupStep: null,
    setExchangeSetupStep: () => {},
    homeLoading,
    setHomeLoading,
    naming: false,
    setNaming: () => {},
    reviewCount,
    setReviewCount,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="max-w-md mx-auto min-h-svh bg-white">
        <HomeScreen />
      </div>
    </AppContext.Provider>
  );
}
