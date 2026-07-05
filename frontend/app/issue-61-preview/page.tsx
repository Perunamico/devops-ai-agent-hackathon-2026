'use client';

// 本番さながらのプレビュールート（issue-61 の確認用）。
// 実物の <App /> をそのまま描画し、バックエンド(/api/*)だけをモックで肩代わりするので、
// Gemini APIキーや Firestore なしでフロントエンドを完全再現できる。
//   → http://localhost:3000/issue-61-preview （dev のポートに合わせて開く）
//
// 確認の流れ:
//   1. 名前を入力 → ホーム(active)へ。ペット動画・吹き出し・チャットがそのまま動く。
//   2. 左下/上のナビから あそぶ / ともだち / ひみつ / 設定 を行き来できる。
//   3. ブラウザ幅を 768px 以上にすると、ナビが左脇の縦サイドバーへ移り動画が縦に拡大する(issue-61)。
//
// 本番(`/`)のコードは一切変更していない。モックはこのルートを開いている間だけ window.fetch に被せる。
import { useState } from 'react';
import App from '../../src/App';
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

  return <App initialPet={PREVIEW_PET} />;
}
