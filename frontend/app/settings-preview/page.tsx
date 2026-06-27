'use client';

// 設定画面だけを単独で確認するためのプレビュールート。
// 既存のアプリ本体（命名→ホーム→各画面）には影響しない。
// バックエンドやペット作成なしで http://localhost:3000/settings-preview を開けば表示される。
import SettingsScreen from '../../src/screens/SettingsScreen';

export default function SettingsPreviewPage() {
  return (
    <div style={{ maxWidth: '28rem', margin: '0 auto', minHeight: '100svh', background: '#fff' }}>
      <SettingsScreen />
    </div>
  );
}
