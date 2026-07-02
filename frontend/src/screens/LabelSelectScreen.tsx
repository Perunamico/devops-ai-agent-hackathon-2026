import { useMemo, useState } from 'react';
import { LABEL_TREE } from '../data/labels';
import type { SelectedLabel } from '../types';

export const MIN_LABELS = 5;
export const MAX_LABELS = 30;

interface Props {
  initial: SelectedLabel[];
  mode: 'onboarding' | 'settings';
  onDone: (labels: SelectedLabel[]) => void;
  onCancel?: () => void;
  saving?: boolean;
}

// 全 selectable 名 -> ラベル情報。中カテゴリー・小カテゴリーの両方を登録する（名前はツリー全体で一意）。
const NAME_INFO = new Map<string, SelectedLabel>();
for (const g of LABEL_TREE) {
  for (const m of g.mediums) {
    NAME_INFO.set(m.medium, {
      name: m.medium,
      category_large: g.large,
      category_medium: m.medium,
      category_small: '',
    });
    for (const s of m.items) {
      NAME_INFO.set(s, {
        name: s,
        category_large: g.large,
        category_medium: m.medium,
        category_small: s,
      });
    }
  }
}

const ALL_NAMES = Array.from(NAME_INFO.keys());

type ChipVariant = 'selected' | 'open' | 'hint' | 'plain';

