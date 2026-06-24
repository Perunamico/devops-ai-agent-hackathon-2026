import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { useApp } from '../App';
import { issueToken, resolveExchange, getMatchStatus, getSession, endSession, pollToken, scanQrToken } from '../api';
import { createBroadcastExchange } from '../audio';
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

// ---- 交流中アニメーション ----

type ExchangeAnimName = 'interact_normal' | 'interact_happy';

interface DecodedExchangeFrame {
  bitmap: ImageBitmap;
  durationMs: number;
}

interface ExchangeAnimPlayer {
  start(minLoops: number, onDone: () => void): void;
  stop(): void;
}

// アンマウント時に破棄するため HomeScreen の frameCache とは別管理
const exchangeFrameCache: Partial<Record<ExchangeAnimName, DecodedExchangeFrame[]>> = {};

const EXCHANGE_ANIM_CONFIG: Record<ExchangeAnimName, { minLoops: number }> = {
  interact_normal: { minLoops: 3 },
  interact_happy:  { minLoops: 1 },
};

function pickNextExchangeAnim(current: ExchangeAnimName): ExchangeAnimName {
  return current === 'interact_normal' ? 'interact_happy' : 'interact_normal';
}

// 交流を辞めたタイミング（バイバイ・諦める・アンマウント）でのみ呼ぶ。
// gating エフェクトの cleanup では呼ばない（StrictMode 二重実行でキャッシュが消える事故を防ぐ）。
function disposeExchangeFrames(): void {
  for (const name of ['interact_normal', 'interact_happy'] as ExchangeAnimName[]) {
    exchangeFrameCache[name]?.forEach(f => f.bitmap.close());
    delete exchangeFrameCache[name];
  }
}

async function decodeWebpFrames(url: string): Promise<DecodedExchangeFrame[]> {
  const res = await fetch(url);
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoder = new (window as any).ImageDecoder({ data: buffer, type: 'image/webp' });
  await decoder.tracks.ready;
  const frameCount: number = decoder.tracks.selectedTrack.frameCount;
  const frames: DecodedExchangeFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { image } = await decoder.decode({ frameIndex: i }) as { image: any };
    const durationMs: number = (image.duration ?? 100000) / 1000;
    const offscreen = new OffscreenCanvas(image.displayWidth, image.displayHeight);
    offscreen.getContext('2d')!.drawImage(image, 0, 0);
    image.close();
    frames.push({ bitmap: await createImageBitmap(offscreen), durationMs });
  }
  decoder.close();
  return frames;
}

function decodeExchangeFrames(name: ExchangeAnimName): Promise<DecodedExchangeFrame[]> {
  return decodeWebpFrames(`/webp/${name}.webp`);
}

function createExchangePlayer(
  canvas: HTMLCanvasElement,
  frames: DecodedExchangeFrame[],
): ExchangeAnimPlayer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const ctx = canvas.getContext('2d')!;
  if (frames.length > 0) {
    canvas.width  = frames[0].bitmap.width;
    canvas.height = frames[0].bitmap.height;
  }
  function stop() {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function step(fi: number, loops: number, minLoops: number, onDone: () => void): void {
    if (stopped || frames.length === 0) return;
    const { bitmap, durationMs } = frames[fi];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const next = fi + 1;
    if (next >= frames.length) {
      const nextLoops = loops + 1;
      if (nextLoops >= minLoops) {
        timer = setTimeout(onDone, durationMs);
      } else {
        timer = setTimeout(() => step(0, nextLoops, minLoops, onDone), durationMs);
      }
    } else {
      timer = setTimeout(() => step(next, loops, minLoops, onDone), durationMs);
    }
  }
  return {
    start(minLoops, onDone) { stop(); stopped = false; step(0, 0, minLoops, onDone); },
    stop,
  };
}

