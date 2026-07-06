import type { Metadata } from 'next';
import { TERMS_TEXT } from '../../src/content/legalText';

export const metadata: Metadata = {
  title: '利用規約 | Topipet',
};

export default function TermsPage() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px', fontFamily: "'Noto Sans JP',sans-serif", color: '#1F2A44' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 28 }}>利用規約</h1>
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.9, color: '#43506B' }}>{TERMS_TEXT}</p>
    </div>
  );
}
