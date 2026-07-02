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

// 全 selectable 名 -> ラベル情報。中・小・最小のいずれも選択対象（名前はツリー全体で一意）。
// category_large は backend の固定カテゴリー(=中カテゴリー medium)。
const NAME_INFO = new Map<string, SelectedLabel>();
for (const g of LABEL_TREE) {
  for (const m of g.mediums) {
    NAME_INFO.set(m.medium, {
      name: m.medium,
      category_large: m.medium,
      category_medium: '',
      category_small: '',
    });
    for (const s of m.smalls) {
      NAME_INFO.set(s.small, {
        name: s.small,
        category_large: m.medium,
        category_medium: s.small,
        category_small: '',
      });
      for (const x of s.items) {
        NAME_INFO.set(x, {
          name: x,
          category_large: m.medium,
          category_medium: s.small,
          category_small: x,
        });
      }
    }
  }
}

const ALL_NAMES = Array.from(NAME_INFO.keys());

type ChipState = 'on' | 'hint' | 'plain' | 'disabled';

function chipClass(state: ChipState): string {
  return [
    styles.chip,
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

  // 親カテゴリー（中/小）の状態。展開は「選択」から導出するため、選択中の子がある限り開いたまま。
  function branchState(name: string, hasSelectedChild: boolean): ChipState {
    if (selected.has(name)) return 'on';
    if (hasSelectedChild) return 'hint';
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
          LABEL_TREE.map((g) => (
            <div key={g.large} className={styles.card}>
              <span className={styles.cardLabel}>{g.large}</span>

              {/* 1つの折り返し行に中→小→最小をインライン展開する。
                  親を選ぶ（＝カウント）と、その右続きに子が挿入される。
                  配下に選択がある限り親の展開は閉じない（展開は選択から導出）。 */}
              <div className={styles.chipRow}>
                {g.mediums.flatMap((m) => {
                  const mediumHasChild = m.smalls.some(
                    (s) => selected.has(s.small) || s.items.some((x) => selected.has(x)),
                  );
                  const els = [
                    <button
                      key={m.medium}
                      onClick={() => toggle(m.medium)}
                      disabled={branchState(m.medium, mediumHasChild) === 'disabled'}
                      className={chipClass(branchState(m.medium, mediumHasChild))}
                    >
                      {m.medium}
                    </button>,
                  ];
                  // 中カテゴリーが選択済み or 配下に選択があれば、小カテゴリーを右続きに展開。
                  if (selected.has(m.medium) || mediumHasChild) {
                    for (const s of m.smalls) {
                      const smallHasMini = s.items.some((x) => selected.has(x));
                      els.push(
                        <button
                          key={s.small}
                          onClick={() => toggle(s.small)}
                          disabled={branchState(s.small, smallHasMini) === 'disabled'}
                          className={chipClass(branchState(s.small, smallHasMini))}
                        >
                          {s.small}
                        </button>,
                      );
                      // 小カテゴリーが選択済み or 最小に選択があれば、最小を右続きに展開。
                      if (selected.has(s.small) || smallHasMini) {
                        for (const x of s.items) {
                          const st = leafState(x);
                          els.push(
                            <button
                              key={x}
                              onClick={() => toggle(x)}
                              disabled={st === 'disabled'}
                              className={chipClass(st)}
                            >
                              {x}
                            </button>,
                          );
                        }
                      }
                    }
                  }
                  return els;
                })}
              </div>
            </div>
          ))
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
