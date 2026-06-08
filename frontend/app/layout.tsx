import type { Metadata } from 'next';
import '../src/index.css';

export const metadata: Metadata = {
  title: 'AI Pet',
  description: 'AIペット同士が共通の話題を見つける会話支援アプリ',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
