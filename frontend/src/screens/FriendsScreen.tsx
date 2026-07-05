import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { getFriends } from '../api';
import type { FriendsResponse } from '../types';

// ともだち画面。デザインの PNG フレーム素材（frontend/public/icons/*）と stop.png を使って
// モックアップに合わせて装飾している。
//   ヘッダー  : friends_frame.png（鎖付き看板）
//   統計バー  : count.png（点線区切り＋四隅キラキラ）
//   カード枠  : big_frame.png（四隅キラキラ）
//   ボタン    : episode_button.png（中央キラキラ）
//   アバター  : /png/stop.png（ロボット）
// 各フレームは backgroundSize:'100% 100%' でストレッチし、コンテンツを padding で内側に収める。
// data は「あそぶ」の鳴き声/QR通信で交流が成立した相手を /friends から取得する。

// アバター背景はデザインのパステル3色を順繰りに使う。
const TINTS = ['#e7ecfb', '#e5f1ea', '#ede8fa'];

// ISO日時 →「たった今 / N分前 / N時間前 / N日前」。統計バーは数値と単位を
// 分けて表示するため {value, unit} で返し、カードでは連結して使う。
function relativeParts(iso: string | null): { value: string; unit: string } {
  if (!iso) return { value: '-', unit: '' };
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return { value: '-', unit: '' };
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return { value: 'たった今', unit: '' };
  if (minutes < 60) return { value: String(minutes), unit: '分前' };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: String(hours), unit: '時間前' };
  return { value: String(Math.floor(hours / 24)), unit: '日前' };
}

function relativeLabel(iso: string | null): string {
  const p = relativeParts(iso);
  return `${p.value}${p.unit}`;
}

// PNG フレームを全面ストレッチで背景に敷くための共通スタイル。
const frameBg = (src: string): CSSProperties => ({
  backgroundImage: `url(${src})`,
  backgroundSize: '100% 100%',
  backgroundRepeat: 'no-repeat',
});

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flex: '0 0 auto' }} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#93a4c4" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="#93a4c4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FriendsScreen() {
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFriends()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const friends = data?.friends ?? [];
  const loaded = data !== null;
  const stats: { label: string; value: string; unit: string }[] = [
    { label: 'ともだち数', value: loaded ? String(data.friend_count) : '-', unit: '人' },
    { label: '共通の話題', value: loaded ? String(data.common_topic_count) : '-', unit: '件' },
    { label: '最近の交流', ...(loaded ? relativeParts(data.last_interaction_at) : { value: '-', unit: '' }) },
  ];

  return (
    <div
      style={{
        minHeight: 'calc(100svh - var(--nav-top))',
        background: 'linear-gradient(180deg,#f2f5ff 0%,#ffffff 240px)',
        color: '#3f4d66',
        fontFamily: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN',system-ui,sans-serif",
      }}
    >
      <div style={{ padding: '4px 16px 28px', display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* ヘッダー（friends_frame.png の看板） */}
        <div
          style={{
            ...frameBg('/icons/friends_frame.png'),
            aspectRatio: '2508 / 627',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // 鎖が上に出るぶん、看板の中心はやや下。padding で文字を看板部分へ寄せる。
            padding: '9% 8% 2%',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: '#4670e6', letterSpacing: 2 }}>
            ともだち
          </span>
        </div>

        {/* 統計（count.png のフレーム。点線区切りはフレーム側） */}
        <div
          style={{
            ...frameBg('/icons/count.png'),
            aspectRatio: '2508 / 627',
            padding: '4% 5%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center',
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7596f3', marginBottom: 3 }}>{s.label}</div>
              <div style={{ color: '#7596f3', lineHeight: 1 }}>
                <span style={{ fontSize: 25, fontWeight: 800, color: '#4670e6' }}>{s.value}</span>
                <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>{s.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* まだ交流が無い（またはロード中/取得失敗）ときはカードを出さずに案内だけ表示 */}
        {friends.length === 0 && (
          <div style={{ textAlign: 'center', padding: '36px 24px', fontSize: 13, fontWeight: 500, color: '#93a4c4', lineHeight: 1.8 }}>
            {!loaded && !failed && 'ともだちを読み込んでいるよ...'}
            {loaded && 'まだともだちがいないよ。「あそぶ」から鳴き声通信やQR通信で交流してみよう！'}
            {failed && 'ともだちを読み込めなかったよ。時間をおいてもう一度開いてみてね。'}
          </div>
        )}

        {/* ともだちカード */}
        {friends.map((friend, i) => (
          <div
            key={friend.user_id}
            style={{
              // big_frame.png は外周に余白があり全面ストレッチだと枠線が内側へ寄って中身がはみ出す。
              // 四隅を固定したまま辺だけ伸縮する border-image で枠を当てる（fill で内側は白）。
              // 枠の外側余白が大きいとカード間が空くので、border 幅を薄めにして詰める。
              borderStyle: 'solid',
              borderWidth: '24px 16px',
              borderImageSource: 'url(/icons/big_frame.png)',
              borderImageSlice: '208 142 fill',
              borderImageRepeat: 'stretch',
              padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div
                style={{
                  flex: '0 0 auto', width: 90, height: 90, borderRadius: '50%',
                  background: TINTS[i % TINTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}
                aria-hidden
              >
                <img
                  src="/png/stop.png"
                  alt=""
                  style={{ width: '82%', height: '82%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: '#4670e6', lineHeight: 1.1, marginBottom: 5 }}>
                  {friend.pet_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
                  <ClockIcon />
                  <span style={{ fontSize: 11.5, color: '#93a4c4', fontWeight: 500 }}>
                    最後に交流したのは {relativeLabel(friend.last_interacted_at)}
                  </span>
                </div>
                {/* 分析がまだ無い交流では共通の話題が空になるため、見出しごと出し分ける */}
                {friend.common_topics.length > 0 && (
                  <>
                    <div style={{ fontSize: 11.5, color: '#93a4c4', fontWeight: 500, marginBottom: 6 }}>
                      共通の話題ベスト3
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                  </>
                )}
              </div>
            </div>

            {friend.comment && (
              <div style={{ fontSize: 12.5, color: '#3f4d66', fontWeight: 500, lineHeight: 1.45 }}>
                {friend.comment}
              </div>
            )}

            <button
              type="button"
              style={{
                // episode_button.png は上下に大きな白余白を持つ。cover + center で余白を切り取り、
                // ピル（とその中のキラキラ）を歪めずそのまま表示する。aspectRatio はピル部分の縦横比。
                backgroundImage: 'url(/icons/episode_button.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                aspectRatio: '1853 / 304',
                border: 'none', backgroundColor: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', cursor: 'pointer',
                // PNG 内のキラキラ（左寄り約37%）に文字が重ならないよう、テキストをやや右へ寄せる。
                padding: '0 6% 0 12%',
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: '#5b84f0', letterSpacing: 2 }}>話題を見る</span>
            </button>
          </div>
        ))}

      </div>
    </div>
  );
}
