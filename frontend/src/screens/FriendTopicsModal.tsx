import { useEffect, useState } from 'react';
import { getAnalysis } from '../api';
import type { ExchangeAnalysisResponse, FriendItem } from '../types';
// 「話題を見る」ボタンから開くボトムシート。FriendsScreen と同じ配色/フォントで
// 統一感を出し、AnalysisScreen のような硬いレポート調にはしない。
// データは既存の /exchanges/{session_id}/analysis（EncounterAgent が交流成立時に
// 生成済みの分析）をそのまま使う。common_topics はサーバー側で「深さ順」に
// ソート済みなので、そのままランキングとして表示できる。

const MEDALS = ['🥇', '🥈', '🥉'];

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (medal) {
    return <span style={{ fontSize: 20, flex: '0 0 auto', lineHeight: 1 }}>{medal}</span>;
  }
  return (
    <span
      style={{
        width: 22, height: 22, borderRadius: '50%', flex: '0 0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: '#5b84f0',
        background: '#e7ecfb',
      }}
    >
      {rank + 1}
    </span>
  );
}

function HintCard({ icon, text, tint }: { icon: string; text: string; tint: string }) {
  return (
    <div style={{ background: tint, borderRadius: 14, padding: '8px 12px', display: 'flex', gap: 8 }}>
      <span style={{ fontSize: 12.5, flex: '0 0 auto' }}>{icon}</span>
      <span style={{ fontSize: 12.5, color: '#3f4d66', fontWeight: 500, lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 800, color: '#4670e6', marginBottom: 8 }}>
      {children}
    </div>
  );
}

export default function FriendTopicsModal({
  friend,
  avatarTint,
  onClose,
}: {
  friend: FriendItem;
  avatarTint: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ExchangeAnalysisResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAnalysis(friend.session_id)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'エラーが発生しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [friend.session_id]);

  const commonTopics = data?.common_topics ?? [];
  const relatedTopics = data?.related_topics ?? [];
  const hooks = data?.conversation_hooks ?? [];
  const followups = data?.followup_suggestions ?? [];
  const isAllEmpty =
    !loading && !error && commonTopics.length === 0 && relatedTopics.length === 0 && hooks.length === 0 && followups.length === 0;

  const pointFor = (topic: string) => data?.personal_points.find((p) => p.topic === topic);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(63,77,102,0.45)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '28px 28px 0 0', width: '100%', maxWidth: 448,
          maxHeight: '85svh', overflowY: 'auto', padding: '20px 20px 28px',
          color: '#3f4d66',
          fontFamily: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN',system-ui,sans-serif",
        }}
      >
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              position: 'absolute', top: -4, right: -4,
              width: 28, height: 28, borderRadius: '50%', border: 'none',
              background: '#f2f5ff', color: '#93a4c4', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>

          {/* 元の友だちカードのミニ版。どの相手の話題を見ているかひと目でわかるように再掲する。 */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingRight: 32 }}>
            <div
              style={{
                flex: '0 0 auto', width: 56, height: 56, borderRadius: '50%',
                background: avatarTint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}
              aria-hidden
            >
              <img src="/png/stop.png" alt="" style={{ width: '82%', height: '82%', objectFit: 'contain' }} />
            </div>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#4670e6', lineHeight: 1.1 }}>
                🐾 {friend.pet_name}
              </div>
            </div>
          </div>

          {friend.common_topics.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {friend.common_topics.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: 11, fontWeight: 500, color: '#5b84f0',
                    border: '1.5px solid #c7d7fb', borderRadius: 999,
                    padding: '3px 10px', whiteSpace: 'nowrap',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, fontWeight: 500, color: '#93a4c4' }}>
            話題をさがしているよ...
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, fontWeight: 500, color: '#93a4c4', lineHeight: 1.8 }}>
            まだ話題を準備中みたい。少し経ってからもう一度見てみてね！
          </div>
        )}

        {!loading && !error && isAllEmpty && (
          <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, fontWeight: 500, color: '#93a4c4', lineHeight: 1.8 }}>
            まだ話題が見つかっていないみたい。今度たくさんお話ししてみてね！
          </div>
        )}

        {!loading && !error && !isAllEmpty && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {commonTopics.length > 0 && (
              <div>
                <SectionTitle>共通の話題ランキング</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {commonTopics.map((topic, i) => {
                    const point = pointFor(topic);
                    return (
                      <div key={topic}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <RankBadge rank={i} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#3f4d66' }}>{topic}</span>
                        </div>
                        {point && (
                          <div style={{ marginTop: 4, marginLeft: 32 }}>
                            <HintCard icon="💬" text={point.point} tint="#eef2fd" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {relatedTopics.length > 0 && (
              <div>
                <SectionTitle>関連の話題</SectionTitle>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {relatedTopics.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 11, fontWeight: 500, color: '#3f9e6f',
                        border: '1.5px solid #bfe4cf', background: '#e5f1ea', borderRadius: 999,
                        padding: '3px 10px', whiteSpace: 'nowrap',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {hooks.length > 0 && (
              <div>
                <SectionTitle>聞いてみよう</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hooks.map((h) => (
                    <HintCard key={h} icon="🗣️" text={h} tint="#eef2fd" />
                  ))}
                </div>
              </div>
            )}

            {followups.length > 0 && (
              <div>
                <SectionTitle>次はこんな話も</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {followups.map((f) => (
                    <HintCard key={f} icon="🌱" text={f} tint="#ede8fa" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
