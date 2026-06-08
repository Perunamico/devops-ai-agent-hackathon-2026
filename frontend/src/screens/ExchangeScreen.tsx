import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { useApp } from '../App';
import { issueToken, resolveExchange, getMatchStatus, getSession, endSession, pollToken, scanQrToken } from '../api';
import { encodePayload, playSymbols, createBarkListener } from '../audio';
import type { ExchangeTokenResponse, SessionResponse, ResolveStatus } from '../types';

type ExchangeStep =
  | 'exchanging'     // 鳴き声送受信メイン
  | 'resolving'      // サーバー照合中
  | 'waiting'        // 相手待ちポーリング
  | 'session_active' // セッション確立
  | 'session_ended'  // バイバイ後
  | 'failed'         // 6回送信完了・未確立
  | 'error';

type ErrorKind =
  | 'mic_denied'
  | 'expired'
  | 'used'
  | 'self'
  | 'not_found'
  | 'generic';

const ERROR_MESSAGES: Record<ErrorKind, string> = {
  mic_denied: 'マイクを許可すると交流できます',
  expired: 'もう一度交流を開始してください（期限切れ）',
  used: 'この交流コードはすでに使用されています',
  self: '相手のペットに近づけてください',
  not_found: '交流コードが見つかりませんでした',
  generic: '交流できませんでした',
};

const POLL_INTERVAL_MS = 2000;
const WAIT_TIMEOUT_MS = 90000;

