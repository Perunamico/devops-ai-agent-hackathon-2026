import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { submitInput, getReviewItems } from '../api';
import type { MemoryClassifyResult } from '../types';

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
    results: SpeechRecognitionResultList;
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


function buildPetReply(result: MemoryClassifyResult, petName: string): string {
  switch (result.category) {
    case 'public':
      if (result.interests.length > 0) {
        return `わん！「${result.interests[0]}」のこと、みんなに教えていいよ！`;
      }
      return `わん！それ、素敵な話だね！みんなに教えてあげる！`;
    case 'private':
      return `うん...${petName}だけのひみつにしておくね。`;
    case 'blocked':
      return `それはないしょにしとくね！大切なことだから守るよ。`;
    case 'review_required':
      return `んー、これって共有してもいいかな？確認画面で教えてね！`;
    default:
      return `うん、わかった！`;
  }
}

export default function HomeScreen() {
  const { pet, setScreen } = useApp();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [petBubble, setPetBubble] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBlink, setIsBlink] = useState(false);
  const normalPlayCountRef = useRef(0);

  useEffect(() => {
    getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    v.play().catch(() => {});
  }, [isBlink]);

  function handleVideoEnded() {
    if (isBlink) {
      setIsBlink(false);
    } else {
      normalPlayCountRef.current += 1;
      if (normalPlayCountRef.current % 2 === 0) {
        setIsBlink(true);
      } else {
        videoRef.current?.play();
      }
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await submitInput({ input_type: 'chat', content });
      setPetBubble(buildPetReply(result, pet?.name ?? 'ペット'));
      setContent('');
      if (result.category === 'review_required') {
        getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
      }
    } catch {
      setPetBubble('うまく聞き取れなかった...もう一度話しかけて！');
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

  const bubbleText = petBubble ?? 'おはよう！ 今日は何して過ごす？💙';

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] bg-white">
      {/* レビューバナー */}
      {reviewCount > 0 && (
        <button
          onClick={() => setScreen('review')}
          className="mx-4 mt-3 flex-shrink-0 bg-amber-50 rounded-xl px-4 py-2 text-xs text-amber-800 flex items-center justify-between"
        >
          <span>🔔 確認が必要な記憶が {reviewCount} 件あります</span>
          <span className="text-amber-500">→</span>
        </button>
      )}

      {/* 動画: flame/input に被らない flex-1 領域に収める */}
      <div className="flex-1 min-h-0">
        <video
          ref={videoRef}
          src={isBlink ? '/movie/blink.mp4' : '/movie/normal.mp4'}
          autoPlay
          muted
          playsInline
          onEnded={handleVideoEnded}
          className="w-full h-full object-contain"
        />
      </div>

      {/* 吹き出し */}
      <div className="relative mx-6 mb-3 flex-shrink-0">
        <img src="/icons/flame.png" className="w-full" alt="" />
        <div className="absolute inset-0 flex items-center justify-center px-10">
          <p className="text-sm text-gray-800 text-center leading-relaxed">{bubbleText}</p>
        </div>
      </div>

      {/* 入力エリア */}
      <div className="px-4 pb-6 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <div className="flex-1 bg-white rounded-full px-5 py-3">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="メッセージを入力..."
              className="w-full outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
            />
          </div>
          {hasSpeechAPI && (
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
        </form>
      </div>
    </div>
  );
}
