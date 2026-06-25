import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { sendChat, getReviewItems, createPet } from '../api';

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

function pickInterlude(): AnimName {
  return INTERLUDE_ANIMS[Math.floor(Math.random() * INTERLUDE_ANIMS.length)];
}

// --- ImageDecoder を使ったフレーム事前デコード + canvas アニメーション ---
// blob.stream() は一度しか読めないため、全フレームを ImageBitmap として
// 起動時にメモリへ展開しておく。ループはビットマップ配列の繰り返しで実現。
// frameCache はモジュールレベルで保持することで、画面遷移後の再マウント時に
// 再デコードを省略し、ローディング画面を出さずに済む。
const frameCache: Partial<Record<AnimName, DecodedFrame[]>> = {};

interface DecodedFrame {
  bitmap: ImageBitmap;
  durationMs: number;
}

interface AnimPlayer {
  start(minLoops: number, onDone: () => void): void;
  stop(): void;
}

function createPlayer(canvas: HTMLCanvasElement, frames: DecodedFrame[]): AnimPlayer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const ctx = canvas.getContext('2d')!;

  if (frames.length > 0) {
    canvas.width = frames[0].bitmap.width;
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

    const nextFi = fi + 1;
    if (nextFi >= frames.length) {
      // 1ループ完了
      const nextLoops = loops + 1;
      if (nextLoops >= minLoops) {
        timer = setTimeout(onDone, durationMs);
      } else {
        timer = setTimeout(() => step(0, nextLoops, minLoops, onDone), durationMs);
      }
    } else {
      timer = setTimeout(() => step(nextFi, loops, minLoops, onDone), durationMs);
    }
  }

  return {
    start(minLoops, onDone) {
      stop();
      stopped = false;
      step(0, 0, minLoops, onDone);
    },
    stop,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function decodeAllFrames(name: AnimName): Promise<DecodedFrame[]> {
  const res = await fetch(`/webp/${name}.webp`);
  const blob = await res.blob();
  // ArrayBuffer で渡すと全データが即座に利用可能になり、任意フレームへのシークが可能
  const buffer = await blob.arrayBuffer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoder = new (window as any).ImageDecoder({ data: buffer, type: 'image/webp' });
  await decoder.tracks.ready;

  const frameCount: number = decoder.tracks.selectedTrack.frameCount;
  const frames: DecodedFrame[] = [];

  for (let i = 0; i < frameCount; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: { image: any } = await decoder.decode({ frameIndex: i });
    const frame = result.image;
    // マイクロ秒 → ミリ秒。WebP の ANMF フレーム遅延値そのまま使用。
    const durationMs: number = (frame.duration ?? 100000) / 1000;
    // VideoFrame → ImageBitmap の変換。
    // createImageBitmap(VideoFrame) は実装依存があるため OffscreenCanvas を経由する。
    const offscreen = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    offscreen.getContext('2d')!.drawImage(frame, 0, 0);
    frame.close();
    const bitmap = await createImageBitmap(offscreen);
    frames.push({ bitmap, durationMs });
  }

  decoder.close();
  return frames;
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

  // pet が未作成なら命名モード。名付け完了後に 'active' へ移行する。
  const [phase, setPhase] = useState<'naming' | 'active'>(pet ? 'active' : 'naming');

  // 命名モードは shake から開始（1回再生後 hand へ。hand は無限ループ）。
  const [currentAnim, setCurrentAnim] = useState<AnimName>(pet ? 'hand' : 'shake');
  const canvasRefs = useRef<Partial<Record<AnimName, HTMLCanvasElement>>>({});
  const playersRef = useRef<Partial<Record<AnimName, AnimPlayer>>>({});
  // デコード済みアニメ集合。
  const [decoded, setDecoded] = useState<Set<AnimName>>(new Set());
  const [useImgFallback, setUseImgFallback] = useState(false);

  // 全アニメのデコード（キャッシュ化）を最初の読み込み画面の間に完了させる。
  // すべて揃ってからローディングを解除し、以降は裏でのデコードを発生させない。
  const coreReady = useImgFallback || AVAILABLE_ANIMS.every((n) => decoded.has(n));
  const isLoading = !coreReady;

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

  // 起動時に全アニメーションのフレームをデコードしてプレイヤーを生成
  // frameCache にあれば再デコードを省略し、即座にプレイヤーを生成する
  useEffect(() => {
    if (!('ImageDecoder' in window)) {
      setUseImgFallback(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        for (const name of AVAILABLE_ANIMS) {
          if (cancelled) break;

          let frames = frameCache[name];
          if (!frames) {
            frames = await decodeAllFrames(name);
            if (cancelled) break;
            frameCache[name] = frames;
          }

          const canvas = canvasRefs.current[name];
          if (canvas) {
            playersRef.current[name] = createPlayer(canvas, frames);
          }
          // デコード完了を都度反映。全アニメが揃うとローディングが解除される。
          setDecoded((prev) => {
            const next = new Set(prev);
            next.add(name);
            return next;
          });
        }
      } catch (err) {
        console.error('[HomeScreen] animation init failed, falling back to <img>:', err);
        if (!cancelled) setUseImgFallback(true);
      }
    })();

    return () => {
      cancelled = true;
      // プレイヤーのみ停止。ImageBitmap は frameCache に残すため close しない。
      Object.values(playersRef.current).forEach((p) => p?.stop());
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

  function toggleListening() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

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

  const hasSpeechAPI = !!(
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  const bubbleText =
    phase === 'naming'
      ? 'はじめまして！ぼくの名前をつけてくれる？'
      : petBubble ?? `おはよう！${pet?.name ?? 'ペット'}だよ！`;

  const animStyle = (name: AnimName): React.CSSProperties => ({
    opacity: name === currentAnim ? 1 : 0,
    height: '70vh',
    width: 'auto',
    left: '50%',
    top: '50%',
    transform: 'translateX(-50%) translateY(-55%)',
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

      {/* セリフ欄: 画面最上部に表示 */}
      {!isLoading && (
        <div className="relative mx-6 mt-3 mb-2 flex-shrink-0">
          <img src="/icons/flame.png" className="w-full" alt="" />
          <div className="absolute inset-0 flex items-center justify-center px-10">
            <p className="text-sm text-gray-800 text-center leading-relaxed">{bubbleText}</p>
          </div>
        </div>
      )}

      {/* アニメーション: canvas は常に DOM に存在させて ref を確保 */}
      <div className="flex-1 min-h-0 relative overflow-visible">
        {useImgFallback
          ? /* ImageDecoder 非対応ブラウザ: img で WebP をそのまま表示 */
            AVAILABLE_ANIMS.map((name) => (
              <img
                key={name}
                src={`/webp/${name}.webp`}
                alt=""
                className="absolute"
                style={animStyle(name)}
              />
            ))
          : /* ImageDecoder 対応ブラウザ: 事前デコード済みフレームを canvas に描画 */
            AVAILABLE_ANIMS.map((name) => (
              <canvas
                key={name}
                ref={(el) => { if (el) canvasRefs.current[name] = el; }}
                className="absolute"
                style={animStyle(name)}
              />
            ))
        }
      </div>

      {/* 入力エリア: 最下部（ローディング完了後のみ表示） */}
      {!isLoading && (
      <div className="px-4 pb-2 flex-shrink-0">
        {phase === 'naming' && (
          /* 文字数カウンター: 上限が分かりやすいよう常時表示 */
          <div className="flex justify-end px-2 mb-1">
            <span
              className={`text-xs tabular-nums ${
                content.length >= NAME_MAX ? 'text-violet-600 font-semibold' : 'text-gray-400'
              }`}
            >
              {content.length} / {NAME_MAX}
            </span>
          </div>
        )}
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
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (phase === 'naming') handleNameSubmit();
                  else handleSubmit();
                }
              }}
              placeholder={phase === 'naming' ? `名前を入力（${NAME_MAX}文字まで）` : 'メッセージを入力...'}
              className="w-full border-0 outline-none text-base text-gray-700 placeholder-gray-400 bg-transparent"
            />
          </div>
          {phase === 'active' && hasSpeechAPI && (
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
            disabled={!content.trim() || submitting}
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
