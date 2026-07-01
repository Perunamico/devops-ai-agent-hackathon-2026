// ともだち画面。Claude Design の「ともだち.dc.html」を CSS で忠実に再現したもの。
// デザインの PNG フレーム（frame-header2 / frame-stats2 / frame-card2 / frame-button2）は
// バイナリ依存を避けるため、角丸カード＋ソフトシャドウ＋ブルー系アクセントの CSS で再現している。
// data はデザインのプレースホルダをそのまま移植。将来 API へ差し替えやすいよう FRIENDS 定数に分離。

interface Friend {
  id: string;
  name: string;
  time: string;
  tint: string;
  tags: string[];
  comment: string;
}

const FRIENDS: Friend[] = [
  {
    id: 'mirai', name: 'ミライ', time: '2時間前', tint: '#e7ecfb',
    tags: ['宇宙', 'AIの未来', 'ねこ'],
    comment: 'いつも深い話ができて、刺激をもらえる存在！',
  },
  {
    id: 'sora', name: 'ソラ', time: '5時間前', tint: '#e5f1ea',
    tags: ['カフェ巡り', '音楽', '旅行'],
    comment: '感性が近くて、話しているととっても楽しい！',
  },
  {
    id: 'haru', name: 'ハル', time: '1日前', tint: '#ede8fa',
    tags: ['ゲーム', '映画', 'マンガ'],
    comment: '共通の趣味が多くて、話が尽きない友だち！',
  },
];

const STATS: { label: string; value: string; unit: string }[] = [
  { label: 'ともだち数', value: '12', unit: '人' },
  { label: '共通の話題', value: '128', unit: '件' },
  { label: '最近の交流', value: '3', unit: '時間前' },
];

const CARD_SHADOW = '0 8px 24px rgba(70, 112, 230, 0.10)';

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flex: '0 0 auto' }} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#93a4c4" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="#93a4c4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="#5b84f0" strokeWidth="2" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FriendsScreen() {
  return (
    <div
      style={{
        minHeight: 'calc(100svh - var(--nav-top))',
        background: 'linear-gradient(180deg,#f2f5ff 0%,#ffffff 240px)',
        color: '#3f4d66',
        fontFamily: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN',system-ui,sans-serif",
      }}
    >
      <div style={{ padding: '8px 16px 36px', display: 'flex', flexDirection: 'column', gap: 13 }}>

        {/* ヘッダー */}
        <div
          style={{
            background: '#fff', borderRadius: 20, boxShadow: CARD_SHADOW,
            padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <span style={{ fontSize: 26 }} aria-hidden>🐾</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#4670e6', lineHeight: 1.1 }}>ともだち</div>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: '#93a4c4', marginTop: 3 }}>
              なかよくなったペットたち
            </div>
          </div>
        </div>

        {/* 統計 */}
        <div
          style={{
            background: '#fff', borderRadius: 20, boxShadow: CARD_SHADOW,
            padding: '14px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center',
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                textAlign: 'center',
                borderLeft: i === 0 ? 'none' : '1px solid #eaf0fe',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7596f3', marginBottom: 3 }}>{s.label}</div>
              <div style={{ color: '#7596f3', lineHeight: 1 }}>
                <span style={{ fontSize: 25, fontWeight: 800, color: '#4670e6' }}>{s.value}</span>
                <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>{s.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ともだちカード */}
        {FRIENDS.map((friend) => (
          <div
            key={friend.id}
            style={{
              background: '#fff', borderRadius: 22, boxShadow: CARD_SHADOW,
              padding: '22px 26px 24px', display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div
                style={{
                  flex: '0 0 auto', width: 90, height: 90, borderRadius: '50%',
                  background: friend.tint, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', fontSize: 40,
                }}
                aria-hidden
              >
                🐾
              </div>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: '#4670e6', lineHeight: 1.1, marginBottom: 5 }}>
                  {friend.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
                  <ClockIcon />
                  <span style={{ fontSize: 11.5, color: '#93a4c4', fontWeight: 500 }}>
                    最後に交流したのは {friend.time}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#93a4c4', fontWeight: 500, marginBottom: 6 }}>
                  共通の話題ベスト3
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {friend.tags.map((tag) => (
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
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: '#3f4d66', fontWeight: 500, lineHeight: 1.45 }}>
              {friend.comment}
            </div>

            <button
              type="button"
              style={{
                height: 50, background: '#eef3ff', borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%',
              }}
            >
              <ChatIcon />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#5b84f0', letterSpacing: 2 }}>話題を見る</span>
            </button>
          </div>
        ))}

      </div>
    </div>
  );
}
