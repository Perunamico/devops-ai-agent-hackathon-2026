import { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { getAuthState, signOutUser, type AuthState } from '../firebase';
import { getSelectedLabels, putSelectedLabels } from '../api';
import type { SelectedLabel } from '../types';
import { TERMS_TEXT, PRIVACY_TEXT } from '../content/legalText';
import LabelSelectScreen from './LabelSelectScreen';
import styles from './SettingsScreen.module.css';

const APP_VERSION = '1.0.0';

// ---- アプリ情報の本文 ----

const HELP_STEPS: { title: string; body: string }[] = [
  { title: '1. ペットを育てる', body: 'ホームで日々の気づきや好きなことを入力すると、AIペットがあなたの趣味嗜好を記憶して育っていきます。' },
  { title: '2. 近くのペットと交流', body: '「あそぶ」から鳴き声通信を使って、近くにいる他ユーザーのペットと記憶を交換します。マイクが使えない場合はQRコードで交換できます。' },
  { title: '3. 共通点を受け取る', body: '交換が成立すると、共通の話題や会話のきっかけがカードとして届きます。帰宅後レポートも確認できます。' },
  { title: '4. ひみつを管理', body: '「ひみつ」で公開してよいか確認待ちの記憶を承認・非公開にできます。電話番号など危険な情報は自動でブロックされます。' },
];

type SheetKey = 'help' | 'terms' | 'privacy';

const SHEET_TITLES: Record<SheetKey, string> = {
  help: '使い方',
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
};

export default function SettingsScreen() {
  const { setPet } = useApp();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // 好きなもの（ラベル）編集
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelInitial, setLabelInitial] = useState<SelectedLabel[]>([]);
  const [labelsReady, setLabelsReady] = useState(false);
  const [savingLabels, setSavingLabels] = useState(false);

  useEffect(() => {
    getAuthState().then(setAuth);
  }, []);

  async function openLabelEditor() {
    setLabelsReady(false);
    setEditingLabels(true);
    try {
      const res = await getSelectedLabels();
      setLabelInitial(res.labels ?? []);
    } catch {
      setLabelInitial([]);
    } finally {
      setLabelsReady(true);
    }
  }

  async function saveLabels(labels: SelectedLabel[]) {
    setSavingLabels(true);
    try {
      await putSelectedLabels(labels);
      setEditingLabels(false);
    } catch {
      // 保存失敗時は編集画面に留まる
    } finally {
      setSavingLabels(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    await signOutUser();
    try {
      localStorage.clear();
    } catch {
      // localStorage が使えない環境でも続行
    }
    setPet(null);
    // 状態を完全にリセットするためハード遷移で入口（LP）へ戻る
    window.location.replace('/');
  }

  function statusLabel(): string {
    if (!auth) return '確認中...';
    if (!auth.configured) return 'ローカルモード（未ログイン）';
    if (!auth.signedIn) return '未ログイン';
    return auth.email ? `${auth.email} でログイン中` : 'ログイン中';
  }

  if (editingLabels) {
    if (!labelsReady) {
      return (
        <div className={styles.screen}>
          <p className={styles.headerSub}>好きなものを読み込み中...</p>
        </div>
      );
    }
    return (
      <LabelSelectScreen
        initial={labelInitial}
        mode="settings"
        saving={savingLabels}
        onDone={saveLabels}
        onCancel={() => setEditingLabels(false)}
      />
    );
  }

  return (
    <div className={styles.screen}>
      <div>
        <h2 className={styles.headerTitle}>設定</h2>
        <p className={styles.headerSub}>アカウントとアプリの情報を確認できます。</p>
      </div>

      {/* 好きなもの */}
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>好きなもの</h3>
        <div className={styles.card}>
          <button className={styles.rowButton} onClick={openLabelEditor}>
            <span className={styles.rowPlain}>好きなものを編集</span>
            <span className={styles.chevron}>›</span>
          </button>
        </div>
      </section>

      {/* アカウント */}
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>アカウント</h3>
        <div className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <img src="/icons/settings.png" className={styles.rowIcon} alt="" />
              <div>
                <p className={styles.rowTitle}>ログイン状態</p>
                <p className={styles.rowSub}>{statusLabel()}</p>
              </div>
            </div>
          </div>
          <button className={styles.rowButton} onClick={() => setConfirmLogout(true)}>
            <span className={styles.logoutText}>ログアウト</span>
            <span className={styles.chevron}>›</span>
          </button>
        </div>
      </section>

      {/* アプリ情報 */}
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>アプリ情報</h3>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.rowPlain}>バージョン</span>
            <span className={styles.rowValue}>{APP_VERSION}</span>
          </div>
          {(['help', 'terms', 'privacy'] as SheetKey[]).map((key) => (
            <button key={key} className={styles.rowButton} onClick={() => setSheet(key)}>
              <span className={styles.rowPlain}>{SHEET_TITLES[key]}</span>
              <span className={styles.chevron}>›</span>
            </button>
          ))}
        </div>
        <p className={styles.footer}>AI Pet — DevOps × AI Agent Hackathon 2026</p>
      </section>

      {/* ログアウト確認ダイアログ */}
      {confirmLogout && (
        <div className={`${styles.overlay} ${styles.confirmOverlay}`}>
          <div className={styles.confirmCard}>
            <div className={styles.confirmHead}>
              <h3 className={styles.confirmTitle}>ログアウトしますか？</h3>
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.dangerButton} onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? 'ログアウト中...' : 'ログアウト'}
              </button>
              <button className={styles.cancelButton} onClick={() => setConfirmLogout(false)} disabled={loggingOut}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使い方 / 規約 / プライバシー シート */}
      {sheet && (
        <div className={`${styles.overlay} ${styles.sheetOverlay}`} onClick={() => setSheet(null)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>
              <h3 className={styles.sheetTitle}>{SHEET_TITLES[sheet]}</h3>
              <button className={styles.sheetClose} onClick={() => setSheet(null)}>×</button>
            </div>
            <div className={styles.sheetBody}>
              {sheet === 'help' ? (
                <div className={styles.helpList}>
                  {HELP_STEPS.map((step) => (
                    <div key={step.title}>
                      <p className={styles.helpTitle}>{step.title}</p>
                      <p className={styles.helpBody}>{step.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.docText}>{sheet === 'terms' ? TERMS_TEXT : PRIVACY_TEXT}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
