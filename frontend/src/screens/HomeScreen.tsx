import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { submitInput, getPublicMemory, getReviewItems } from '../api';
import type { PublicMemoryResponse, MemoryClassifyResult } from '../types';

const INPUT_TYPES = [
  { value: 'chat' as const, label: '💬 チャット' },
  { value: 'diary' as const, label: '📓 日記' },
  { value: 'interest_tag' as const, label: '🏷️ 興味タグ' },
];

const CATEGORY_LABELS: Record<string, { text: string; color: string }> = {
  public: { text: '公開メモリに追加されました ✓', color: 'bg-green-50 text-green-700' },
  private: { text: 'プライベートメモリに保存されました', color: 'bg-blue-50 text-blue-700' },
  blocked: { text: 'ブロックされました（個人情報など）', color: 'bg-red-50 text-red-700' },
  review_required: { text: '確認が必要です。レビュー画面を確認してください', color: 'bg-amber-50 text-amber-700' },
};

export default function HomeScreen() {
  const { pet, setScreen } = useApp();
  const [inputType, setInputType] = useState<'chat' | 'diary' | 'interest_tag'>('chat');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<MemoryClassifyResult | null>(null);
  const [memory, setMemory] = useState<PublicMemoryResponse | null>(null);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    getPublicMemory().then(setMemory).catch(() => {});
    getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const result = await submitInput({ input_type: inputType, content });
      setToast(result);
      setContent('');
      // メモリを再取得
      if (result.category === 'public' || result.category === 'review_required') {
        getPublicMemory().then(setMemory).catch(() => {});
        getReviewItems().then((items) => setReviewCount(items.length)).catch(() => {});
      }
      setTimeout(() => setToast(null), 4000);
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-2 space-y-5">
      {/* ペット情報ヘッダー */}
      <div className="flex items-center gap-3 bg-violet-50 rounded-2xl px-4 py-3">
        <span className="text-4xl">🐾</span>
        <div>
          <p className="font-bold text-gray-900 text-lg">{pet?.name ?? 'ペット'}</p>
          <p className="text-xs text-gray-500 line-clamp-1">{pet?.personality}</p>
        </div>
      </div>

      {/* 要確認バッジ */}
      {reviewCount > 0 && (
        <button
          onClick={() => setScreen('review')}
          className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-800 text-left flex items-center justify-between"
        >
          <span>🔔 確認が必要な記憶が {reviewCount} 件あります</span>
          <span className="text-amber-500">→</span>
        </button>
      )}

      {/* 入力フォーム */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700 mb-3">ペットに話しかける</p>

        {/* 入力タイプ切り替え */}
        <div className="flex gap-2 mb-3">
          {INPUT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setInputType(t.value)}
              className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors
                ${inputType === t.value
                  ? 'bg-violet-100 border-violet-300 text-violet-700 font-medium'
                  : 'border-gray-200 text-gray-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            required
            rows={3}
            placeholder={
              inputType === 'chat' ? '最近カフェで作業するのにはまってる...' :
              inputType === 'diary' ? '今日は〇〇をして楽しかった...' :
              '読書 / コーヒー / 旅行'
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
          />
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="w-full bg-violet-600 text-white rounded-xl py-2.5 text-sm font-semibold
              hover:bg-violet-700 disabled:opacity-40 transition-colors"
          >
            {submitting ? '分析中...' : '送る'}
          </button>
        </form>

        {/* トースト */}
        {toast && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${CATEGORY_LABELS[toast.category]?.color}`}>
            {CATEGORY_LABELS[toast.category]?.text}
            {toast.interests.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {toast.interests.map((i) => (
                  <span key={i} className="bg-white/60 rounded px-1.5 py-0.5">{i}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 公開メモリ */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700 mb-3">公開プロフィール</p>

        {memory?.safe_topic_tags.length ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {memory.safe_topic_tags.map((tag) => (
              <span key={tag} className="bg-violet-100 text-violet-700 text-xs rounded-full px-3 py-1">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-2">まだ公開情報がありません</p>
        )}

        {memory?.safe_summaries.map((s, i) => (
          <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-1.5">{s}</p>
        ))}

        {memory?.public_conversation_hooks.length ? (
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1">会話のきっかけ</p>
            {memory.public_conversation_hooks.map((h, i) => (
              <p key={i} className="text-xs text-gray-600 italic">💬 {h}</p>
            ))}
          </div>
        ) : null}
      </div>

      {/* 交換ボタン */}
      <button
        onClick={() => setScreen('exchange')}
        className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl py-4 font-bold text-base shadow-md hover:shadow-lg transition-all"
      >
        🐾 近くのペットを探す
      </button>
    </div>
  );
}
