import { useEffect, useState } from 'react';
import { getReviewItems, approveMemory } from '../api';
import { useApp } from '../App';
import type { ReviewItem } from '../types';

export default function ReviewScreen() {
  const { setReviewCount } = useApp();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReviewItems()
      .then((data) => {
        setItems(data);
        setReviewCount(data.length);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(id: string, action: 'approve' | 'reject') {
    const newItems = items.filter((i) => i.id !== id);
    setItems(newItems);
    setReviewCount(newItems.length);
    try {
      await approveMemory(id, action);
    } catch {
      // 楽観的UIなので失敗しても表示は維持
    }
  }

  return (
    <div className="px-4 pt-6 pb-2">
      <h2 className="text-lg font-bold text-gray-900 mb-1">確認待ちの記憶</h2>
      <p className="text-xs text-gray-500 mb-5">
        公開してよいか確認が必要な情報です。承認すると公開プロフィールに追加されます。
      </p>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm">確認待ちの記憶はありません</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-sm text-gray-900 mb-1">{item.candidate_summary}</p>
            <p className="text-xs text-gray-400 mb-4">理由: {item.reason}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleAction(item.id, 'approve')}
                className="flex-1 bg-green-500 text-white text-sm rounded-xl py-2 font-medium hover:bg-green-600 transition-colors"
              >
                ✓ 公開する
              </button>
              <button
                onClick={() => handleAction(item.id, 'reject')}
                className="flex-1 bg-gray-100 text-gray-700 text-sm rounded-xl py-2 font-medium hover:bg-gray-200 transition-colors"
              >
                ✗ 非公開にする
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
