'use client';

// 本番さながらのプレビュールート（issue-61 の確認用）。
// AppProvider に initialPet を渡して認証・命名フローを飛ばし、バックエンド(/api/*)だけを
// モックで肩代わりするので、Gemini APIキーや Firestore なしでホーム画面を再現できる。
//   → http://localhost:3000/issue-61-preview （dev のポートに合わせて開く）
//
// 確認の流れ:
//   1. いきなり active ホーム。ペット動画・吹き出し・チャットがそのまま動く。
//   2. ブラウザ幅を 768px 以上にすると、ナビが左脇の縦サイドバーへ移り動画が縦に拡大する(issue-61)。
//
// 注意: 全画面ルート化に伴い、ナビをクリックすると実ルート（/friends 等）へ遷移する。
// 実ルート側はルートの AppProvider（実認証）配下なので、未ログインだと入口へ戻される。
// このプレビューの目的はホームのレイアウト/サイドナビ確認であり、その範囲では従来どおり使える。
import { useState } from 'react';
import { AppProvider } from '../../src/AppContext';
import AppShell from '../../src/components/AppShell';
import HomeScreen from '../../src/screens/HomeScreen';
import type { PetResponse } from '../../src/types';
import { installApiMock } from './mockApi';

// SSR 中は window が無いので無視され、クライアントで読み込まれた時点で /api/* を横取りする。
installApiMock();

// 命名フローを飛ばして、いきなり本番さながらの active ホーム（ペット・動画・ナビあり）から始める。
const PREVIEW_PET: PetResponse = {
  pet_id: 'pet-preview-1',
  user_id: 'user-preview-1',
  name: 'ぽち',
  personality: '元気で友好的',
  tone: '自然体でカジュアル',
  created_at: new Date().toISOString(),
};

export default function Issue61PreviewPage() {
  // モック適用済みを render 前に確実化（ホットリロード等で取りこぼさないための保険）。
  useState(() => {
    installApiMock();
    return null;
  });

  // ルート layout の AppProvider をこのネストした Provider がシャドウし、
  // プレビュー用の擬似ログイン状態（initialPet）を配下に提供する。
  return (
    <AppProvider initialPet={PREVIEW_PET}>
      <AppShell>
        <HomeScreen />
      </AppShell>
    </AppProvider>
  );
}
