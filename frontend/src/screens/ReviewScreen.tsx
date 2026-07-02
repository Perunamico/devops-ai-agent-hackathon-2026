import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { approveMemory, getMemories } from '../api';
import { useApp } from '../App';
import type { MemoryListItem, MemoryListResponse } from '../types';

type SectionKey = keyof MemoryListResponse;

const EMPTY_MEMORIES: MemoryListResponse = {
  review: [],
  allowed: [],
  secret: [],
};

const SECTIONS: Array<{ key: SectionKey; title: string; empty: string }> = [
  { key: 'review', title: '確認依頼', empty: '確認が必要な記憶はありません' },
  { key: 'allowed', title: '共有', empty: '共有された記憶はまだありません' },
  { key: 'secret', title: '秘匿', empty: '秘匿された記憶はまだありません' },
];

// 各分類カードの再分類ボタン（現在の分類以外への移動）。
const ACTIONS: Record<SectionKey, Array<{ label: string; icon: string; to: SectionKey }>> = {
  review: [
    { label: '共有', icon: '/icons/check.png', to: 'allowed' },
    { label: '秘匿', icon: '/icons/secret.png', to: 'secret' },
  ],
  allowed: [{ label: '秘匿にする', icon: '/icons/secret.png', to: 'secret' }],
  secret: [{ label: '共有にする', icon: '/icons/check.png', to: 'allowed' }],
};

// ---- デザイントークン ----
const BLUE = '#4670e6';
const BLUE_SOFT = '#7596f3';
const BLUE_LINK = '#5b84f0';
const MUTED = '#93a4c4';
const SELECTED = '#1e3a8a'; // 選択中タブの濃い青
// アプリ共通UI（機能ナビの説明書き等）と同じ system フォントに合わせる。
const FONT = 'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif';

// big_frame.png をカード枠に使う（9スライス。可変高でも四隅の装飾を保ったまま伸縮）。
// 枠幅を細めにして中身を枠いっぱいに寄せ、カード間の余白も詰める。
const FRAME: CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  borderStyle: 'solid',
  borderWidth: 14,
  borderColor: 'transparent',
  borderImageSource: 'url(/icons/big_frame.png)',
  borderImageSlice: 300,
  // 単位なし数値だと React は border-width の「倍数」として出力してしまう。必ず px 文字列で。
  borderImageWidth: '14px',
  borderImageRepeat: 'stretch',
  padding: '4px 10px',
};

const tagStyle: CSSProperties = {
  alignSelf: 'flex-start', // 縦並びカードで横いっぱいに伸びないようにする
  fontSize: 11,
  fontWeight: 700,
  color: BLUE_LINK,
  background: '#eef3ff',
  borderRadius: 999,
  padding: '3px 12px',
  whiteSpace: 'nowrap',
};

function pendingCount(memories: MemoryListResponse): number {
  return memories.review.filter((item) => item.can_approve).length;
}

/** 許可/秘匿の操作ボタン（アウトラインのピル）。 */
function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        height: 38,
        border: '1.5px solid #cdddfb',
        borderRadius: 11,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        color: BLUE_LINK,
        fontSize: 13,
        fontWeight: 700,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <img src={icon} alt="" width={20} height={20} style={{ objectFit: 'contain' }} />
      {label}
    </button>
  );
}

type Pending = { item: MemoryListItem; from: SectionKey; to: SectionKey };