export default function ExchangeScreen() {
  const { setScreen, setSessionId, setAnalysisId } = useApp();
  const [step, setStep] = useState<ExchangeStep>('exchanging');
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');
  const [tokenData, setTokenData] = useState<ExchangeTokenResponse | null>(null);
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);

  const listenerRef = useRef<ReturnType<typeof createBroadcastExchange> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingRef = useRef(false);
  const receivedRef = useRef(false); // 相手トークン受信済みフラグ（リスニング停止用）
  const resolvedRef = useRef(false); // 双方照合完了フラグ（送信ループ停止用）

  // 探索フェーズの映像は hand.webp ループに統一。鳴いている区間(barking)だけ CSS で
  // 「震え＋音波」エフェクトを重ねる。barking は audio.ts の onClip('bark_vibe')〜
  // ('quick_sit') 通知から導出する。
  const [barking, setBarking] = useState(false);
  const [autoStartRequested, setAutoStartRequested] = useState(false); // 通常フローの自動開始待ち
  const autoStartedRef = useRef(false);
  const [exchangeStarted, setExchangeStarted] = useState(false); // 鳴き声交換が実際に開始したか

  // 交流中アニメーション用
  const [currentExchangeAnim, setCurrentExchangeAnim] = useState<ExchangeAnimName>('interact_normal');
  const [exchangePlayersReady, setExchangePlayersReady] = useState(false);
  const [useExchangeImgFallback, setUseExchangeImgFallback] = useState(false);
  const exchangeCanvasRefs = useRef<Partial<Record<ExchangeAnimName, HTMLCanvasElement>>>({});
  const exchangePlayersRef = useRef<Partial<Record<ExchangeAnimName, ExchangeAnimPlayer>>>({});

  // 交流探索フェーズ（鳴き声の送受信中）が終わったらマイクを確実にOFF。
  // resolving/waiting は受信後も双方成立まで鳴き続けるフェーズなので止めない。
  useEffect(() => {
    if (step === 'session_active' || step === 'session_ended' || step === 'failed' || step === 'error') {
      listenerRef.current?.stop();
      listenerRef.current = null;
    }
  }, [step]);

  const cleanup = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    if (msgPollRef.current) { clearInterval(msgPollRef.current); msgPollRef.current = null; }
    playingRef.current = false;
    receivedRef.current = false;
    resolvedRef.current = false;
    setShowQR(false);
    setQrLoading(false);
    setBarking(false);
    setExchangeStarted(false);
    // 交流中アニメーションの後片付け（バイバイ・諦める・リトライ・アンマウント時）
    Object.values(exchangePlayersRef.current).forEach(p => p?.stop());
    exchangePlayersRef.current = {};
    setExchangePlayersReady(false);
    setUseExchangeImgFallback(false);
    setCurrentExchangeAnim('interact_normal');
    disposeExchangeFrames();
  }, []);

  // コンポーネントアンマウント時にクリーンアップ
  useEffect(() => () => cleanup(), [cleanup]);

  // 探索フェーズの映像 hand.webp をプリロード（<img> なのでレンダリングでも読まれるが先読み）。
  useEffect(() => {
    new Image().src = '/webp/hand.webp';
  }, []);

  // session_active になったらフレームキャッシュからプレイヤーを生成。
  // 重要: cleanup ではプレイヤー停止のみ行い、キャッシュ削除や ready のリセットはしない。
  // （StrictMode の mount→cleanup→mount 二重実行でキャッシュが消えると再生不能になるため）
  useEffect(() => {
    if (step !== 'session_active') return;
    // フォールバック描画時は canvas プレイヤー不要
    if (useExchangeImgFallback) return;
    const names: ExchangeAnimName[] = ['interact_normal', 'interact_happy'];
    let allReady = true;
    for (const name of names) {
      const frames = exchangeFrameCache[name];
      const canvas = exchangeCanvasRefs.current[name];
      if (frames && canvas) {
        exchangePlayersRef.current[name] = createExchangePlayer(canvas, frames);
      } else {
        allReady = false;
      }
    }
    // フレームが揃わなかった場合は img フォールバックへ切り替える
    if (!allReady) {
      setUseExchangeImgFallback(true);
      return;
    }
    setExchangePlayersReady(true);
    return () => {
      Object.values(exchangePlayersRef.current).forEach(p => p?.stop());
      exchangePlayersRef.current = {};
    };
  }, [step, useExchangeImgFallback]);

  // currentExchangeAnim が変わるたびに対応プレイヤーを起動（HomeScreen と同パターン）
  useEffect(() => {
    if (!exchangePlayersReady) return;
    const player = exchangePlayersRef.current[currentExchangeAnim];
    if (!player) return;
    player.start(EXCHANGE_ANIM_CONFIG[currentExchangeAnim].minLoops, () => {
      setCurrentExchangeAnim(pickNextExchangeAnim(currentExchangeAnim));
    });
    return () => { player.stop(); };
  }, [currentExchangeAnim, exchangePlayersReady]);

  // QRスキャンから開いた場合（User B側）: URLに exchangeToken があれば自動処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scannedToken = params.get('exchangeToken');
    if (!scannedToken) {
      // 通常フロー: クリップのデコード完了(キャッシュ化)を待ってから自動開始する
      setAutoStartRequested(true);
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

  // 通常フローは映像が hand.webp ループに統一されデコード待ちが不要になったため即開始する。
  useEffect(() => {
    if (!autoStartRequested || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startVoiceExchange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartRequested]);

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
    setExchangeStarted(true);
    setBarking(false);

    // React レンダリング待ち
    await new Promise(r => setTimeout(r, 0));

    playingRef.current = true;
    receivedRef.current = false;

    // 対称ランダムバックオフの半二重ループ（鳴く間は聞かない）を成立 or 上限まで実行
    const exchange = createBroadcastExchange({
      ownPayload: data.payload_raw,
      onPeerReceived: async (detectedPayload) => {
        if (receivedRef.current) return;
        receivedRef.current = true;
        setStep('resolving');
        await handleResolve(detectedPayload);
      },
      onExhausted: (received) => {
        playingRef.current = false;
        listenerRef.current?.stop();
        listenerRef.current = null;
        // received=true なら step は 'resolving'/'waiting' のまま → ポーリング継続
        if (!received) setStep('failed');
      },
      onError: () => {},
      // 鳴き区間(bark_vibe〜quick_sit)だけ barking=true にして CSS エフェクトを出す。
      onClip: (name) => setBarking(name === 'bark_vibe'),
      onRest: () => setBarking(false),
    });
    listenerRef.current = exchange;
    exchange.start();
  }

  async function handleResolve(payload: number[]) {
    try {
      const res = await resolveExchange(payload);
      if (res.status === 'matched' && res.session_id) {
        resolvedRef.current = true;
        listenerRef.current?.markMatched();
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
          resolvedRef.current = true;
          listenerRef.current?.markMatched();
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
      // ImageDecoder 非対応ブラウザは <img> フォールバックで再生する
      const canDecode = 'ImageDecoder' in window;
      // セッション取得とアニメーションフレームのデコードを並列実行。
      // デコードが失敗（or 非対応）の場合はフォールバックフラグを立てる。
      const decodePromise = canDecode
        ? (async () => {
            for (const name of ['interact_normal', 'interact_happy'] as ExchangeAnimName[]) {
              if (!exchangeFrameCache[name]) {
                exchangeFrameCache[name] = await decodeExchangeFrames(name);
              }
            }
            return true;
          })().catch(() => false)
        : Promise.resolve(false);
      const [session, decoded] = await Promise.all([getSession(sessionId), decodePromise]);
      setUseExchangeImgFallback(!decoded);
      setSessionData(session);
      setSessionId(sessionId);
      if (session.analysis_id) setAnalysisId(session.analysis_id);
      setCurrentExchangeAnim('interact_normal'); // 必ず normal から開始
      setStep('session_active');  // フレームロード完了後に遷移
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
    receivedRef.current = false;
    resolvedRef.current = false;
    setStep('exchanging');
    setShowQR(true);
    setQrLoading(true);
    setTokenData(null);
    issueToken().then(data => {
      setTokenData(data);
      startQrPolling(data.token_key);
    }).catch(() => {
      setShowQR(false);
      setErrorKind('generic');
      setStep('error');
    }).finally(() => {
      setQrLoading(false);
    });
  }

  async function handleBackToVoice() {
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    setTokenData(null);
    setShowQR(false);
    setQrLoading(false);
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

  if (step === 'exchanging' || step === 'failed' || step === 'resolving' || step === 'waiting') {
    return (
      <div
        className="flex flex-col bg-white relative"
        style={{ height: 'calc(100svh - 3.5rem)' }}
      >
        {/* 映像: HomeScreen の flex-1 と同一構造。全状態 hand.webp ループに統一し、
            鳴いている区間(barking)だけ CSS で「音波＋音符」を重ねる。 */}
        <div className="flex-1 min-h-0 relative">
          <div className="bark-pet">
            <img src="/webp/hand.webp" alt="" className="bark-img" />
            {barking && (
              <>
                <span className="bark-ripple" />
                <span className="bark-ripple bark-ripple-delay" />
                <span className="bark-note bark-note-1">♪</span>
                <span className="bark-note bark-note-2">♫</span>
                <span className="bark-note bark-note-3">♬</span>
              </>
            )}
          </div>
          {/* QRカード: 映像上に overlay（下部高さを変えない）*/}
          {showQR && (
            <div className="absolute inset-0 flex items-end justify-center pb-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-3 w-[calc(100%-2rem)] shadow-lg">
                {qrLoading || !tokenData ? (
                  <>
                    <div className="text-4xl animate-pulse">📷</div>
                    <p className="text-xs text-gray-500">QRコードを準備中...</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">QRコード（相手にスキャンしてもらう）</p>
                    <QRCode value={tokenData.qr_url} size={140} />
                    <p className="font-mono text-sm font-bold text-gray-700 tracking-widest">
                      {tokenData.token_key}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* HomeScreen の吹き出しエリアと同一クラス → 高さが一致 */}
        <div className="relative mx-6 mb-3 flex-shrink-0">
          <img src="/icons/flame.png" className="w-full" alt="" />
          {/* キャッシュ化(デコード)完了前は準備中を表示し、開始後に波形へ切り替える */}
          {step === 'exchanging' && !showQR && !exchangeStarted && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm font-medium text-violet-600 animate-pulse">準備中...</p>
            </div>
          )}
          {/* 鳴き声モードのみ波形アニメーションを表示 */}
          {step === 'exchanging' && !showQR && exchangeStarted && (
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
          {/* 照合中/相手待ちは双方成立まで stop.png のまま、文言だけ小さく重ねる */}
          {(step === 'resolving' || step === 'waiting') && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm font-medium text-violet-600 animate-pulse">
                {step === 'resolving' ? '照合中...' : '相手を待っています...'}
              </p>
            </div>
          )}
        </div>

        {/* HomeScreen の入力エリアと同一クラス → 高さが一致 */}
        <div className="px-4 pb-6 flex-shrink-0 flex items-center justify-center">
          {(step === 'exchanging' || step === 'failed') ? (
            showQR ? (
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
            )
          ) : (
            // resolving/waiting はボタンを出さないが高さは維持する
            <div className="h-12" />
          )}
        </div>

        {/* 交流失敗ポップ: will-change:transform で GPU レイヤーに昇格し video の上に合成 */}
        {step === 'failed' && !showQR && (
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

  if (step === 'session_active') {
    const isEnded = sessionData?.status === 'ended' && sessionData?.ended_by !== undefined;
    return (
      <div className="flex flex-col items-center min-h-[70vh] px-4 pt-6 gap-6">
        {/* 交流中アニメーション（ロード完了後に遷移するためプレースホルダは不要）*/}
        <div className="relative w-full flex-shrink-0" style={{ height: '280px' }}>
          {useExchangeImgFallback
            ? /* ImageDecoder 非対応 / デコード失敗: img で WebP をそのまま表示 */
              (['interact_normal', 'interact_happy'] as ExchangeAnimName[]).map(name => (
                <img
                  key={name}
                  src={`/webp/${name}.webp`}
                  alt=""
                  className="absolute"
                  style={{
                    opacity: name === currentExchangeAnim ? 1 : 0,
                    height: '100%',
                    width: 'auto',
                    left: '50%',
                    top: '50%',
                    transform: 'translateX(-50%) translateY(-50%)',
                  }}
                />
              ))
            : /* ImageDecoder 対応: 事前デコード済みフレームを canvas に描画 */
              (['interact_normal', 'interact_happy'] as ExchangeAnimName[]).map(name => (
                <canvas
                  key={name}
                  ref={el => { if (el) exchangeCanvasRefs.current[name] = el; }}
                  className="absolute"
                  style={{
                    opacity: exchangePlayersReady && name === currentExchangeAnim ? 1 : 0,
                    height: '100%',
                    width: 'auto',
                    left: '50%',
                    top: '50%',
                    transform: 'translateX(-50%) translateY(-50%)',
                  }}
                />
              ))
          }
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
