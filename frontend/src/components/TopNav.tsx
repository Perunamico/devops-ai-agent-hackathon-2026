'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '../AppContext';

const NAV_ITEMS: { key: string; href: string | null; label: string; iconImg: string }[] = [
  // 「あそぶ」は遷移せず、まずマイク確認ポップアップを開く（volume 完了後に /exchange へ）。
  { key: 'petexchange', href: null,        label: 'あそぶ',   iconImg: '/icons/interact.png' },
  { key: 'friends',     href: '/friends',  label: 'ともだち', iconImg: '/icons/friends.png'  },
  { key: 'review',      href: '/review',   label: 'ひみつ',   iconImg: '/icons/secrets.png'  },
  { key: 'settings',    href: '/settings', label: '設定',     iconImg: '/icons/settings.png' },
];

// プレビュー用ルートもホーム扱いにする（issue-61-preview はホームレイアウト確認用）。
export function isHomePath(pathname: string): boolean {
  return pathname === '/home' || pathname === '/issue-61-preview';
}

export default function TopNav() {
  const { setExchangeSetupStep, homeLoading, naming, reviewCount, interactionActive } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  if (homeLoading || naming) return null;

  // 交流成立中はホームへの戻りバーを出さない（Issue #103）。バイバイで終える導線に一本化する。
  if (interactionActive) return null;

  // ホーム以外（記憶/ひみつ画面を含む）は下部にホーム戻りバーを表示する。
  if (!isHomePath(pathname)) {
    return (
      <nav className="side-nav side-nav--sub" style={{ willChange: 'transform' }}>
        <button
          onClick={() => router.push('/home')}
          className="flex items-center gap-1.5 text-gray-900 text-sm font-medium"
        >
          <img src="/icons/home.png" className="w-10 h-10 object-contain" alt="" />
          ホーム
          <img src="/icons/home.png" className="w-10 h-10 object-contain" alt="" />
        </button>
      </nav>
    );
  }

  return (
    <nav className="side-nav side-nav--home" style={{ willChange: 'transform' }}>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          onClick={() => {
            if (item.href === null) setExchangeSetupStep('mic');
            else router.push(item.href);
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-white border border-gray-200 shadow-sm rounded-2xl transition-all"
        >
          <div className="relative">
            <img src={item.iconImg} className="w-8 h-8 object-contain" alt={item.label} />
            {item.key === 'review' && reviewCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  padding: '0 2px',
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#fff',
                  background: '#4670e6',
                }}
              >
                {reviewCount}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
