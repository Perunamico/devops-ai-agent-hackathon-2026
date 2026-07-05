// FriendsScreen とその「話題を見る」モーダルで共有する小さなヘルパー。
// 循環 import を避けるため、両方から参照される部分だけをここに切り出している。

// アバター背景はデザインのパステル3色を順繰りに使う。
export const TINTS = ['#e7ecfb', '#e5f1ea', '#ede8fa'];

// ISO日時 →「たった今 / N分前 / N時間前 / N日前」。統計バーは数値と単位を
// 分けて表示するため {value, unit} で返し、カードでは連結して使う。
export function relativeParts(iso: string | null): { value: string; unit: string } {
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

export function relativeLabel(iso: string | null): string {
  const p = relativeParts(iso);
  return `${p.value}${p.unit}`;
}

export function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flex: '0 0 auto' }} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#93a4c4" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="#93a4c4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
