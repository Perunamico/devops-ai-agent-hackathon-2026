import type { CSSProperties } from 'react';

interface Memory {
  tag: string;
  tagBg: string;
  tagColor: string;
  date: string;
  title: string;
  sub: string;
  actionIcon: string;
  actionColor: string;
}

interface Feature {
  icon: string;
  iconColor: string;
  ring: string;
  title: string;
  body: string;
}

interface Step {
  no: string;
  icon: string;
  title: string;
  body: string;
}

interface FootCol {
  head: string;
  links: string[];
}

const MEMORIES: Memory[] = [
  { tag: '映画', tagBg: '#DFF3EF', tagColor: '#1F9E8C', date: '5/12', title: 'SF映画が好き', sub: 'インターステラーが特に印象的', actionIcon: '✓', actionColor: '#1F9E8C' },
  { tag: 'ゲーム', tagBg: '#E7EEFB', tagColor: '#3B7BF0', date: '5/10', title: 'RPGが好き', sub: 'ゼルダの伝説にハマっている', actionIcon: '👥', actionColor: '#3B7BF0' },
  { tag: '音楽', tagBg: '#E7EEFB', tagColor: '#3B7BF0', date: '5/9', title: 'ロックが好き', sub: 'ヨルシカやスピッツをよく聴く', actionIcon: '((•))', actionColor: '#3B7BF0' },
];

const FEATURES: Feature[] = [
  { icon: '✓', iconColor: '#1F9E8C', ring: '#B9E4DC', title: '安心して覚える', body: 'あなたの「好き」や大切なことを、AIペットがそっと覚えます。' },
  { icon: '✎', iconColor: '#3B7BF0', ring: '#C6DAF9', title: '共有する前に確認', body: '記憶ごとに共有・編集・非共有を選べるから、プライバシーも安心。' },
  { icon: '👥', iconColor: '#3B7BF0', ring: '#C6DAF9', title: '共通の話題を発見', body: '友だちのAIペットとつながり、共通の話題のきっかけを提案。' },
];

const STEPS: Step[] = [
  { no: '1', icon: '🐣', title: 'AIペットを迎える', body: '名前をつけて、あなただけのAIペットをはじめましょう。' },
  { no: '2', icon: '💬', title: '「好き」を伝える', body: '話しかけるだけ。ペットが大切な記憶をやさしく覚えます。' },
  { no: '3', icon: '✨', title: '話題がひろがる', body: '共有した記憶から、友だちとの共通の話題が見つかります。' },
];

const FOOTCOLS: FootCol[] = [
  { head: 'プロダクト', links: ['しくみ', 'プライバシー', '料金プラン', 'アップデート'] },
  { head: 'サポート', links: ['よくある質問', 'お問い合わせ', '使い方ガイド'] },
  { head: '会社情報', links: ['ブログ', '運営会社', '利用規約'] },
];

const heading: CSSProperties = { fontFamily: "'Zen Kaku Gothic New',sans-serif", fontWeight: 900 };

