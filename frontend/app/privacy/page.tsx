import type { Metadata } from 'next';
import { PRIVACY_TEXT } from '../../src/content/legalText';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Topipet',
};

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px', fontFamily: "'Noto Sans JP',sans-serif", color: '#1F2A44' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 28 }}>プライバシーポリシー</h1>
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.9, color: '#43506B' }}>{PRIVACY_TEXT}</p>
    </div>
  );
}
