import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { getReport, submitFeedback } from '../api';
import type { ReportCard, CardType } from '../types';

const CARD_CONFIG: Record<CardType, { icon: string; color: string; label: string }> = {
  common_point: { icon: '💜', color: 'bg-purple-50 border-purple-200', label: '共通点' },
  conversation_starter: { icon: '💬', color: 'bg-blue-50 border-blue-200', label: '会話ネタ' },
  next_topic: { icon: '→', color: 'bg-teal-50 border-teal-200', label: '次回話題' },
  thank_you_template: { icon: '✉️', color: 'bg-amber-50 border-amber-200', label: 'ありがとう文' },
  new_interest: { icon: '✨', color: 'bg-green-50 border-green-200', label: '新しい趣味候補' },
  pet_message: { icon: '🐾', color: 'bg-rose-50 border-rose-200', label: 'ペットから一言' },
};

const REACTIONS = [
  { value: 'saved', label: '保存', icon: '🔖' },
  { value: 'used', label: '使った', icon: '✓' },
  { value: 'dismissed', label: 'いらない', icon: '✗' },
] as const;

function Card({ card, analysisId }: { card: ReportCard; analysisId: string }) {
  const [reaction, setReaction] = useState<string | null>(null);
  const cfg = CARD_CONFIG[card.card_type] ?? { icon: '📌', color: 'bg-gray-50 border-gray-200', label: '' };

  async function handleReaction(r: string) {
    setReaction(r);
    submitFeedback(analysisId, card.card_id, r).catch(() => {});
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${cfg.color}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{cfg.icon}</span>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{cfg.label}</span>
      </div>
      <p className="font-semibold text-gray-900 text-sm leading-snug">{card.title}</p>
      <p className="text-xs text-gray-600 leading-relaxed">{card.body}</p>
      <div className="flex gap-2 pt-1">
        {REACTIONS.map((r) => (
          <button
            key={r.value}
            onClick={() => handleReaction(r.value)}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-all
              ${reaction === r.value
                ? 'bg-violet-600 text-white border-violet-600 font-medium'
                : 'bg-white/60 text-gray-600 border-gray-200 hover:border-violet-300'}`}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReportScreen() {
  const { analysisId, setScreen } = useApp();
  const [cards, setCards] = useState<ReportCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!analysisId) {
      setLoading(false);
      return;
    }
    getReport(analysisId)
      .then((r) => setCards(r.cards))
      .catch((e) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false));
  }, [analysisId]);

  if (!analysisId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4 text-center">
        <div className="text-5xl">📄</div>
        <p className="text-gray-500 text-sm">レポートはありません</p>
        <p className="text-xs text-gray-400">ペットを交換してからレポートを見られます</p>
        <button onClick={() => setScreen('exchange')} className="text-violet-600 text-sm underline">
          交換画面へ
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <div className="text-5xl animate-pulse">📄</div>
        <p className="text-gray-700 font-medium">ペットがレポートを作成中...</p>
        <p className="text-xs text-gray-400">少しお待ちください</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-8 text-center space-y-3">
        <p className="text-red-500 text-sm">{error}</p>
        <button onClick={() => { setLoading(true); setError(''); getReport(analysisId!).then((r) => setCards(r.cards)).catch((e) => setError(e.message)).finally(() => setLoading(false)); }}
          className="text-violet-600 text-sm underline">
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="text-center mb-2">
        <div className="text-4xl mb-1">📄</div>
        <h2 className="text-xl font-bold text-gray-900">帰宅後レポート</h2>
        <p className="text-xs text-gray-500 mt-1">気に入ったカードに反応してみましょう</p>
      </div>

      {cards.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">カードがありません</p>
      )}

      {cards.map((card) => (
        <Card key={card.card_id} card={card} analysisId={analysisId} />
      ))}

      {cards.length > 0 && (
        <button
          onClick={() => setScreen('home')}
          className="w-full bg-gray-100 text-gray-700 rounded-2xl py-3 font-medium text-sm mt-2 hover:bg-gray-200"
        >
          ホームへ戻る
        </button>
      )}
    </div>
  );
}