export default function LandingScreen({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  return (
    <div style={{ fontFamily: "'Noto Sans JP',sans-serif", color: '#1F2A44', background: '#fff', WebkitFontSmoothing: 'antialiased' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes lp-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes lp-twinkle{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes lp-rippling{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.9);opacity:0}}
      `}</style>

      <div style={{ minHeight: '100%', background: 'linear-gradient(180deg,#fff 0%,#F6F9FF 55%,#fff 100%)', overflowX: 'hidden' }}>

        {/* HEADER */}
        <header style={{ position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,.82)', borderBottom: '1px solid #EDF2FC' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(160deg,#EAF1FF,#D6E5FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(59,123,240,.18)' }}>
                <div style={{ position: 'relative', width: 26, height: 24, borderRadius: '9px 9px 8px 8px', background: 'linear-gradient(160deg,#fff,#E9F1FF)', border: '1.5px solid #C3D8FB', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B7BF0' }} />
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B7BF0' }} />
                  <span style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', width: 2, height: 5, background: '#9CC0FA', borderRadius: 2 }} />
                </div>
              </div>
              <span style={{ ...heading, fontSize: 24, letterSpacing: '.01em' }}>きおくペット</span>
            </div>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
              <a href="#how" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>しくみ</a>
              <a href="#privacy" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>プライバシー</a>
              <a href="#faq" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>よくある質問</a>
              <a href="#blog" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>ブログ</a>
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={onLogin} style={{ padding: '11px 26px', borderRadius: 12, border: '1.5px solid #C3D8FB', background: '#fff', color: '#3B7BF0', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>ログイン</button>
              <button onClick={onSignup} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: '#3B7BF0', color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 8px 20px rgba(59,123,240,.32)' }}>はじめる</button>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section style={{ maxWidth: 1240, margin: '0 auto', padding: '70px 40px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '11px 22px', borderRadius: 999, background: '#fff', border: '1.5px solid #DCE8FC', boxShadow: '0 6px 18px rgba(59,123,240,.08)', marginBottom: 36 }}>
              <span style={{ color: '#3B7BF0', fontSize: 14 }}>✦</span>
              <span style={{ color: '#3B7BF0', fontWeight: 700, fontSize: 15, letterSpacing: '.02em' }}>AIペット</span>
              <span style={{ color: '#A9C1EC' }}>×</span>
              <span style={{ color: '#3B7BF0', fontWeight: 700, fontSize: 15 }}>記憶</span>
              <span style={{ color: '#A9C1EC' }}>×</span>
              <span style={{ color: '#3B7BF0', fontWeight: 700, fontSize: 15 }}>交流</span>
              <span style={{ color: '#3B7BF0', fontSize: 14 }}>✦</span>
            </div>
            <h1 style={{ ...heading, fontSize: 64, lineHeight: 1.18, letterSpacing: '.01em', position: 'relative' }}>
              「好き」を覚えて、<br />
              <span style={{ position: 'relative', display: 'inline-block' }}>
                会話のきっかけに。
                <svg style={{ position: 'absolute', left: 0, bottom: -6, width: '78%', height: 14 }} viewBox="0 0 300 14" preserveAspectRatio="none">
                  <path d="M2 9 C80 2 220 2 298 8" stroke="#9AD8CE" strokeWidth={6} strokeLinecap="round" fill="none" opacity=".8" />
                </svg>
              </span>
            </h1>
            <p style={{ marginTop: 30, fontSize: 18, lineHeight: 1.9, color: '#54617C', fontWeight: 500 }}>
              あなたのAIペットが、覚えた記憶を安心して管理しながら、<br />友だちとの共通の話題を見つけます。
            </p>
            <div style={{ display: 'flex', gap: 18, marginTop: 40, flexWrap: 'wrap' }}>
              <button onClick={onSignup} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '19px 40px', borderRadius: 16, border: 'none', background: '#3B7BF0', color: '#fff', fontWeight: 700, fontSize: 18, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 14px 30px rgba(59,123,240,.34)' }}>
                <span style={{ fontSize: 14, opacity: .85 }}>✦</span>はじめる<span style={{ fontSize: 20 }}>→</span>
              </button>
              <a href="#how" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '19px 38px', borderRadius: 16, border: '1.5px solid #C7D9F8', background: '#fff', color: '#3B7BF0', fontWeight: 700, fontSize: 18, cursor: 'pointer', textDecoration: 'none' }}>
                しくみを見る<span style={{ fontSize: 20 }}>→</span>
              </a>
            </div>
          </div>

          {/* phone + robot */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 560 }}>
            <span style={{ position: 'absolute', top: 60, left: '2%', color: '#7FB0F5', fontSize: 26, animation: 'lp-twinkle 3.2s ease-in-out infinite' }}>✦</span>
            <span style={{ position: 'absolute', top: '34%', left: '-2%', color: '#A9C8F7', fontSize: 18, animation: 'lp-twinkle 4s ease-in-out infinite .6s' }}>✦</span>
            <span style={{ position: 'absolute', top: 8, right: '16%', color: '#7FB0F5', fontSize: 22, animation: 'lp-twinkle 3.6s ease-in-out infinite .9s' }}>✦</span>

            <div style={{ position: 'absolute', left: '-6%', bottom: 22, zIndex: 3, animation: 'lp-floaty 5.5s ease-in-out infinite' }}>
              <div style={{ position: 'relative', width: 150 }}>
                <div style={{ width: 118, height: 96, margin: '0 auto', borderRadius: '38px 38px 30px 30px', background: 'linear-gradient(165deg,#FFFFFF 40%,#DCE9FD)', border: '2px solid #E3EDFB', boxShadow: '0 20px 40px rgba(59,123,240,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 80, height: 52, borderRadius: 26, background: 'linear-gradient(160deg,#2B3A63,#16233F)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: 'inset 0 2px 8px rgba(0,0,0,.4)' }}>
                    <span style={{ width: 15, height: 15, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#8FD0FF,#3B8BF0)', boxShadow: '0 0 10px #4C9BFF' }} />
                    <span style={{ width: 15, height: 15, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#8FD0FF,#3B8BF0)', boxShadow: '0 0 10px #4C9BFF' }} />
                  </div>
                </div>
                <div style={{ width: 96, height: 70, margin: '-6px auto 0', borderRadius: '30px 30px 40px 40px', background: 'linear-gradient(165deg,#FFFFFF 45%,#D3E3FC)', border: '2px solid #E3EDFB', boxShadow: '0 16px 30px rgba(59,123,240,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#9BD4FF,#2F7FEC)', boxShadow: '0 0 14px #4C9BFF,inset 0 -2px 4px rgba(0,0,0,.15)' }} />
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', zIndex: 2, width: 352, borderRadius: 44, background: '#fff', border: '1px solid #E7EEFA', padding: 12, boxShadow: '0 40px 80px rgba(46,86,170,.18),0 8px 24px rgba(46,86,170,.08)' }}>
              <div style={{ borderRadius: 34, overflow: 'hidden', background: '#F7FAFF' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px 6px', fontSize: 14, fontWeight: 700 }}>
                  <span>9:41</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#1F2A44' }}>
                    <span style={{ letterSpacing: 1 }}>▂▄▆</span><span>📶</span><span style={{ fontSize: 12 }}>🔋</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 14px' }}>
                  <span style={{ fontSize: 22, color: '#54617C' }}>‹</span>
                  <span style={{ ...heading, fontSize: 20 }}>きおく <span style={{ color: '#7FB0F5', fontSize: 14 }}>✦</span></span>
                  <span style={{ fontSize: 22, color: '#54617C', letterSpacing: 1 }}>···</span>
                </div>
                <div style={{ display: 'flex', gap: 6, padding: '0 16px 14px' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 4px', borderRadius: 11, background: '#fff', border: '1px solid #ECF1FA', fontSize: 12.5, fontWeight: 700, color: '#54617C' }}>
                    確認依頼<span style={{ background: '#FF7A45', color: '#fff', width: 17, height: 17, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>2</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 4px', borderRadius: 11, background: '#EAF1FF', border: '1px solid #CFE0FC', fontSize: 12.5, fontWeight: 700, color: '#3B7BF0' }}>共有可</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 4px', borderRadius: 11, background: '#fff', border: '1px solid #ECF1FA', fontSize: 12.5, fontWeight: 700, color: '#54617C' }}>非共有 🔒</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 16px 16px' }}>
                  {MEMORIES.map((m) => (
                    <div key={m.title} style={{ background: '#fff', border: '1px solid #EDF2FB', borderRadius: 18, padding: '14px 15px', boxShadow: '0 4px 14px rgba(46,86,170,.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 8, background: m.tagBg, color: m.tagColor, fontSize: 11, fontWeight: 700 }}>{m.tag}</span>
                        <span style={{ color: '#9AA8C2', fontSize: 12, fontWeight: 500 }}>{m.date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 2 }}>{m.title}</div>
                          <div style={{ color: '#8290AB', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.sub}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexShrink: 0, color: '#3B7BF0' }}>
                          <span style={{ color: m.actionColor, fontSize: 17 }}>{m.actionIcon}</span>
                          <span style={{ color: '#B7C4DC', fontSize: 15 }}>✎</span>
                          <span style={{ color: '#B7C4DC', fontSize: 15 }}>🔒</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '14px 20px 20px', borderTop: '1px solid #EEF2FA', background: '#fff' }}>
                  <span style={{ fontSize: 20, color: '#54617C' }}>⌂</span>
                  <span style={{ fontSize: 19, color: '#B7C4DC' }}>🤖</span>
                  <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#3B7BF0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: '0 8px 18px rgba(59,123,240,.4)', marginTop: -26, border: '4px solid #fff' }}>+</span>
                  <span style={{ fontSize: 19, color: '#B7C4DC' }}>⚙</span>
                  <span style={{ fontSize: 19, color: '#B7C4DC' }}>👥</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE CARDS */}
        <section style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 40px 90px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: '#fff', border: '1px solid #EAF0FB', borderRadius: 24, padding: '34px 32px', boxShadow: '0 10px 30px rgba(46,86,170,.06)' }}>
              <div style={{ width: 62, height: 62, borderRadius: '50%', border: `2px solid ${f.ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: f.iconColor, marginBottom: 22 }}>{f.icon}</div>
              <h3 style={{ ...heading, fontSize: 23, marginBottom: 14 }}>{f.title}</h3>
              <p style={{ color: '#5B6882', fontSize: 15.5, lineHeight: 1.85, fontWeight: 500 }}>{f.body}</p>
            </div>
          ))}
        </section>

        {/* VIDEO SECTION */}
        <section id="video" style={{ background: 'linear-gradient(180deg,#EAF2FF,#F4F8FF)', padding: '96px 40px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '7px 20px', borderRadius: 999, background: '#fff', border: '1.5px solid #DCE8FC', color: '#3B7BF0', fontWeight: 700, fontSize: 14, marginBottom: 24 }}>✦ 90秒でわかる</span>
            <h2 style={{ ...heading, fontSize: 44, lineHeight: 1.3, marginBottom: 18 }}>動画で見る、きおくペット</h2>
            <p style={{ color: '#54617C', fontSize: 18, lineHeight: 1.85, fontWeight: 500, maxWidth: 640, margin: '0 auto 44px' }}>
              記憶の登録から共有、友だちとの話題づくりまで。<br />AIペットと過ごす毎日を、まるごとご紹介します。
            </p>

            <div style={{ position: 'relative', borderRadius: 28, overflow: 'hidden', boxShadow: '0 40px 90px rgba(46,86,170,.22)', border: '1px solid #E1EAFA', background: '#fff' }}>
              <div style={{ position: 'relative', aspectRatio: '16/9', background: 'repeating-linear-gradient(135deg,#EEF4FF 0 22px,#E6EFFD 22px 44px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button aria-label="動画を再生" style={{ position: 'relative', width: 100, height: 100, borderRadius: '50%', border: 'none', background: '#3B7BF0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 40px rgba(59,123,240,.45)', zIndex: 2 }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#3B7BF0', animation: 'lp-rippling 2.4s ease-out infinite', zIndex: -1 }} />
                  <span style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '16px 0 16px 27px', borderColor: 'transparent transparent transparent #fff', marginLeft: 6 }} />
                </button>
                <span style={{ position: 'absolute', bottom: 18, left: 0, right: 0, fontFamily: "'Courier New',monospace", fontSize: 13, color: '#8AA0C6', letterSpacing: '.05em' }}>紹介動画をここに差し替え（16:9）</span>
              </div>
            </div>
            <p style={{ marginTop: 22, color: '#8496B4', fontSize: 14, fontWeight: 500 }}>※ プレースホルダーです。ご用意の動画に差し替えできます。</p>
          </div>
        </section>

        {/* HOW (3 steps) */}
        <section id="how" style={{ maxWidth: 1140, margin: '0 auto', padding: '100px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ display: 'inline-block', padding: '7px 20px', borderRadius: 999, background: '#EAF1FF', color: '#3B7BF0', fontWeight: 700, fontSize: 14, marginBottom: 20 }}>しくみ</span>
            <h2 style={{ ...heading, fontSize: 44, lineHeight: 1.3 }}>3ステップではじめられます</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28 }}>
            {STEPS.map((s) => (
              <div key={s.no} style={{ position: 'relative', background: '#fff', border: '1px solid #EAF0FB', borderRadius: 26, padding: '44px 34px 38px', boxShadow: '0 10px 30px rgba(46,86,170,.06)' }}>
                <div style={{ position: 'absolute', top: -22, left: 34, width: 52, height: 52, borderRadius: 16, background: '#3B7BF0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Zen Kaku Gothic New',sans-serif", fontWeight: 900, fontSize: 22, boxShadow: '0 10px 22px rgba(59,123,240,.34)' }}>{s.no}</div>
                <div style={{ fontSize: 34, margin: '14px 0 18px' }}>{s.icon}</div>
                <h3 style={{ ...heading, fontSize: 21, marginBottom: 12 }}>{s.title}</h3>
                <p style={{ color: '#5B6882', fontSize: 15, lineHeight: 1.85, fontWeight: 500 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 40px 100px' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 34, background: 'linear-gradient(150deg,#3B7BF0,#2C63D8)', padding: '80px 48px', textAlign: 'center', boxShadow: '0 30px 70px rgba(59,123,240,.34)' }}>
            <span style={{ position: 'absolute', top: 40, left: '10%', color: 'rgba(255,255,255,.4)', fontSize: 28, animation: 'lp-twinkle 3.4s ease-in-out infinite' }}>✦</span>
            <span style={{ position: 'absolute', bottom: 44, right: '12%', color: 'rgba(255,255,255,.35)', fontSize: 22, animation: 'lp-twinkle 4s ease-in-out infinite .8s' }}>✦</span>
            <h2 style={{ ...heading, fontSize: 42, lineHeight: 1.35, color: '#fff', marginBottom: 18 }}>あなたのAIペットを、<br />今日からはじめよう。</h2>
            <p style={{ color: 'rgba(255,255,255,.9)', fontSize: 18, lineHeight: 1.8, fontWeight: 500, marginBottom: 40 }}>登録は1分。大切な「好き」を、安心して残せます。</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={onSignup} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '19px 44px', borderRadius: 16, border: 'none', background: '#fff', color: '#2C63D8', fontWeight: 700, fontSize: 18, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 12px 26px rgba(0,0,0,.16)' }}>はじめる<span style={{ fontSize: 20 }}>→</span></button>
              <button onClick={onLogin} style={{ padding: '19px 40px', borderRadius: 16, border: '1.5px solid rgba(255,255,255,.6)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 18, fontFamily: 'inherit', cursor: 'pointer' }}>ログイン</button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ borderTop: '1px solid #EDF2FC', background: '#fff' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 40px 40px', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 42, height: 42, borderRadius: 13, background: 'linear-gradient(160deg,#EAF1FF,#D6E5FF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B7BF0' }} />
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3B7BF0' }} />
                  </div>
                </div>
                <span style={{ ...heading, fontSize: 21 }}>きおくペット</span>
              </div>
              <p style={{ color: '#8496B4', fontSize: 14, lineHeight: 1.8, fontWeight: 500, maxWidth: 280 }}>「好き」を覚えて、会話のきっかけをつくるAIペット。</p>
            </div>
            {FOOTCOLS.map((c) => (
              <div key={c.head}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>{c.head}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {c.links.map((l) => (
                    <a key={l} href="#" style={{ textDecoration: 'none', color: '#6B7A96', fontSize: 14, fontWeight: 500 }}>{l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 40px 40px', borderTop: '1px solid #F1F5FC', color: '#A3B0C8', fontSize: 13 }}>© 2026 きおくペット</div>
        </footer>

      </div>
    </div>
  );
}
