import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { useApp } from '../App';
import { sendChat, getReviewItems, createPet } from '../api';
import {
  createAccountWithEmail,
  isCurrentUserEmailVerified,
  isFirebaseConfigured,
  onAuthStateChanged,
  sendPasswordReset,
  sendVerificationToCurrentUser,
  signInWithEmail,
  signOutUser,
} from '../firebase';

const NAME_MAX = 12;

type AnimName = 'hand' | 'stretch' | 'hand_stretch' | 'blink' | 'shake';

const ANIM_CONFIG: Record<AnimName, { minLoops: number; noConsecutive: boolean }> = {
  // hand は無限ループ（onDone は呼ばれない）。メッセージ送信時のみ interlude に切り替わる。
  hand:         { minLoops: Infinity, noConsecutive: false },
  stretch:      { minLoops: 1, noConsecutive: false },
  hand_stretch: { minLoops: 1, noConsecutive: false },
  blink:        { minLoops: 1, noConsecutive: true },
  shake:        { minLoops: 1, noConsecutive: true },
};

// hand と shake を先頭に置き、命名モードのイントロ（shake→hand）に必要な
// フレームを優先デコードする（全アニメのデコードは読み込み画面の間に完了させる）。
const AVAILABLE_ANIMS: AnimName[] = [
  'hand',
  'shake',
  'stretch',
  'hand_stretch',
  // 'blink',
];

const INTERLUDE_ANIMS: AnimName[] = ['stretch', 'hand_stretch', 'shake'];

type AuthMode = 'signin' | 'signup';

function messageForAuthError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
  if (code.includes('auth/email-already-in-use')) return 'このメールアドレスはすでに登録されています。';
  if (code.includes('auth/invalid-email')) return 'メールアドレスの形式を確認してください。';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) {
    return 'メールアドレスまたはパスワードが違います。';
  }
  if (code.includes('auth/weak-password')) return 'パスワードは8文字以上にしてください。';
  if (code.includes('auth/operation-not-allowed')) return 'メール/パスワード認証がFirebaseで有効になっていません。';
  if (code.includes('auth/unauthorized-domain')) return 'このURLがFirebase Authの承認済みドメインに登録されていません。';
  if (code.includes('auth/too-many-requests')) return '試行回数が多すぎます。少し時間を置いてください。';
  if (code.includes('auth/network-request-failed')) return 'ネットワーク接続を確認してください。';
  return '認証に失敗しました。もう一度お試しください。';
}

function pickInterlude(): AnimName {
  return INTERLUDE_ANIMS[Math.floor(Math.random() * INTERLUDE_ANIMS.length)];
}

// --- <video>(白背景 mp4) ベースのアニメーション ---
// 以前は WebP を ImageDecoder で全フレーム展開して canvas に描画していたが、
// 1024px 級の全フレーム ImageBitmap 常駐がスマホのメモリ/デコードを圧迫していた。
// ブラウザの HW 動画デコードに任せることで軽量・vsync 同期の滑らかな再生にする。

interface AnimPlayer {
  start(minLoops: number, onDone: () => void): void;
  stop(): void;
}

// 無限ループ(minLoops=Infinity)は loop 属性で再生し続ける。
// 有限回は loop=false + ended イベント + カウンタで minLoops 回数を数え onDone を発火する。
function createVideoPlayer(video: HTMLVideoElement): AnimPlayer {
  let onEnded: (() => void) | null = null;

  function detach() {
    if (onEnded) {
      video.removeEventListener('ended', onEnded);
      onEnded = null;
    }
  }

  function stop() {
    detach();
    video.loop = false;
    video.pause();
  }

  return {
    start(minLoops, onDone) {
      detach();
      video.currentTime = 0;
      if (minLoops === Infinity) {
        video.loop = true;
        // play() の Promise は高速切替時に AbortError で reject されるため握りつぶす
        video.play().catch(() => {});
        return;
      }
      video.loop = false;
      let loops = 0;
      onEnded = () => {
        loops += 1;
        if (loops >= minLoops) {
          detach();
          onDone();
        } else {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
      };
      video.addEventListener('ended', onEnded);
      video.play().catch(() => {});
    },
    stop,
  };
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: Event) => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionResult {
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    readonly isFinal: boolean;
  }
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }
}


