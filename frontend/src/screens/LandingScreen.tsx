import { useState } from 'react';
import type { CSSProperties } from 'react';
import { TERMS_TEXT, PRIVACY_TEXT } from '../content/legalText';

interface Feature {
  icon: string;
  iconColor: string;
  ring: string;
  title: string;
  body: string;
  imgLabel: string;
}

interface Step {
  no: string;
  icon: string;
  title: string;
  body: string;
}

type LegalKey = 'terms' | 'privacy';

interface FooterLink {
  label: string;
  href: string;
  key: LegalKey;
}

const LEGAL_TITLES: Record<LegalKey, string> = {
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
};

const LEGAL_TEXTS: Record<LegalKey, string> = {
  terms: TERMS_TEXT,
  privacy: PRIVACY_TEXT,
};

const FEATURES: Feature[] = [
  { icon: '✓', iconColor: '#1F9E8C', ring: '#B9E4DC', title: '安心して覚える', body: 'あなたの「好き」や大切なことを、AIペットがそっと覚えます。', imgLabel: '安心設計' },
  { icon: '✎', iconColor: '#3B7BF0', ring: '#C6DAF9', title: '共有する前に確認', body: '記憶ごとに共有・編集・非共有を選べるから、プライバシーも安心。', imgLabel: '確認フロー' },
  { icon: '👥', iconColor: '#3B7BF0', ring: '#C6DAF9', title: '共通の話題を発見', body: '友だちのAIペットとつながり、共通の話題のきっかけを提案。', imgLabel: '話題の発見' },
  { icon: '💡', iconColor: '#F0A93B', ring: '#F7DFB4', title: '話題のヒントを提案', body: 'AIペットが会話のきっかけになりそうな話題をそっと提案します。', imgLabel: '提案カード' },
  { icon: '🌱', iconColor: '#1F9E8C', ring: '#B9E4DC', title: '育つほど、深まる関係', body: '記憶が増えるほど、AIペットとの会話も、友だちとの関係も深まっていきます。', imgLabel: '育成イメージ' },
];

const STEPS: Step[] = [
  { no: '1', icon: '🐣', title: 'AIペットを迎える', body: '名前をつけて、あなただけのAIペットをはじめましょう。' },
  { no: '2', icon: '💬', title: '「好き」を伝える', body: '話しかけるだけ。ペットが大切な記憶をやさしく覚えます。' },
  { no: '3', icon: '✨', title: '話題がひろがる', body: '共有した記憶から、友だちとの共通の話題が見つかります。' },
];

const FOOTER_LINKS: FooterLink[] = [
  { label: 'プライバシーポリシー', href: '/privacy', key: 'privacy' },
  { label: '利用規約', href: '/terms', key: 'terms' },
];

const heading: CSSProperties = { fontFamily: "'Zen Kaku Gothic New',sans-serif", fontWeight: 900 };

