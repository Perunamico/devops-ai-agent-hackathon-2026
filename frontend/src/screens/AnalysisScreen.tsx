import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { getAnalysis } from '../api';
import type { ExchangeAnalysisResponse, ReportCard } from '../types';

const CARD_STYLE: Record<string, string> = {
  common_point: 'bg-purple-50 border-purple-200',
  conversation_starter: 'bg-blue-50 border-blue-200',
  next_topic: 'bg-teal-50 border-teal-200',
  thank_you_template: 'bg-amber-50 border-amber-200',
  new_interest: 'bg-green-50 border-green-200',
  pet_message: 'bg-rose-50 border-rose-200',
};

function OnSiteCard({ card }: { card: ReportCard }) {
  return (
    <div className={`rounded-xl border p-4 ${CARD_STYLE[card.card_type] ?? 'bg-gray-50 border-gray-200'}`}>
      <p className="font-semibold text-sm text-gray-900 mb-1">{card.title}</p>
      <p className="text-xs text-gray-600">{card.body}</p>
    </div>
  );
}

export default function AnalysisScreen() {
  const { sessionId, analysisId, setScreen } = useApp();
  const [data, setData] = useState<ExchangeAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    getAnalysis(sessionId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'エラーが発生しました'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <div className="text-5xl animate-spin">🤝</div>
        <p className="text-gray-700 font-medium">ペット同士の共通点を分析中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-8 text-center space-y-4">
        <p className="text-red-500 text-sm">{error}</p>
        <p className="text-xs text-gray-400">分析がまだ完了していない場合は少し待ってから再度確認してください</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-2 space-y-5">
      <div className="text-center">
        <div className="text-4xl mb-2">✨</div>
        <h2 className="text-xl font-bold text-gray-900">共通点が見つかりました！</h2>
      </div>

      {/* 共通トピック */}
      {data?.common_topics.length ? (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">共通の話題</p>
          <div className="flex flex-wrap gap-2">
            {data.common_topics.map((t) => (
              <span key={t} className="bg-violet-100 text-violet-700 text-sm rounded-full px-3 py-1 font-medium">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 会話のきっかけ */}
      {data?.conversation_hooks.length ? (
        <div className="bg-blue-50 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-medium text-blue-700 mb-2">💬 最初の一言</p>
          {data.conversation_hooks.map((h, i) => (
            <p key={i} className="text-sm text-gray-700">「{h}」</p>
          ))}
        </div>
      ) : null}

      {/* その場カード */}
      {data?.on_site_cards.length ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500">その場のカード</p>
          {data.on_site_cards.map((card) => (
            <OnSiteCard key={card.card_id} card={card} />
          ))}
        </div>
      ) : null}

      {/* 関連トピック */}
      {data?.related_topics.length ? (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">関連する話題</p>
          <div className="flex flex-wrap gap-2">
            {data.related_topics.map((t) => (
              <span key={t} className="bg-gray-100 text-gray-600 text-xs rounded-full px-3 py-1">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* レポートへ */}
      {analysisId && (
        <button
          onClick={() => setScreen('report')}
          className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl py-4 font-bold text-base shadow-md mt-4"
        >
          📄 帰宅後レポートを見る
        </button>
      )}
    </div>
  );
}