export default function ReviewScreen() {
  const { setReviewCount } = useApp();
  const [memories, setMemories] = useState<MemoryListResponse>(EMPTY_MEMORIES);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SectionKey>('review');
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    getMemories()
      .then((data) => {
        setMemories(data);
        setReviewCount(pendingCount(data));
      })
      .finally(() => setLoading(false));
  }, [setReviewCount]);

  // 記憶を別の分類へ移す（確認依頼/共有/秘匿 のどこからでも変更可能）。確認ポップで一度受け止める。
  async function reclassify({ item, from, to }: Pending) {
    const action: 'approve' | 'reject' = to === 'allowed' ? 'approve' : 'reject';
    const previous = memories;
    const movedItem: MemoryListItem = {
      ...item,
      can_approve: false,
      source: to === 'allowed' ? 'public' : 'blocked',
    };
    const next: MemoryListResponse = {
      ...memories,
      [from]: memories[from].filter((i) => i.id !== item.id),
      [to]: [movedItem, ...memories[to]],
    };
    setMemories(next);
    setReviewCount(pendingCount(next));

    try {
      await approveMemory(item.id, action);
    } catch {
      setMemories(previous);
      setReviewCount(pendingCount(previous));
    }
  }

  function confirmPending() {
    if (pending) reclassify(pending);
    setPending(null);
  }

  const counts: Record<SectionKey, number> = {
    review: memories.review.length,
    allowed: memories.allowed.length,
    secret: memories.secret.length,
  };
  const targetTitle = pending ? SECTIONS.find((s) => s.key === pending.to)?.title ?? '' : '';

  return (
    <div
      style={{
        minHeight: '100svh',
        background: '#ffffff',
        color: '#3f4d66',
        fontFamily: FONT,
      }}
    >
      <div style={{ padding: '14px 16px 36px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* サマリー＝タブ。count.png の各カラムをタップで分類を切り替える（既定: 確認依頼） */}
        <div style={{ position: 'relative' }}>
          <img src="/icons/count.png" alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
          <div
            style={{
              position: 'absolute',
              top: '12.9%',
              bottom: '16.7%',
              left: 0,
              right: 0,
              display: 'grid',
              // 枠の左右内側(0.037/0.963)と仕切り(0.342/0.657)から各カラムの視覚中心
              // (確認依頼0.189 / 共有0.500 / 秘匿0.810)に文字が来るよう列幅を調整。
              gridTemplateColumns: '0.379fr 0.241fr 0.380fr',
              alignItems: 'center',
            }}
          >
            {SECTIONS.map((s) => {
              const active = selected === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelected(s.key)}
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    background: 'transparent',
                    outline: 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: active ? SELECTED : BLUE_SOFT }}>{s.title}</span>
                  <span style={{ fontSize: 27, fontWeight: 800, color: active ? SELECTED : BLUE, lineHeight: 1 }}>{counts[s.key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: MUTED, fontSize: 14 }}>読み込み中...</div>
        )}

        {/* 選択中の分類のみを一覧表示 */}
        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {memories[selected].length === 0 ? (
              <div style={{ ...FRAME, fontSize: 12, color: MUTED }}>
                {SECTIONS.find((s) => s.key === selected)?.empty}
              </div>
            ) : selected === 'review' ? (
              // 確認依頼: チップ + 本文 + 共有/秘匿ボタン
              memories.review.map((item) => (
                <div key={item.id} style={{ ...FRAME, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {item.category && <span style={tagStyle}>{item.category}</span>}
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2f3b54', lineHeight: 1.45 }}>{item.summary}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    {ACTIONS.review.map((a) => (
                      <ActionButton
                        key={a.to}
                        icon={a.icon}
                        label={a.label}
                        onClick={() => setPending({ item, from: 'review', to: a.to })}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // 共有 / 秘匿: チップ＋右端の小さな「変更」ボタン、その下に本文
              memories[selected].map((item) => {
                const to = ACTIONS[selected][0].to;
                return (
                  <div key={item.id} style={{ ...FRAME, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.category && <span style={tagStyle}>{item.category}</span>}
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        onClick={() => setPending({ item, from: selected, to })}
                        style={{
                          flex: '0 0 auto',
                          height: 28,
                          padding: '0 16px',
                          border: '1.5px solid #cdddfb',
                          borderRadius: 999,
                          background: '#fff',
                          color: BLUE_LINK,
                          fontSize: 12,
                          fontWeight: 700,
                          outline: 'none',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        変更
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2f3b54', lineHeight: 1.45 }}>{item.summary}</p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 分類変更の確認ポップ（ワンクッション） */}
      {pending && (
        <div
          onClick={() => setPending(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0 16px 32px',
            background: 'rgba(0,0,0,0.4)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 24,
              width: '100%',
              maxWidth: '28rem',
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              fontFamily: FONT,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#2f3b54', textAlign: 'center' }}>
              この記憶を「{targetTitle}」にしますか？
            </h3>
            <p style={{ margin: '10px 0 20px', fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
              {pending.item.summary}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={confirmPending}
                style={{ height: 50, borderRadius: 14, background: BLUE, color: '#fff', fontSize: 15, fontWeight: 700, outline: 'none' }}
              >
                変更する
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                style={{ height: 44, borderRadius: 14, background: 'transparent', color: MUTED, fontSize: 14, fontWeight: 600, outline: 'none' }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