export default function HomeScreen() {
  const { pet, setPet, setHomeLoading, setNaming, setReviewCount } = useApp();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [petBubble, setPetBubble] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [authError, setAuthError] = useState('');

  // pet が未作成なら命名モード。名付け完了後に 'active' へ移行する。
  const [phase, setPhase] = useState<'naming' | 'active'>(pet ? 'active' : 'naming');

  // 命名モードは shake から開始（1回再生後 hand へ。hand は無限ループ）。
  const [currentAnim, setCurrentAnim] = useState<AnimName>(pet ? 'hand' : 'shake');
  const videoRefs = useRef<Partial<Record<AnimName, HTMLVideoElement>>>({});
  const playersRef = useRef<Partial<Record<AnimName, AnimPlayer>>>({});
  // mp4 再生不可のブラウザでは <img> で WebP アニメをそのまま表示するフォールバック。
  const [useImgFallback, setUseImgFallback] = useState(false);

  // 動画は再生(play)実行時に読み込まれる。iOS Safari は preload を無視し play 前は
  // loadeddata が発火しないため、ローディングで動画読み込みを待つと永久に解除されない
  // （読み込み→loadeddata→play→読み込み の循環デッドロック）。
  // よってローディングは出さず、currentAnim の play() に読み込みを任せる。
  const coreReady = true;
  const isLoading = false;

  const normalizedEmail = email.trim();
  const requiresAuth = isFirebaseConfigured && phase === 'naming';
  const isVerifiedUser = Boolean(authUser?.emailVerified);
  const canCreatePet = !requiresAuth || Boolean(authUser);

  // mp4 非対応ブラウザは <img>(WebP) フォールバックへ切り替える。
  useEffect(() => {
    if (!document.createElement('video').canPlayType('video/mp4')) {
      setUseImgFallback(true);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged((user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  // ローディング状態を App（TopNav）に伝える
  useEffect(() => {
    setHomeLoading(isLoading);
    return () => setHomeLoading(false);
  }, [isLoading, setHomeLoading]);

  // 命名モードを App（TopNav 非表示・全画面）に伝える
  useEffect(() => {
    setNaming(phase === 'naming');
    return () => setNaming(false);
  }, [phase, setNaming]);

  // レビュー件数の取得は pet 作成後（active）のみ
  useEffect(() => {
    if (phase !== 'active') return;
    getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
  }, [phase, setReviewCount]);

  // アンマウント時に全プレイヤーを停止（再生中の video を pause）。
  useEffect(() => {
    const players = playersRef.current;
    return () => {
      Object.values(players).forEach((p) => p?.stop());
    };
  }, []);

  // 指定アニメのプレイヤーを起動。hand 以外は1回再生後 hand（無限ループ）へ戻す。
  const startAnim = useCallback((name: AnimName) => {
    const player = playersRef.current[name];
    if (!player) return;
    player.start(ANIM_CONFIG[name].minLoops, () => {
      // hand は無限ループのため onDone 不発。interlude（命名時の shake 含む）が
      // 1回終わったら hand へ戻す。hand に戻ると無限ループで待機状態になる。
      setCurrentAnim('hand');
    });
  }, []);

  // currentAnim が変わるたびに対応するプレイヤーを起動
  useEffect(() => {
    if (!coreReady) return;
    const player = playersRef.current[currentAnim];
    if (!player) return;
    startAnim(currentAnim);
    return () => player.stop();
  }, [currentAnim, coreReady, startAnim]);

  // タブを離れて戻ったときに setTimeout 連鎖がスロットリング/フリーズで止まったままに
  // なるため、可視状態へ復帰したら現在のアニメを再キックして再生を確実に復旧させる。
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && coreReady) {
        startAnim(currentAnim);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [currentAnim, coreReady, startAnim]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const message = content.trim();
    if (!message || submitting) return;
    // 送信の瞬間にランダムな interlude を1回再生してペットを反応させる（終了後 hand へ戻る）
    setCurrentAnim(pickInterlude());
    setSubmitting(true);
    try {
      const result = await sendChat({ message });
      setPetBubble(result.reply);
      setContent('');
      if (result.memory?.category === 'review_required') {
        getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
      }
    } catch {
      setPetBubble('うまく聞き取れなかった...もう一度話しかけて！');
    } finally {
      setSubmitting(false);
    }
  }

  // 命名モードでの送信: ペットを作成して active モードへ移行
  async function handleNameSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const name = content.trim().slice(0, NAME_MAX);
    if (!name || submitting) return;
    if (requiresAuth) {
      if (!authUser) {
        setAuthError('メールアドレスでログインしてから名前を決めてください。');
        return;
      }
      if (!(await isCurrentUserEmailVerified())) {
        setAuthError('確認メールのリンクを開いてから、もう一度お試しください。');
        return;
      }
    }
    setSubmitting(true);
    try {
      const created = await createPet({
        name,
        personality: '元気で友好的',
        tone: '自然体でカジュアル',
      });
      setPet(created);
      setContent('');
      setPetBubble(`おはよう！${created.name}だよ！`);
      setPhase('active');
    } catch {
      setPetBubble('うーん、うまくいかなかった…もう一度試してみて！');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAuthSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setAuthError('');
    setAuthNotice('');
    if (!normalizedEmail) {
      setAuthError('メールアドレスを入力してください。');
      return;
    }
    if (password.length < 8) {
      setAuthError('パスワードは8文字以上で入力してください。');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (authMode === 'signin') {
        await signInWithEmail(normalizedEmail, password);
        const verified = await isCurrentUserEmailVerified();
        if (!verified) {
          setAuthError('確認メールのリンクを開いてからログインしてください。');
          return;
        }
        setPassword('');
        setAuthNotice('ログインしました。名前を入力してください。');
      } else {
        await createAccountWithEmail(normalizedEmail, password);
        setPassword('');
        setAuthMode('signin');
        setAuthNotice('確認メールを送信しました。リンクを開いてからログインしてください。');
      }
    } catch (err) {
      setAuthError(messageForAuthError(err));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setAuthError('');
    setAuthNotice('');
    if (!normalizedEmail) {
      setAuthError('パスワード再設定にはメールアドレスを入力してください。');
      return;
    }
    setAuthSubmitting(true);
    try {
      await sendPasswordReset(normalizedEmail);
      setAuthNotice('パスワード再設定メールを送信しました。');
    } catch (err) {
      setAuthError(messageForAuthError(err));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleResendVerification() {
    setAuthError('');
    setAuthNotice('');
    setAuthSubmitting(true);
    try {
      await sendVerificationToCurrentUser();
      setAuthNotice('確認メールを再送しました。');
    } catch {
      setAuthError('確認メールを送信できませんでした。ログインし直してください。');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    setAuthError('');
    setAuthNotice('');
    setAuthSubmitting(true);
    try {
      await signOutUser();
      setPassword('');
    } catch {
      setAuthError('ログアウトに失敗しました。もう一度お試しください。');
    } finally {
      setAuthSubmitting(false);
    }
  }

  function toggleListening() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      // iOS Safari など Web Speech API 非対応のブラウザではボタンは表示するが通知する
      alert('この端末・ブラウザは音声入力に対応していません。');
      return;
    }

    if (listening) {
      recognitionRef.current?.abort();
      setListening(false);
      return;
    }

    const recog = new SR();
    recog.lang = 'ja-JP';
    recog.continuous = false;
    recog.interimResults = false;
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setContent((prev) => prev + transcript);
      setListening(false);
    };
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recognitionRef.current = recog;
    recog.start();
    setListening(true);
  }

  const bubbleText =
    phase === 'naming'
      ? 'はじめまして！ぼくの名前をつけてくれる？'
      : petBubble ?? `おはよう！${pet?.name ?? 'ペット'}だよ！`;

  const animStyle = (name: AnimName): React.CSSProperties => ({
    opacity: name === currentAnim ? 1 : 0,
    height: 'var(--pet-size)',
    width: 'auto',
    // PC など縦が短い/カラム幅が広い環境で flex-1 を超えないよう上限を付ける
    // （スマホは 40vh < 領域なので発火せず従来どおり）
    maxHeight: '100%',
    maxWidth: '100%',
    left: '50%',
    top: '50%',
    transform: 'translateX(-50%) translateY(-50%)',
    position: 'absolute',
  });

  return (
    // ローディング中のみ全画面（h-svh）。命名・active は同じ高さにして
    // ペット・吹き出し・入力欄の表示位置を揃える（命名中はナビ分の余白を空ける）。
    <div className={`flex flex-col relative bg-white ${isLoading ? 'h-svh' : 'h-[calc(100dvh-5rem)]'}`}>

      {/* ローディング中: fixed で全画面を覆い TopNav も含めて完全に隠す。
          canvas は DOM に残したまま ref を確保し、バックグラウンドでデコードを続ける。 */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4">
          <span className="w-14 h-14 rounded-full border-4 border-violet-200 border-t-violet-500 animate-spin" />
          <p className="text-sm text-gray-400">読み込み中...</p>
        </div>
      )}

      {/* 表札: 画面最上部。命名中は invisible で高さだけ確保しホームと縦位置を厳密一致 */}
      {!isLoading && (
        <div className={`nameplate${phase === 'active' ? '' : ' invisible'}`}>
          <img src="/icons/plate.png" alt="" />
          <span>{`${pet?.name ?? 'ペット'}のお部屋`}</span>
        </div>
      )}

      {/* アニメーション: video は常に DOM に存在させて ref を確保し、表示中のものだけ再生 */}
      <div className="flex-1 min-h-0 relative overflow-visible">
        {useImgFallback
          ? /* mp4 非対応ブラウザ: img で WebP をそのまま表示 */
            AVAILABLE_ANIMS.map((name) => (
              <img
                key={name}
                src={`/webp/${name}.webp`}
                alt=""
                className="absolute"
                style={animStyle(name)}
              />
            ))
          : /* mp4 対応ブラウザ: 白背景 mp4 を <video> で再生 */
            AVAILABLE_ANIMS.map((name) => (
              <video
                key={name}
                ref={(el) => {
                  if (!el) return;
                  videoRefs.current[name] = el;
                  el.muted = true; // React は muted 属性を反映しないことがあるため保険
                  if (!playersRef.current[name]) {
                    playersRef.current[name] = createVideoPlayer(el);
                  }
                }}
                src={`/movie/${name}.mp4`}
                muted
                playsInline
                preload="auto"
                className="absolute"
                style={animStyle(name)}
              />
            ))
        }
      </div>

      {/* セリフ枠: ペット映像と入力欄の間 */}
      {!isLoading && (
        <div className="relative mx-6 mb-1 flex-shrink-0">
          <img src="/icons/flame.png" className="w-full" alt="" />
          <div className="absolute inset-0 flex items-center justify-center px-10">
            <p className="text-sm text-gray-800 text-center leading-relaxed">{bubbleText}</p>
          </div>
        </div>
      )}

      {/* 入力エリア: 最下部（ローディング完了後のみ表示） */}
      {!isLoading && (
      <div className="px-4 pb-2 flex-shrink-0">
        {phase === 'naming' && isFirebaseConfigured && (
          <form onSubmit={handleAuthSubmit} className="mb-3 rounded-3xl border border-gray-200 bg-white p-3 shadow-sm space-y-3">
            {authLoading ? (
              <p className="text-sm text-gray-400 text-center py-2">ログイン状態を確認中...</p>
            ) : authUser ? (
              <div className="space-y-2">
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                  <p className="text-[10px] text-gray-400">ログイン中</p>
                  <p className="text-xs font-semibold text-gray-800 break-all">{authUser.email}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={authSubmitting || isVerifiedUser}
                    className="rounded-2xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 disabled:opacity-50"
                  >
                    確認メール再送
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={authSubmitting}
                    className="rounded-2xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
                  >
                    別アカウント
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('signin'); setAuthError(''); setAuthNotice(''); }}
                    className={`rounded-xl py-2 text-xs font-semibold transition-colors ${authMode === 'signin' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    ログイン
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('signup'); setAuthError(''); setAuthNotice(''); }}
                    className={`rounded-xl py-2 text-xs font-semibold transition-colors ${authMode === 'signup' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'}`}
                  >
                    新規登録
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    placeholder="メールアドレス"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none focus:border-violet-400 focus:bg-white"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                    minLength={8}
                    placeholder="パスワード"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 outline-none focus:border-violet-400 focus:bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {authSubmitting ? '処理中...' : authMode === 'signin' ? 'ログイン' : '確認メールを送る'}
                </button>
                {authMode === 'signin' && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={authSubmitting}
                    className="w-full text-center text-xs font-semibold text-violet-700 disabled:opacity-50"
                  >
                    パスワードを忘れた場合
                  </button>
                )}
              </>
            )}
            {authError && <p className="text-xs text-red-500 text-center bg-red-50 rounded-xl px-3 py-2">{authError}</p>}
            {authNotice && <p className="text-xs text-violet-700 text-center bg-violet-50 rounded-xl px-3 py-2">{authNotice}</p>}
          </form>
        )}
        {/* 文字数カウンター: 命名時のみ表示。active でも同じ高さの行を確保して
            ペット・吹き出しの縦位置をホームと揃える（active は invisible で非表示）。 */}
        <div className="flex justify-end px-2 mb-1">
          <span
            className={`text-xs tabular-nums ${
              phase !== 'naming'
                ? 'invisible'
                : content.length >= NAME_MAX
                ? 'text-violet-600 font-semibold'
                : 'text-gray-400'
            }`}
          >
            {content.length} / {NAME_MAX}
          </span>
        </div>
        <form
          onSubmit={phase === 'naming' ? handleNameSubmit : handleSubmit}
          className="flex items-center gap-3"
        >
          <div className="flex-1 flex items-center bg-gray-100 rounded-full px-5 py-3 border border-gray-200 shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 focus-within:bg-white transition-colors">
            <input
              type="text"
              value={content}
              maxLength={phase === 'naming' ? NAME_MAX : undefined}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                // IME変換確定のEnterは送信しない（変換中は isComposing が true）
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (phase === 'naming') handleNameSubmit();
                  else handleSubmit();
                }
              }}
              placeholder={phase === 'naming' ? `名前を入力（${NAME_MAX}文字まで）` : 'メッセージを入力...'}
              className="w-full border-0 outline-none text-base text-gray-700 placeholder-gray-400 bg-transparent"
            />
          </div>
          {phase === 'active' && (
            <button
              onClick={toggleListening}
              type="button"
              className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                ${listening ? 'bg-red-500 animate-pulse' : 'bg-sky-500'}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="white"
                className="w-6 h-6"
              >
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-3.08A7 7 0 0 0 19 10z" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={!content.trim() || submitting || (phase === 'naming' && !canCreatePet)}
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-violet-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            aria-label={phase === 'naming' ? '名前を決める' : '送信'}
          >
            {submitting ? (
              <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : phase === 'naming' ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="white"
                className="w-6 h-6"
              >
                <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="white"
                className="w-6 h-6"
              >
                <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
              </svg>
            )}
          </button>
        </form>
      </div>
      )}
    </div>
  );
}
