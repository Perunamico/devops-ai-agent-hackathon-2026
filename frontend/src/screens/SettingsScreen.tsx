import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { getAuthState, signOutUser, type AuthState } from '../firebase';
import styles from './SettingsScreen.module.css';

const APP_VERSION = '1.0.0';

// ---- アプリ情報の本文 ----

const HELP_STEPS: { title: string; body: string }[] = [
  { title: '1. ペットを育てる', body: 'ホームで日々の気づきや好きなことを入力すると、AIペットがあなたの趣味嗜好を記憶して育っていきます。' },
  { title: '2. 近くのペットと交流', body: '「あそぶ」から鳴き声通信を使って、近くにいる他ユーザーのペットと記憶を交換します。マイクが使えない場合はQRコードで交換できます。' },
  { title: '3. 共通点を受け取る', body: '交換が成立すると、共通の話題や会話のきっかけがカードとして届きます。帰宅後レポートも確認できます。' },
  { title: '4. ひみつを管理', body: '「ひみつ」で公開してよいか確認待ちの記憶を承認・非公開にできます。電話番号など危険な情報は自動でブロックされます。' },
];

const TERMS_TEXT = `本利用規約（以下「本規約」）は、AI Pet（以下「本サービス」）の利用条件を定めるものです。本サービスを利用された場合、本規約に同意したものとみなします。

第1条（適用）
本規約は、本サービスの提供条件および利用者と運営者との間の権利義務関係を定めるものとし、本サービスの利用に関わる一切の関係に適用されます。

第2条（利用登録）
本サービスは匿名認証により利用を開始できます。利用者は自己の責任において本サービスを利用するものとします。

第3条（禁止事項）
利用者は、本サービスの利用にあたり、次の行為をしてはなりません。
・法令または公序良俗に違反する行為
・他の利用者または第三者の権利・利益を侵害する行為
・本サービスの運営を妨害する行為
・他人の個人情報を不正に取得・収集・開示する行為
・本サービスを商業目的で無断利用する行為

第4条（記憶情報の取り扱い）
本サービスは、利用者が入力した情報をAIが解析し、公開してよい情報のみを他の利用者と交換します。電話番号・住所などの機微な情報は自動的に非公開（ブロック）として扱われますが、その完全性を保証するものではありません。公開を望まない情報は入力しないようご注意ください。

第5条（免責事項）
本サービスはAIによる解析結果や交流のきっかけ提案について、その正確性・有用性を保証しません。本サービスの利用により生じた損害について、運営者は一切の責任を負いません。

第6条（サービス内容の変更・停止）
運営者は、利用者への事前の通知なく、本サービスの内容を変更または提供を停止することができます。

第7条（規約の変更）
運営者は、必要と判断した場合、利用者に通知することなく本規約を変更できるものとします。

本規約は AI Pet（DevOps × AI Agent Hackathon 2026 出展作品）のデモ用サービスを対象としています。`;

const PRIVACY_TEXT = `本プライバシーポリシーは、AI Pet（以下「本サービス」）における利用者情報の取り扱い方針を定めるものです。

1. 取得する情報
本サービスは、以下の情報を取得します。
・利用者が入力したテキスト（日々の記録・趣味・関心など）
・匿名認証によって割り当てられる利用者識別子（UID）
・ペットの設定情報（名前・性格・口調）

2. 位置情報について
本サービスはGPS等による位置情報を取得しません。近くのユーザーとの交流は、端末のマイク・スピーカーを用いた鳴き声（音）通信、またはQRコードによってのみ行われます。

3. 情報の利用目的
取得した情報は、以下の目的でのみ利用します。
・AIによる趣味嗜好の解析とペットの育成
・他ユーザーとの共通点抽出および会話のきっかけ提案
・本サービスの品質改善

4. AIによる解析
利用者の入力は、生成AI（Google Gemini）によって解析されます。解析にあたり、公開してよい情報と非公開にすべき情報を自動で分類します。

5. 第三者への提供
本サービスは、利用者が交換に同意した「公開情報」に限り、交流相手のユーザーに共有します。それ以外の非公開情報を第三者へ提供することはありません。法令に基づく場合を除き、利用者の同意なく個人情報を第三者へ提供しません。

6. 情報の管理と削除
利用者はログアウトにより、本端末上のローカルデータを消去できます。

7. お問い合わせ
本サービスはDevOps × AI Agent Hackathon 2026の出展作品です。本ポリシーは予告なく変更される場合があります。`;

type SheetKey = 'help' | 'terms' | 'privacy';

const SHEET_TITLES: Record<SheetKey, string> = {
  help: '使い方',
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
};

export default function SettingsScreen() {
  const { setScreen, setPet } = useApp();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    getAuthState().then(setAuth);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await signOutUser();
    try {
      localStorage.clear();
    } catch {
      // localStorage が使えない環境でも続行
    }
    setPet(null);
    setScreen('home');
    // 状態を完全にリセットするためリロード
    window.location.reload();
  }

  function statusLabel(): string {
    if (!auth) return '確認中...';
    if (!auth.configured) return 'ローカルモード（未ログイン）';
    if (!auth.signedIn) return '未ログイン';
    return auth.isAnonymous ? 'ゲストとしてログイン中' : 'ログイン中';
  }

  return (
    <div className={styles.screen}>
      <div>
        <h2 className={styles.headerTitle}>設定</h2>
        <p className={styles.headerSub}>アカウントとアプリの情報を確認できます。</p>
      </div>

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
          {auth?.uid && (
            <div className={styles.uidBlock}>
              <p className={styles.uidLabel}>ユーザーID</p>
              <p className={styles.uidValue}>{auth.uid}</p>
            </div>
          )}
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
              <p className={styles.confirmDesc}>この端末のローカルデータが消去されます。</p>
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