export default function LandingScreen({ onLogin, onSignup }: { onLogin: () => void; onSignup: () => void }) {
  const [legalSheet, setLegalSheet] = useState<LegalKey | null>(null);
  return (
    <div className="lp-page" style={{ fontFamily: "'Noto Sans JP',sans-serif", color: '#1F2A44', background: '#fff', WebkitFontSmoothing: 'antialiased' }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes lp-floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes lp-twinkle{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes lp-rippling{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.9);opacity:0}}

        .lp-page {
          --lp-pad-x: 20px;
          --lp-hero-pad-top: 32px;
          --lp-hero-cols: 1fr;
          --lp-h1-size: 34px;
          --lp-hero-visual-min-h: 380px;
          --lp-grid-cols-3: 1fr;
          --lp-h2-size: 28px;
          --lp-cta-pad-y: 7px;
          --lp-cta-pad-x: 24px;
          --lp-cta-h2-size: 28px;
          --lp-feature-card-w: 240px;
        }
        .lp-nav-links { display: none; }
        .lp-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .lp-scroll::-webkit-scrollbar { display: none; }
        @media (min-width: 768px) {
          .lp-page {
            --lp-pad-x: 40px;
            --lp-hero-pad-top: 70px;
            --lp-h1-size: 44px;
            --lp-hero-visual-min-h: 560px;
            --lp-grid-cols-3: repeat(3,1fr);
            --lp-h2-size: 44px;
            --lp-cta-pad-y: 13px;
            --lp-cta-pad-x: 48px;
            --lp-cta-h2-size: 38px;
            --lp-feature-card-w: 280px;
          }
          .lp-nav-links { display: flex; }
        }
        @media (min-width: 1100px) {
          .lp-page {
            --lp-hero-cols: 1fr 1fr;
            --lp-h1-size: 48px;
          }
        }
        @media (max-width: 480px) {
          .lp-star { display: none; }
        }
      `}</style>

      <div style={{ minHeight: '100%', background: 'linear-gradient(180deg,#fff 0%,#F6F9FF 55%,#fff 100%)', overflowX: 'hidden' }}>

        {/* HEADER */}
        <header style={{ position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,.82)', borderBottom: '1px solid #EDF2FC' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px var(--lp-pad-x)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/lp/topipet-mark-only.svg" alt="" style={{ height: 40, width: 'auto' }} />
              <img src="/lp/topipet-wordmark-only.svg" alt="Topipet" style={{ height: 24, width: 'auto' }} />
            </div>
            <nav className="lp-nav-links" style={{ alignItems: 'center', gap: 40 }}>
              <a href="#how" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>しくみ</a>
              <a href="#features" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>特徴</a>
              <a href="#video" style={{ textDecoration: 'none', color: '#43506B', fontWeight: 700, fontSize: 16 }}>動画</a>
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={onLogin} style={{ padding: '11px 26px', borderRadius: 12, border: '1.5px solid #C3D8FB', background: '#fff', color: '#3B7BF0', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>ログイン</button>
              <button onClick={onSignup} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: '#3B7BF0', color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 8px 20px rgba(59,123,240,.32)' }}>はじめる</button>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section style={{ maxWidth: 1240, margin: '0 auto', padding: 'var(--lp-hero-pad-top) var(--lp-pad-x) 40px', display: 'grid', gridTemplateColumns: 'var(--lp-hero-cols)', gap: 48, alignItems: 'center' }}>
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
            <h1 style={{ ...heading, fontSize: 'var(--lp-h1-size)', lineHeight: 1.18, letterSpacing: '.01em', position: 'relative' }}>
              「好き」を覚えて、<br />
              <span style={{ position: 'relative', display: 'inline-block' }}>
                会話のきっかけに。
                <svg style={{ position: 'absolute', left: 0, bottom: -6, width: '78%', height: 14 }} viewBox="0 0 300 14" preserveAspectRatio="none">
                  <path d="M2 9 C80 2 220 2 298 8" stroke="#9AD8CE" strokeWidth={6} strokeLinecap="round" fill="none" opacity=".8" />
                </svg>
              </span>
            </h1>
            <p style={{ marginTop: 30, fontSize: 18, lineHeight: 1.9, color: '#54617C', fontWeight: 500 }}>
              相手との会話のきっかけを提案する、エージェンティックなTopic Petです。あなたの趣味・嗜好を聞き出して、交流した相手との共通点、あなた自身の関心ポイントを教えてくれます。
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

          {/* hero visual */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'var(--lp-hero-visual-min-h)' }}>
            <span className="lp-star" style={{ position: 'absolute', top: 60, left: '2%', color: '#7FB0F5', fontSize: 26, animation: 'lp-twinkle 3.2s ease-in-out infinite' }}>✦</span>
            <span className="lp-star" style={{ position: 'absolute', top: '34%', left: '-2%', color: '#A9C8F7', fontSize: 18, animation: 'lp-twinkle 4s ease-in-out infinite .6s' }}>✦</span>
            <span style={{ position: 'absolute', top: 8, right: '16%', color: '#7FB0F5', fontSize: 22, animation: 'lp-twinkle 3.6s ease-in-out infinite .9s' }}>✦</span>

            <img src="/lp/big.png" alt="共通の趣味・関心をつなぐTopipet" style={{ position: 'relative', top: 15, zIndex: 2, width: '100%', maxWidth: 560, height: 'auto' }} />
          </div>
        </section>

        {/* HOW (3 steps) */}
        <section id="how" style={{ maxWidth: 1140, margin: '0 auto', padding: '70px var(--lp-pad-x) 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ ...heading, fontSize: 'var(--lp-h2-size)', lineHeight: 1.3 }}>3ステップではじめられます</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--lp-grid-cols-3)', gap: 28 }}>
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

        {/* FEATURE CARDS */}
        <section id="features" style={{ padding: '20px 0 90px' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 var(--lp-pad-x)', marginBottom: 28 }}>
            <h2 style={{ ...heading, fontSize: 'var(--lp-h2-size)', lineHeight: 1.3 }}>安心して覚える、いくつもの理由</h2>
          </div>
          <div className="lp-scroll" style={{ display: 'flex', gap: 20, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '4px var(--lp-pad-x) 12px' }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ flex: '0 0 var(--lp-feature-card-w)', scrollSnapAlign: 'start', background: '#fff', border: '1px solid #EAF0FB', borderRadius: 24, padding: 24, boxShadow: '0 10px 30px rgba(46,86,170,.06)' }}>
                <div style={{ width: '100%', aspectRatio: '4/3', borderRadius: 16, background: 'repeating-linear-gradient(135deg,#EEF4FF 0 14px,#E6EFFD 14px 28px)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <span style={{ fontFamily: "'Courier New',monospace", fontSize: 12, color: '#8AA0C6', letterSpacing: '.03em' }}>{f.imgLabel}の画像</span>
                </div>
                <div style={{ width: 50, height: 50, borderRadius: '50%', border: `2px solid ${f.ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: f.iconColor, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ ...heading, fontSize: 19, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: '#5B6882', fontSize: 14.5, lineHeight: 1.8, fontWeight: 500 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VIDEO SECTION */}
        <section id="video" style={{ background: 'linear-gradient(180deg,#EAF2FF,#F4F8FF)', padding: '96px var(--lp-pad-x)' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '7px 20px', borderRadius: 999, background: '#fff', border: '1.5px solid #DCE8FC', color: '#3B7BF0', fontWeight: 700, fontSize: 14, marginBottom: 24 }}>✦ 90秒でわかる</span>
            <h2 style={{ ...heading, fontSize: 'var(--lp-h2-size)', lineHeight: 1.3, marginBottom: 18 }}>動画で見る、Topipet</h2>
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

        {/* CTA */}
        <section style={{ maxWidth: 1240, margin: '0 auto', padding: '20px var(--lp-pad-x) 100px' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 34, background: 'linear-gradient(150deg,#3B7BF0,#2C63D8)', padding: 'var(--lp-cta-pad-y) var(--lp-cta-pad-x)', textAlign: 'center', boxShadow: '0 30px 70px rgba(59,123,240,.34)' }}>
            <span style={{ position: 'absolute', top: 40, left: '10%', color: 'rgba(255,255,255,.4)', fontSize: 28, animation: 'lp-twinkle 3.4s ease-in-out infinite' }}>✦</span>
            <span style={{ position: 'absolute', bottom: 44, right: '12%', color: 'rgba(255,255,255,.35)', fontSize: 22, animation: 'lp-twinkle 4s ease-in-out infinite .8s' }}>✦</span>
            <h2 style={{ ...heading, fontSize: 'var(--lp-cta-h2-size)', lineHeight: 1.35, color: '#fff', marginBottom: 12 }}>あなたのAIペットを、<br />今日からはじめよう。</h2>
            <p style={{ color: 'rgba(255,255,255,.9)', fontSize: 16, lineHeight: 1.7, fontWeight: 500, marginBottom: 24 }}>登録は1分。大切な「好き」を、安心して残せます。</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={onSignup} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '19px 44px', borderRadius: 16, border: 'none', background: '#fff', color: '#2C63D8', fontWeight: 700, fontSize: 18, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 12px 26px rgba(0,0,0,.16)' }}>はじめる<span style={{ fontSize: 20 }}>→</span></button>
              <button onClick={onLogin} style={{ padding: '19px 40px', borderRadius: 16, border: '1.5px solid rgba(255,255,255,.6)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 18, fontFamily: 'inherit', cursor: 'pointer' }}>ログイン</button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ borderTop: '1px solid #EDF2FC', background: '#fff' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '40px var(--lp-pad-x)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/lp/topipet-mark-only.svg" alt="" style={{ height: 34, width: 'auto' }} />
              <img src="/lp/topipet-wordmark-only.svg" alt="Topipet" style={{ height: 20, width: 'auto' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {FOOTER_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={(e) => { e.preventDefault(); setLegalSheet(l.key); }}
                  style={{ textDecoration: 'none', color: '#6B7A96', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >{l.label}</a>
              ))}
            </div>
          </div>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 var(--lp-pad-x) 32px', color: '#A3B0C8', fontSize: 13 }}>© 2026 Topipet</div>
        </footer>

        {legalSheet && (
          <div
            onClick={() => setLegalSheet(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(31,42,68,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 480, maxHeight: '85svh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 70px rgba(31,42,68,.3)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF2FA' }}>
                <h3 style={{ ...heading, fontSize: 17, margin: 0 }}>{LEGAL_TITLES[legalSheet]}</h3>
                <button
                  onClick={() => setLegalSheet(null)}
                  aria-label="閉じる"
                  style={{ border: 'none', background: 'transparent', color: '#9AA8C2', fontSize: 24, lineHeight: 1, padding: '0 4px', cursor: 'pointer' }}
                >×</button>
              </div>
              <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '20px 22px' }}>
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.85, color: '#43506B', margin: 0 }}>{LEGAL_TEXTS[legalSheet]}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
