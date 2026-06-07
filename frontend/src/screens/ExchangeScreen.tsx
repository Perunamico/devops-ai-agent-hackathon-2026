import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { useApp } from '../App';
import { issueToken, resolveExchange, getMatchStatus, getSession, endSession, pollToken, scanQrToken } from '../api';
import { encodePayload, playSymbols, createBarkListener } from '../audio';
import type { ExchangeTokenResponse, SessionResponse, ResolveStatus } from '../types';

type ExchangeStep =
  | 'mic_prompt'     // "マイクをONにしていいですか？" YES/NO
  | 'requesting_mic' // getUserMedia 呼び出し中
  | 'volume_adjust'  // 音量調整ポップ
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

const PLAY_COUNT = 6;
const POLL_INTERVAL_MS = 2000;
const WAIT_TIMEOUT_MS = 90000;

export default function ExchangeScreen() {
  const { setScreen, setSessionId, setAnalysisId } = useApp();
  const [step, setStep] = useState<ExchangeStep>('mic_prompt');
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');
  const [tokenData, setTokenData] = useState<ExchangeTokenResponse | null>(null);
  const [playsLeft, setPlaysLeft] = useState(PLAY_COUNT);
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null);

  const listenerRef = useRef<ReturnType<typeof createBarkListener> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingRef = useRef(false);
  const resolvedRef = useRef(false); // 受信済みフラグ（二重処理防止）

  const cleanup = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
    if (msgPollRef.current) { clearInterval(msgPollRef.current); msgPollRef.current = null; }
    playingRef.current = false;
    resolvedRef.current = false;
  }, []);

  // コンポーネントアンマウント時にクリーンアップ
  useEffect(() => () => cleanup(), [cleanup]);

  // QRスキャンから開いた場合（User B側）: URLに exchangeToken があれば自動処理
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scannedToken = params.get('exchangeToken');
    if (!scannedToken) return;
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

  function handleMicNo() {
    // NO → 交流できませんでしたポップを表示してホームに戻る
    setErrorKind('mic_denied');
    setStep('error');
  }

  async function handleMicYes() {
    setStep('requesting_mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      setErrorKind('mic_denied');
      setStep('error');
      return;
    }
    setStep('volume_adjust');
  }

  async function handleVolumeOk() {
    // トークン発行（マイク許可・音量調整完了直前）
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
    setPlaysLeft(PLAY_COUNT);

    // 自分の payloadRaw を用意して送受信を開始
    const symbols = encodePayload(data.payload_raw);

    // マイクリスナーを起動
    const listener = createBarkListener(
      data.payload_raw,
      async (detectedPayload) => {
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        listenerRef.current?.stop();
        setStep('resolving');
        await handleResolve(detectedPayload);
      },
      () => {
        // mic_denied はここでは発生しない（許可済み）
      },
    );
    listenerRef.current = listener;
    listener.start();

    // 6回鳴き声を流す
    playingRef.current = true;
    for (let i = 0; i < PLAY_COUNT; i++) {
      if (!playingRef.current) break;
      await playSymbols(symbols);
      setPlaysLeft(PLAY_COUNT - i - 1);
      if (i < PLAY_COUNT - 1) {
        // 次の送信まで少し待つ
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // 6回完了後もセッション未確立なら failed
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
    setStep('volume_adjust');
  }

  function handleQR() {
    cleanup();
    issueToken().then(data => {
      setTokenData(data);
      setStep('exchanging');
      startQrPolling(data.token_key);
    }).catch(() => {
      setErrorKind('generic');
      setStep('error');
    });
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

  if (step === 'mic_prompt') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6">
        <div className="text-5xl">🎤</div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold text-gray-900">マイクをONにしてもいいですか？</h2>
          <p className="text-sm text-gray-500">鳴き声を使って近くのペットを探します</p>
        </div>
        <div className="flex flex-col w-full gap-3">
          <button
            onClick={handleMicYes}
            className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
          >
            はい、ONにする
          </button>
          <button
            onClick={handleMicNo}
            className="w-full text-gray-500 text-sm py-2"
          >
            いいえ
          </button>
        </div>
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

  if (step === 'volume_adjust') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6">
        <div className="text-5xl">🔊</div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-bold text-gray-900">音量を調整してください</h2>
          <p className="text-sm text-gray-500">
            端末の音量を上げて、相手の端末に近づけてください
          </p>
        </div>
        <button
          onClick={handleVolumeOk}
          className="w-full bg-violet-600 text-white rounded-2xl py-4 font-bold text-lg"
        >
          OK、始める
        </button>
      </div>
    );
  }

  if (step === 'exchanging') {
    return (
      <div className="flex flex-col items-center min-h-[70vh] px-4 pt-6 gap-6">
        {/* 交流中の動画プレースホルダー */}
        <div className="w-full aspect-square max-w-[240px] bg-gradient-to-br from-violet-100 to-purple-200 rounded-3xl flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-5xl animate-bounce">🎵</div>
            <p className="text-xs text-violet-500 font-medium">交流動画（準備中）</p>
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-gray-900">ペットが鳴いています...</p>
          <p className="text-sm text-gray-500">周囲のペットの鳴き声を聞いています</p>
          {playsLeft > 0 && (
            <p className="text-xs text-gray-400">残り {playsLeft} 回</p>
          )}
        </div>

        {/* 波形アニメーション */}
        <div className="flex items-center gap-1 h-8">
          {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6].map((h, i) => (
            <div
              key={i}
              className="w-1.5 bg-violet-400 rounded-full animate-pulse"
              style={{ height: `${h * 100}%`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>

        {/* QRコードを使うボタン（常時表示）*/}
        <button
          onClick={handleQR}
          className="flex items-center gap-2 text-sm text-violet-600 border border-violet-300 rounded-xl px-4 py-2"
        >
          📷 QRコードを使う
        </button>

        {tokenData && (
          <div className="mt-2 bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-3 w-full shadow-sm">
            <p className="text-xs text-gray-500">QRコード（相手にスキャンしてもらう）</p>
            <QRCode value={tokenData.qr_url} size={140} />
            <p className="font-mono text-sm font-bold text-gray-700 tracking-widest">
              {tokenData.token_key}
            </p>
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

  if (step === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6 text-center">
        <div className="text-4xl">😔</div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-gray-900">うまく交流できませんでした</h2>
          <p className="text-sm text-gray-500">音量を上げるか、端末を近づけてみてください</p>
        </div>
        <div className="flex flex-col w-full gap-3">
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
          onClick={() => { setStep('mic_prompt'); cleanup(); }}
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
