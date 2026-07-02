import { useMemo, useState } from 'react';
import { LABEL_TREE } from '../data/labels';
import type { SelectedLabel } from '../types';
import styles from './LabelSelectScreen.module.css';

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

type ChipState = 'on' | 'hint' | 'plain' | 'disabled';

function chipClass(state: ChipState, lg = false): string {
  return [
    styles.chip,
    lg ? styles.chipLg : '',
    state === 'on' ? styles.chipOn : '',
    state === 'hint' ? styles.chipHint : '',
    state === 'disabled' ? styles.chipDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export default function LabelSelectScreen({ initial, mode, onDone, onCancel, saving }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.map((l) => l.name).filter((n) => NAME_INFO.has(n))),
  );
  const [query, setQuery] = useState('');
  // 画面全体で1つの中カテゴリーだけ展開する（モックの見た目に合わせる）。
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

  function leafState(name: string): ChipState {
    if (selected.has(name)) return 'on';
    if (count >= MAX_LABELS) return 'disabled';
    return 'plain';
  }

  return (
    <div className={styles.screen}>
      {/* ヘッダー */}
      <div className={styles.header}>
        {mode === 'settings' && onCancel && (
          <button onClick={onCancel} disabled={saving} className={styles.close}>
            閉じる
          </button>
        )}
        <h1 className={styles.title}>すきなものをえらんでね</h1>
        <p className={styles.subtitle}>あとで会話のきっかけにするよ</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワードで検索（例: カフェ、ゲーム）"
          className={styles.search}
        />
      </div>

      {/* 本体 */}
      <div className={styles.body}>
        {q ? (
          <div className={styles.card}>
            <span className={styles.cardLabel}>検索結果</span>
            {searchResults.length === 0 ? (
              <p className={styles.empty}>見つかりませんでした</p>
            ) : (
              <div className={styles.chipRow}>
                {searchResults.map((name) => {
                  const st = leafState(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggle(name)}
                      disabled={st === 'disabled'}
                      className={chipClass(st)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
            {searchResults.length >= 200 && (
              <p className={styles.note}>上限200件まで表示。キーワードを追加して絞り込んでください。</p>
            )}
          </div>
        ) : (
          LABEL_TREE.map((g) => {
            const openM = g.mediums.find((m) => m.medium === openMedium) ?? null;
            return (
              <div key={g.large} className={openM ? `${styles.card} ${styles.cardBig}` : styles.card}>
                <span className={styles.cardLabel}>{g.large}</span>

                {/* 中カテゴリー（タップで小カテゴリーを開閉） */}
                <div className={styles.chipRow}>
                  {g.mediums.map((m) => {
                    const isOpen = openMedium === m.medium;
                    const hasSel = selected.has(m.medium) || m.items.some((s) => selected.has(s));
                    const st: ChipState = isOpen ? 'on' : hasSel ? 'hint' : 'plain';
                    return (
                      <button
                        key={m.medium}
                        onClick={() => setOpenMedium(isOpen ? null : m.medium)}
                        className={chipClass(st)}
                      >
                        {m.medium}
                      </button>
                    );
                  })}
                </div>

                {/* 展開パネル: 中カテゴリー自体（全般）+ 小カテゴリー（いずれも選択可） */}
                {openM && (
                  <div className={styles.panel}>
                    {(() => {
                      const st = leafState(openM.medium);
                      return (
                        <button
                          onClick={() => toggle(openM.medium)}
                          disabled={st === 'disabled'}
                          className={chipClass(st, true)}
                        >
                          {openM.medium}（全般）
                        </button>
                      );
                    })()}
                    {openM.items.map((s) => {
                      const st = leafState(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggle(s)}
                          disabled={st === 'disabled'}
                          className={chipClass(st, true)}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* フッター */}
      <div className={styles.footer}>
        <p className={styles.hint}>
          <span className={styles.spark}>✦</span>
          {count < MIN_LABELS ? `あと${remaining}つえらぶと、話題が作りやすくなるよ` : '5つ以上えらべたよ！'}
          <span className={styles.spark}>✦</span>
        </p>
        <button onClick={confirm} disabled={!canConfirm} className={styles.nextBtn}>
          {saving ? '保存中...' : mode === 'onboarding' ? 'つぎへ' : '保存する'}
          {!saving && <span className={styles.nextChevron}>›</span>}
        </button>
      </div>
    </div>
  );
}
