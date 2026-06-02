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

const PET_EMOJIS = ['🐱', '🐶', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁'];

function getPetEmoji(name: string): string {
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % PET_EMOJIS.length;
  return PET_EMOJIS[idx];
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

  const petEmoji = pet ? getPetEmoji(pet.name) : '🐾';

  useEffect(() => {
    getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
  }, []);

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

  return (
    <div className="flex flex-col min-h-svh pt-14">
      {/* レビューバナー */}
      {reviewCount > 0 && (
        <button
          onClick={() => setScreen('review')}
          className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800 flex items-center justify-between"
        >
          <span>🔔 確認が必要な記憶が {reviewCount} 件あります</span>
          <span className="text-amber-500">→</span>
        </button>
      )}

      {/* ペットクローズアップゾーン */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8">
        {/* 吹き出し */}
        {petBubble ? (
          <div className="relative bg-violet-50 border border-violet-200 rounded-2xl rounded-bl-sm px-5 py-3 max-w-xs text-sm text-gray-800 shadow-sm">
            {petBubble}
            <div className="absolute -bottom-2 left-4 w-4 h-4 bg-violet-50 border-r border-b border-violet-200 rotate-45" />
          </div>
        ) : (
          <div className="relative bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-5 py-3 max-w-xs text-sm text-gray-500 shadow-sm">
            何か話しかけてみて！
            <div className="absolute -bottom-2 left-4 w-4 h-4 bg-gray-50 border-r border-b border-gray-200 rotate-45" />
          </div>
        )}

        {/* ペット絵文字 */}
        <span
          className="select-none"
          style={{ fontSize: '9rem', lineHeight: 1 }}
        >
          {petEmoji}
        </span>

        {/* ペット名 */}
        <p className="text-lg font-bold text-gray-700">{pet?.name ?? 'ペット'}</p>
      </div>

      {/* 入力エリア */}
      <div className="px-4 pb-6 space-y-3">
        <div className="flex gap-2 items-end">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={2}
            placeholder="ペットに話しかける..."
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          {hasSpeechAPI && (
            <button
              onClick={toggleListening}
              type="button"
              className={`w-11 h-11 rounded-full flex items-center justify-center text-xl transition-colors flex-shrink-0
                ${listening ? 'bg-red-100 text-red-500 animate-pulse' : 'bg-violet-100 text-violet-600'}`}
            >
              🎤
            </button>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="w-full bg-violet-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-colors"
        >
          {submitting ? '考え中...' : '話しかける'}
        </button>
      </div>
    </div>
  );
}