function Chip({
  name,
  variant,
  disabled,
  size = 'sm',
  onClick,
}: {
  name: string;
  variant: ChipVariant;
  disabled?: boolean;
  size?: 'sm' | 'lg';
  onClick: () => void;
}) {
  const base =
    'rounded-full font-medium transition-all active:scale-[0.97] disabled:opacity-100';
  const sizing = size === 'lg' ? 'px-5 py-3 text-[15px]' : 'px-4 py-2 text-sm';
  const look =
    variant === 'selected' || variant === 'open'
      ? 'text-white bg-gradient-to-b from-[#63a4ff] to-[#3d7bff] shadow-[0_6px_14px_rgba(61,123,255,0.35)] border border-transparent'
      : variant === 'hint'
        ? 'text-[#3d7bff] bg-[#e9f1ff] border border-[#cfe0ff] shadow-sm'
        : disabled
          ? 'text-gray-300 bg-white border border-gray-100'
          : 'text-gray-600 bg-white border border-[#e2ebff] shadow-sm';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${sizing} ${look}`}>
      {name}
    </button>
  );
}

// カード隅のきらめき装飾。
function Sparkles() {
  return (
    <>
      <span className="pointer-events-none absolute left-4 top-3 text-[#a9c6ff] text-xs select-none">✦</span>
      <span className="pointer-events-none absolute left-7 top-5 text-[#c7dbff] text-[8px] select-none">✦</span>
      <span className="pointer-events-none absolute right-5 top-4 text-[#bcd4ff] text-[10px] select-none">✧</span>
    </>
  );
}

export default function LabelSelectScreen({ initial, mode, onDone, onCancel, saving }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.map((l) => l.name).filter((n) => NAME_INFO.has(n))),
  );
  const [query, setQuery] = useState('');
  // 画面全体で1つの中カテゴリーだけ展開する（画像の見た目に合わせる）。
  const [openMedium, setOpenMedium] = useState<string | null>(null);

  const q = query.trim();
  const count = selected.size;
  const remaining = Math.max(0, MIN_LABELS - count);
  const canConfirm = count >= MIN_LABELS && !saving;

  const searchResults = useMemo(() => {
    if (!q) return [];
    return ALL_NAMES.filter((n) => n.includes(q)).slice(0, 200);
  }, [q]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else {
        if (next.size >= MAX_LABELS) return prev;
        next.add(name);
      }
      return next;
    });
  }

  function confirm() {
    if (!canConfirm) return;
    const labels: SelectedLabel[] = Array.from(selected).map(
      (name) => NAME_INFO.get(name) ?? { name, category_large: 'その他' },
    );
    onDone(labels);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-b from-[#f6f9ff] to-[#eaf1ff]">
      {/* ヘッダー */}
      <div className="relative shrink-0 px-5 pt-6 pb-3 text-center">
        {mode === 'settings' && onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="absolute right-5 top-6 text-sm text-[#8aa6d6]"
          >
            閉じる
          </button>
        )}
        <h1 className="text-[26px] font-extrabold text-[#2b7cff] tracking-tight">
          すきなものをえらんでね
        </h1>
        <p className="mt-1 text-sm text-[#7f93b5]">あとで会話のきっかけにするよ</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワードで検索（例: カフェ、ゲーム）"
          className="mt-3 w-full rounded-full border border-[#dbe6ff] bg-white/80 px-4 py-2 text-sm text-gray-700 outline-none focus:border-[#7fa8ff]"
        />
      </div>

      {/* 本体 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {q ? (
          <div className="relative rounded-[26px] bg-white/70 border border-white shadow-[0_8px_22px_rgba(80,120,240,0.10)] p-4 overflow-hidden">
            <Sparkles />
            <p className="relative mb-3 pl-1 text-sm font-semibold text-[#4a90ff]">検索結果</p>
            {searchResults.length === 0 ? (
              <p className="relative text-center text-sm text-gray-400 py-6">見つかりませんでした</p>
            ) : (
              <div className="relative flex flex-wrap gap-2">
                {searchResults.map((name) => {
                  const on = selected.has(name);
                  return (
                    <Chip
                      key={name}
                      name={name}
                      variant={on ? 'selected' : 'plain'}
                      disabled={!on && count >= MAX_LABELS}
                      onClick={() => toggle(name)}
                    />
                  );
                })}
              </div>
            )}
            {searchResults.length >= 200 && (
              <p className="relative text-[10px] text-gray-400 mt-2">
                上限200件まで表示。キーワードを追加して絞り込んでください。
              </p>
            )}
          </div>
        ) : (
          LABEL_TREE.map((g) => {
            const openM = g.mediums.find((m) => m.medium === openMedium) ?? null;
            return (
              <div
                key={g.large}
                className="relative rounded-[26px] bg-white/70 border border-white shadow-[0_8px_22px_rgba(80,120,240,0.10)] p-4 overflow-hidden"
              >
                <Sparkles />
                {/* 中央上の淡い光 */}
                <div className="pointer-events-none absolute inset-x-10 top-6 h-20 rounded-full bg-[#cfe0ff]/40 blur-2xl" />
                <p className="relative mb-3 pl-1 text-sm font-semibold text-[#4a90ff]">{g.large}</p>

                {/* 中カテゴリー（タップで小カテゴリーを開閉） */}
                <div className="relative flex flex-wrap gap-2">
                  {g.mediums.map((m) => {
                    const isOpen = openMedium === m.medium;
                    const hasSel =
                      selected.has(m.medium) || m.items.some((s) => selected.has(s));
                    return (
                      <Chip
                        key={m.medium}
                        name={m.medium}
                        variant={isOpen ? 'open' : hasSel ? 'hint' : 'plain'}
                        onClick={() => setOpenMedium(isOpen ? null : m.medium)}
                      />
                    );
                  })}
                </div>

                {/* 展開パネル: 中カテゴリー自体 + 小カテゴリー（いずれも選択可） */}
                {openM && (
                  <div className="relative mt-3 rounded-2xl bg-[#eef4ff] p-3">
                    <div className="flex flex-wrap gap-2.5">
                      <Chip
                        name={`${openM.medium}（全般）`}
                        variant={selected.has(openM.medium) ? 'selected' : 'plain'}
                        size="lg"
                        disabled={!selected.has(openM.medium) && count >= MAX_LABELS}
                        onClick={() => toggle(openM.medium)}
                      />
                      {openM.items.map((s) => {
                        const on = selected.has(s);
                        return (
                          <Chip
                            key={s}
                            name={s}
                            variant={on ? 'selected' : 'plain'}
                            size="lg"
                            disabled={!on && count >= MAX_LABELS}
                            onClick={() => toggle(s)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* フッター */}
      <div className="shrink-0 px-5 pt-2 pb-4 bg-gradient-to-t from-[#eaf1ff] to-transparent">
        <p className="text-center text-sm text-[#5b8def] mb-2">
          <span className="text-[#a9c6ff]">✦</span>{' '}
          {count < MIN_LABELS
            ? `あと${remaining}つえらぶと、話題が作りやすくなるよ`
            : '5つ以上えらべたよ！'}{' '}
          <span className="text-[#a9c6ff]">✦</span>
        </p>
        <button
          onClick={confirm}
          disabled={!canConfirm}
          className={`w-full rounded-full py-4 font-bold text-lg flex items-center justify-center gap-1 transition-all ${
            canConfirm
              ? 'text-white bg-gradient-to-b from-[#63a4ff] to-[#3d7bff] shadow-[0_8px_18px_rgba(61,123,255,0.4)]'
              : 'text-white/90 bg-[#b9cdf2]'
          }`}
        >
          {saving ? '保存中...' : mode === 'onboarding' ? 'つぎへ' : '保存する'}
          {!saving && <span className="text-xl leading-none">›</span>}
        </button>
      </div>
    </div>
  );
}