export default function ExchangeScreen() {
  const { setScreen, setSessionId, setAnalysisId } = useApp();
  const [step, setStep] = useState<ExchangeStep>('exchanging');
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');
  const [tokenData, setTokenData] = useState<ExchangeTokenResponse | null>(null);
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null);
  const [showQR, setShowQR] = useState(false);

  const listenerRef = useRef<ReturnType<typeof createBarkListener> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingRef = useRef(false);
  const resolvedRef = useRef(false); // 受信済みフラグ（二重処理防止）
  const exchangingVideoRef = useRef<HTMLVideoElement>(null);

  // 交流探索フェーズが終わったらマイクを確実にOFF
  useEffect(() => {
    if (step !== 'exchanging') {
      listenerRef.current?.stop();
      listenerRef.current = null;
    }
    // failed 時: ホームと同じ映像(normal.mp4)に切り替えて再生
    if (step === 'failed' && exchangingVideoRef.current) {
      exchangingVideoRef.current.currentTime = 0;
      exchangingVideoRef.current.play().catch(() => {});
    }
  }, [step]);

  const cleanup = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    if (msgPollRef.current) { clearInterval(msgPollRef.current); msgPollRef.current = null; }
    playingRef.current = false;
    resolvedRef.current = false;
    setShowQR(false);
  }, []);

  // コンポーネントアンマウント時にクリーンアップ
  useEffect(() => () => cleanup(), [cleanup]);

  // QRスキャンから開いた場合（User B側）: URLに exchangeToken があれば自動処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scannedToken = params.get('exchangeToken');
    if (!scannedToken) {
      // 通常フロー: マウント時に鳴き声交換を自動開始
      startVoiceExchange();
      return;
    }
    // URL パラメータを除去
    const url = new URL(window.location.href);
    url.searchParams.delete('exchangeToken');
    window.history.replaceState({}, '', url.toString());

    setStep('resolving');
    scanQrToken(scannedToken).then(res => {
      if (res.status === 'matched' && res.session_id) {
        loadSession(res.session_id);
      } else {
        const kind = resolveStatusToKind(res.status);
        setErrorKind(kind);
        setStep('error');
      }
    }).catch(() => {
      setErrorKind('generic');
      setStep('error');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startVoiceExchange() {
    let data: ExchangeTokenResponse;
    try {
      data = await issueToken();
      setTokenData(data);
    } catch {
      setErrorKind('generic');
      setStep('error');
      return;
    }

    setStep('exchanging');

    // React レンダリング待ち
    await new Promise(r => setTimeout(r, 0));

    const symbols = encodePayload(data.payload_raw);

    const listener = createBarkListener(
      data.payload_raw,
      async (detectedPayload) => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        listenerRef.current?.stop();
        setStep('resolving');
        await handleResolve(detectedPayload);
      },
      () => {},
    );
    listenerRef.current = listener;
    listener.start();

    const MAX_ATTEMPTS = 6;
    playingRef.current = true;

    // 最大6回: サイクル先頭で映像リセット → 1秒待機 → 1秒鳴く → 0.5秒待機
    for (let attempt = 0; attempt < MAX_ATTEMPTS && playingRef.current && !resolvedRef.current; attempt++) {
      // サイクル開始と同時に映像を先頭から再生（ループ全体と映像のタイミングが一致）
      if (exchangingVideoRef.current) {
        exchangingVideoRef.current.currentTime = 0;
        exchangingVideoRef.current.play().catch(() => {});
      }
      await new Promise(r => setTimeout(r, 1000));
      if (!playingRef.current || resolvedRef.current) break;
      await playSymbols(symbols);
      if (!playingRef.current || resolvedRef.current) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!resolvedRef.current && playingRef.current) {
      listenerRef.current?.stop();
      listenerRef.current = null;
      playingRef.current = false;
      setStep('failed');
    }
  }

  async function handleResolve(payload: number[]) {
    try {
      const res = await resolveExchange(payload);
      if (res.status === 'matched' && res.session_id) {
        await loadSession(res.session_id);
      } else if (res.status === 'waiting' && res.pending_id) {
        startPolling(res.pending_id);
      } else {
        const kind = resolveStatusToKind(res.status);
        setErrorKind(kind);
        setStep('error');
      }
    } catch {
      setErrorKind('generic');
      setStep('error');
    }
  }

  function startPolling(pendingId: string) {
    setStep('waiting');
    const startAt = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startAt > WAIT_TIMEOUT_MS) {
        clearInterval(pollRef.current!);
        setStep('failed');
        return;
      }
      try {
        const status = await getMatchStatus(pendingId);
        if (status.status === 'matched' && status.session_id) {
          clearInterval(pollRef.current!);
          await loadSession(status.session_id);
        }
      } catch {
        // まだ待機中
      }
    }, POLL_INTERVAL_MS);
  }

  async function loadSession(sessionId: string) {
    try {
      const session = await getSession(sessionId);
      setSessionData(session);
      setSessionId(sessionId);
      if (session.analysis_id) setAnalysisId(session.analysis_id);
      setStep('session_active');
      watchSession(sessionId);
    } catch {
      setErrorKind('generic');
      setStep('error');
    }
  }

  // セッション中は message 取得 + 相手のバイバイ検知のため終了まで継続ポーリング
  function watchSession(sessionId: string) {
    msgPollRef.current = setInterval(async () => {
      try {
        const session = await getSession(sessionId);
        setSessionData(session);
        if (session.analysis_id) setAnalysisId(session.analysis_id);
        if (session.status === 'ended') {
          clearInterval(msgPollRef.current!);
          msgPollRef.current = null;
        }
      } catch {}
    }, 2000);
  }

  async function handleBye() {
    if (!sessionData) return;
    try {
      await endSession(sessionData.session_id);
    } catch {}
    setStep('session_ended');
    cleanup();
  }

  function handleRetry() {
    cleanup();
    setTokenData(null);
    setSessionData(null);
    setStep('exchanging');
    startVoiceExchange();
  }

  function handleQR() {
    // 鳴き声送受信を停止してQRモードへ切り替え
    listenerRef.current?.stop();
    listenerRef.current = null;
    playingRef.current = false;
    resolvedRef.current = false;
    setShowQR(true);
    issueToken().then(data => {
      setTokenData(data);
      startQrPolling(data.token_key);
    }).catch(() => {
      setErrorKind('generic');
      setStep('error');
    });
  }

  async function handleBackToVoice() {
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    setTokenData(null);
    setShowQR(false);
    resolvedRef.current = false;
    await startVoiceExchange();
  }

  function startQrPolling(tokenKey: string) {
    const startAt = Date.now();
    qrPollRef.current = setInterval(async () => {
      if (Date.now() - startAt > WAIT_TIMEOUT_MS) {
        clearInterval(qrPollRef.current!);
        qrPollRef.current = null;
        setStep('failed');
        return;
      }
      try {
        const result = await pollToken(tokenKey);
        if (result.status === 'matched' && result.session_id) {
          clearInterval(qrPollRef.current!);
          qrPollRef.current = null;
          await loadSession(result.session_id);
        }
      } catch {
        // まだ待機中
      }
    }, POLL_INTERVAL_MS);
  }

  function handleGiveUp() {
    cleanup();
    setScreen('home');
  }

  // ---- UI ----

  if (step === 'exchanging' || step === 'failed') {
    return (
      <div className="flex flex-col h-[calc(100dvh-3.5rem)] bg-white relative">
        {/* 動画: HomeScreen の flex-1 と同一構造 */}
        <div className="flex-1 min-h-0 relative">
          <video
            ref={exchangingVideoRef}
            src={step === 'failed' ? '/movie/normal.mp4' : '/movie/bark.mp4'}
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-contain"
          />
          {/* QRカード: video 上に overlay（下部高さを変えない）*/}
          {showQR && tokenData && (
            <div className="absolute inset-0 flex items-end justify-center pb-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-3 w-[calc(100%-2rem)] shadow-lg">
                <p className="text-xs text-gray-500">QRコード（相手にスキャンしてもらう）</p>
                <QRCode value={tokenData.qr_url} size={140} />
                <p className="font-mono text-sm font-bold text-gray-700 tracking-widest">
                  {tokenData.token_key}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* HomeScreen の吹き出しエリアと同一クラス → 高さが一致 */}
        <div className="relative mx-6 mb-3 flex-shrink-0">
          <img src="/icons/flame.png" className="w-full" alt="" />
          {/* 鳴き声モードのみ波形アニメーションを表示 */}
          {step === 'exchanging' && !showQR && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-1 h-8">
                {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6].map((h, i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-violet-400 rounded-full animate-pulse"
                    style={{ height: `${h * 100}%`, animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* HomeScreen の入力エリアと同一クラス → 高さが一致 */}
        <div className="px-4 pb-6 flex-shrink-0 flex items-center justify-center">
          {showQR ? (
            <button
              onClick={handleBackToVoice}
              className="h-12 flex items-center gap-2 text-sm text-violet-600 border border-violet-300 rounded-xl px-4"
            >
              🎵 鳴き声に戻る
            </button>
          ) : (
            <button
              onClick={handleQR}
              className="h-12 flex items-center gap-2 text-sm text-violet-600 border border-violet-300 rounded-xl px-4"
            >
              📷 QRコードを使う
            </button>
          )}
        </div>

        {/* 交流失敗ポップ: will-change:transform で GPU レイヤーに昇格し video の上に合成 */}
        {step === 'failed' && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-black/40"
            style={{ willChange: 'transform' }}
          >
            <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="text-center space-y-2">
                <div className="text-4xl">😔</div>
                <h2 className="text-lg font-bold text-gray-900">うまく交流できませんでした</h2>
                <p className="text-sm text-gray-500">音量を上げるか、端末を近づけてみてください</p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleRetry}
                  className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold"
                >
                  もう一度試す
                </button>
                <button
                  onClick={handleQR}
                  className="w-full border border-violet-400 text-violet-600 rounded-2xl py-4 font-bold"
                >
                  QRコードを使う
                </button>
                <button
                  onClick={handleGiveUp}
                  className="w-full text-gray-400 text-sm py-2"
                >
                  諦める
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 'resolving') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4">
        <div className="text-5xl animate-spin">🌀</div>
        <p className="text-gray-700 font-medium">照合中...</p>
        <p className="text-xs text-gray-400">相手のペットを確認しています</p>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4">
        <div className="text-5xl animate-pulse">🤝</div>
        <p className="text-gray-700 font-medium">相手のペットを待っています...</p>
        <p className="text-xs text-gray-400">相手も端末を近づけてください</p>
      </div>
    );
  }

  if (step === 'session_active') {
    const isEnded = sessionData?.status === 'ended' && sessionData?.ended_by !== undefined;
    return (
      <div className="flex flex-col items-center min-h-[70vh] px-4 pt-6 gap-6">
        {/* 交流中動画プレースホルダー */}
        <div className="w-full aspect-square max-w-[240px] bg-gradient-to-br from-green-100 to-emerald-200 rounded-3xl flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-5xl">🤝</div>
            <p className="text-xs text-green-600 font-medium">交流中！</p>
          </div>
        </div>

        {isEnded ? (
          <div className="bg-gray-50 rounded-2xl p-4 text-center">
            <p className="text-gray-700">お相手がバイバイしました 👋</p>
          </div>
        ) : (
          <>
            {sessionData?.common_message ? (
              <div className="bg-violet-50 rounded-2xl p-4 text-center space-y-2">
                <p className="text-xs text-violet-500 font-medium">ペットからのメッセージ</p>
                <p className="text-gray-800 text-base">
                  「{sessionData.common_message}」
                </p>
              </div>
            ) : (
              <div className="bg-violet-50 rounded-2xl p-4 text-center">
                <p className="text-sm text-violet-600 animate-pulse">共通点を探しています...</p>
              </div>
            )}

            <button
              onClick={handleBye}
              className="w-full bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-2xl py-4 font-bold text-lg"
            >
              バイバイする 👋
            </button>
          </>
        )}

        {isEnded && (
          <button
            onClick={() => setScreen('home')}
            className="w-full bg-gray-200 text-gray-700 rounded-2xl py-3 font-medium"
          >
            ホームに戻る
          </button>
        )}
      </div>
    );
  }

  if (step === 'session_ended') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 gap-6 text-center">
        <div className="text-5xl">👋</div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">交流が終わりました！</h2>
          <p className="text-sm text-gray-500">また近くに来たら交流してみよう</p>
        </div>
        <button
          onClick={() => setScreen('home')}
          className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
        >
          ホームに戻る
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 gap-6 text-center">
        <div className="text-4xl">⚠️</div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">交流できませんでした</h2>
          <p className="text-sm text-gray-500">{ERROR_MESSAGES[errorKind]}</p>
        </div>
        <button
          onClick={() => { cleanup(); startVoiceExchange(); }}
          className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold"
        >
          もう一度
        </button>
        <button onClick={handleGiveUp} className="text-gray-400 text-sm">
          ホームに戻る
        </button>
      </div>
    );
  }

  return null;
}

function resolveStatusToKind(status: ResolveStatus): ErrorKind {
  const map: Record<ResolveStatus, ErrorKind> = {
    matched: 'generic',
    waiting: 'generic',
    expired: 'expired',
    used: 'used',
    not_found: 'not_found',
    self: 'self',
  };
  return map[status] ?? 'generic';
}
