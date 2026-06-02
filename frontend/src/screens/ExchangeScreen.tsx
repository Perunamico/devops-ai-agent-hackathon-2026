import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { useApp } from '../App';
import { issueToken, joinExchange, approveExchange, getAnalysis } from '../api';
import { playToken, listenForToken, type StopListening } from '../audio';
import type { ExchangeTokenResponse } from '../types';

type Step =
  | 'idle'
  | 'requesting_mic'
  | 'searching'         // 鳴き声再生＋マイク聴取中
  | 'detected'          // 相手のトークンを検出
  | 'waiting_partner'   // 自分は参加済み、相手の参加待ち
  | 'approving'         // 両者参加済み、承認待ち
  | 'waiting_analysis'  // 分析待ち
  | 'qr_fallback'       // QR例外ルート
  | 'error';

export default function ExchangeScreen() {
  const { setScreen, setSessionId, setAnalysisId } = useApp();
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [tokenData, setTokenData] = useState<ExchangeTokenResponse | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [sessionId, setLocalSessionId] = useState<string | null>(null);
  const stopListeningRef = useRef<StopListening | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // カウントダウンタイマー
  useEffect(() => {
    if (step !== 'searching' || !tokenData) return;
    const expiresAt = new Date(tokenData.expires_at).getTime();
    const id = setInterval(() => {
      const secs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(secs);
      if (secs === 0) {
        cleanup();
        setStep('qr_fallback');
        setErrorMsg('トークンの有効期限が切れました');
      }
    }, 500);
    return () => clearInterval(id);
  }, [step, tokenData]);

  // 分析ポーリング
  useEffect(() => {
    if (step !== 'waiting_analysis' || !sessionId) return;
    pollRef.current = setInterval(async () => {
      try {
        const analysis = await getAnalysis(sessionId);
        if (analysis.analysis_id) {
          clearInterval(pollRef.current!);
          setAnalysisId(analysis.analysis_id);
          setSessionId(sessionId);
          setScreen('analysis');
        }
      } catch {
        // まだ準備中
      }
    }, 3000);
    return () => clearInterval(pollRef.current!);
  }, [step, sessionId]);

  function cleanup() {
    stopListeningRef.current?.();
    stopListeningRef.current = null;
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }

  async function startSearch() {
    setErrorMsg('');
    setStep('requesting_mic');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // 許可確認のみ
    } catch {
      setStep('qr_fallback');
      setErrorMsg('マイクの許可が必要です');
      return;
    }

    // トークン発行
    let data: ExchangeTokenResponse;
    try {
      data = await issueToken();
      setTokenData(data);
      setCountdown(30);
    } catch (e) {
      setStep('error');
      setErrorMsg(e instanceof Error ? e.message : 'トークン発行失敗');
      return;
    }

    setStep('searching');

    // 自分のトークンを鳴き声で送信（初回）
    playToken(data.sound_frequencies).catch(() => {});
    // 4秒毎に最大3回追加再生（計4回）
    let playCount = 0;
    playIntervalRef.current = setInterval(() => {
      playToken(data.sound_frequencies).catch(() => {});
      if (++playCount >= 3) {
        clearInterval(playIntervalRef.current!);
        playIntervalRef.current = null;
      }
    }, 4000);

    // 相手の鳴き声を聞く
    const stop = await listenForToken(
      async (detectedToken) => {
        cleanup();
        setStep('detected');
        try {
          const join = await joinExchange(detectedToken, 'sound');
          setLocalSessionId(join.session_id);
          setStep('approving');
        } catch (e) {
          setErrorMsg(e instanceof Error ? e.message : 'トークン照合失敗');
          setStep('qr_fallback');
        }
      },
      (msg) => {
        cleanup();
        setStep('qr_fallback');
        setErrorMsg(msg);
      }
    );
    stopListeningRef.current = stop;
  }

  async function handleApprove() {
    if (!sessionId) return;
    try {
      const result = await approveExchange(sessionId);
      if (result.analysis_id) {
        setAnalysisId(result.analysis_id);
        setSessionId(sessionId);
        setScreen('analysis');
      } else {
        // 相手の承認待ち
        setStep('waiting_analysis');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '承認に失敗しました');
    }
  }

  function switchToQR() {
    cleanup();
    setStep('qr_fallback');
  }

  function reset() {
    cleanup();
    setStep('idle');
    setTokenData(null);
    setLocalSessionId(null);
    setErrorMsg('');
  }

  // ---- UI ----

  if (step === 'idle') {
    return (
      <div className="px-4 pt-6 pb-2 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">近くのペットを探す</h2>
        <div className="bg-violet-50 rounded-2xl p-5 space-y-3 text-sm text-gray-700">
          <p>📡 <strong>鳴き声通信</strong>で近くの相手のペットと出会えます</p>
          <p>🎤 マイクの許可が必要です</p>
          <p>🔇 静かな場所での利用を推奨します</p>
          <p>📱 音が聞こえない場合はQRコードに切り替えられます</p>
        </div>
        <button
          onClick={startSearch}
          className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl py-4 font-bold text-lg shadow-md"
        >
          🐾 近くのペットを探す
        </button>
      </div>
    );
  }

  if (step === 'requesting_mic') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4">
        <div className="text-5xl animate-pulse">🎤</div>
        <p className="text-gray-600 text-sm">マイクの許可を確認中...</p>
      </div>
    );
  }

  if (step === 'searching') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 gap-6">
        {/* 鳴き声アニメーション */}
        <div className="relative">
          <div className="text-6xl animate-bounce">🐾</div>
          <div className="absolute -inset-4 rounded-full border-2 border-violet-300 animate-ping opacity-60" />
          <div className="absolute -inset-8 rounded-full border border-violet-200 animate-ping opacity-30" style={{ animationDelay: '0.3s' }} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-gray-900">ペットが鳴いています...</p>
          <p className="text-sm text-gray-500">周囲のペットの鳴き声を聞いています</p>
        </div>
        {/* カウントダウン */}
        <div className="bg-gray-100 rounded-full px-4 py-1.5 text-sm text-gray-600">
          残り {countdown}秒
        </div>
        <button
          onClick={switchToQR}
          className="text-sm text-violet-600 underline"
        >
          音が聞こえない場合はQRコードへ
        </button>
      </div>
    );
  }

  if (step === 'detected') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4">
        <div className="text-5xl">🎉</div>
        <p className="text-gray-700 text-sm">ペットの鳴き声を検出しました！</p>
        <p className="text-xs text-gray-400">交換セッションに参加中...</p>
      </div>
    );
  }

  if (step === 'approving') {
    return (
      <div className="px-4 pt-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl">🤝</div>
          <h2 className="text-xl font-bold text-gray-900">ペットと出会いました！</h2>
          <p className="text-sm text-gray-500">交換を承認してください</p>
        </div>
        {errorMsg && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
        )}
        <button
          onClick={handleApprove}
          className="w-full bg-green-500 text-white rounded-2xl py-4 font-bold text-base hover:bg-green-600 transition-colors"
        >
          ✓ 交換を承認する
        </button>
        <button onClick={reset} className="w-full text-sm text-gray-400 py-2">
          キャンセル
        </button>
      </div>
    );
  }

  if (step === 'waiting_analysis') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4">
        <div className="text-5xl animate-spin">⚙️</div>
        <p className="text-gray-700 font-medium">ペット同士を分析中...</p>
        <p className="text-xs text-gray-400">共通点を探しています</p>
      </div>
    );
  }

  if (step === 'qr_fallback') {
    return (
      <div className="px-4 pt-6 pb-2 space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          {errorMsg || '音声交換ができませんでした。QRコードで交換しましょう。'}
        </div>

        {tokenData && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col items-center gap-4 shadow-sm">
            <p className="text-sm font-medium text-gray-700">相手にスキャンしてもらう</p>
            <div className="p-3 bg-white border rounded-xl">
              <QRCode value={tokenData.qr_data} size={180} />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">または番号を伝える</p>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-widest">
                {tokenData.token}
              </p>
            </div>
            <div className="bg-gray-100 rounded-full px-4 py-1.5 text-sm text-gray-600">
              残り {countdown}秒
            </div>
          </div>
        )}

        <button
          onClick={reset}
          className="w-full bg-violet-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-violet-700"
        >
          もう一度試す
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="px-4 pt-8 space-y-4 text-center">
        <div className="text-4xl">⚠️</div>
        <p className="text-gray-700">{errorMsg}</p>
        <button onClick={reset} className="text-violet-600 text-sm underline">
          やり直す
        </button>
      </div>
    );
  }

  return null;
}
