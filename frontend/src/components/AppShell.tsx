'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from '../AppContext';
import TopNav, { isHomePath } from './TopNav';

// アプリ本体の共通枠。app-shell / TopNav / マイク・音量ポップアップを
// (app) ルートグループの layout として全画面で共有する。
export default function AppShell({ children }: { children: ReactNode }) {
  const { exchangeSetupStep, setExchangeSetupStep, homeLoading } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const isHome = isHomePath(pathname);

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
    router.push('/exchange');
  }

  return (
    <div className="app-shell">
      <TopNav />
      <div className={(isHome && homeLoading) ? 'app-content' : isHome ? 'app-content nav-bottom' : 'app-content nav-sub-bottom'}>

        {children}
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
  );
}
