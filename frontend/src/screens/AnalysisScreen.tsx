import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../AppContext';
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
  const { sessionId, analysisId } = useApp();
  const router = useRouter();
  const [data, setData] = useState<ExchangeAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // sessionId はメモリ上にしかないため、/analysis を直接開いたりリロードすると失われる。
    // その場合はスピナーを止めて空状態を表示する。
    if (!sessionId) {
      setLoading(false);
      return;
    }
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

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-4 text-center">
        <div className="text-5xl">✨</div>
        <p className="text-gray-500 text-sm">分析結果はありません</p>
        <p className="text-xs text-gray-400">ペットを交換してから分析を見られます</p>
        <button onClick={() => router.push('/exchange')} className="text-violet-600 text-sm underline">
          交換画面へ
        </button>
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

      {/* 共通トピック（両者に共通表示するのはこれだけ） */}
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

      {/* あなたの好きなポイント（本人だけに表示） */}
      {data?.personal_points?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 mb-1">あなたの好きなポイント</p>
          {data.personal_points.map((p) => (
            <div key={p.topic} className="bg-violet-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-violet-700">{p.topic}</p>
              <p className="text-sm text-gray-700">{p.point}</p>
            </div>
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

      {/* レポートへ */}
      {analysisId && (
        <button
          onClick={() => router.push('/report')}
          className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl py-4 font-bold text-base shadow-md mt-4"
        >
          📄 帰宅後レポートを見る
        </button>
      )}
    </div>
  );
}
