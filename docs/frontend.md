# フロントエンド構成仕様

## 概要

`frontend/` ディレクトリに実装されたWebアプリです。
バックエンドAPIと連携し、AIペットの作成・記憶入力・鳴き声通信による交換・レポート閲覧まで、全フローをブラウザ上で体験できます。

---

## 技術スタック

| 項目 | 選択 | 理由 |
|------|------|------|
| ビルドツール | Vite + React + TypeScript | 高速HMR、型安全 |
| スタイル | TailwindCSS v3 | ユーティリティクラスで素早くモバイルUI |
| QRコード | qrcode.react | 交換トークンのQR表示 |
| 音声通信 | Web Audio API（標準ブラウザAPI） | マイク録音・FFT解析・超音波トーン再生 |
| ルーティング | React state（`screen` 変数） | ページ数が少なく react-router 不要 |
| サーバー通信 | fetch + useState/useEffect | 外部ライブラリ不要 |
| APIプロキシ | Vite dev proxy `/api` → `localhost:8080` | CORS問題を回避 |

---

## ディレクトリ構成

```
frontend/
├── index.html
├── package.json
├── vite.config.ts          # /api → localhost:8080 プロキシ
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── src/
    ├── main.tsx            # Reactエントリーポイント
    ├── App.tsx             # 画面状態管理・Context・BottomNav
    ├── types.ts            # バックエンドPydanticスキーマ対応の型定義
    ├── api.ts              # 全APIクライアント関数
    ├── audio.ts            # 鳴き声通信ロジック（送受信）
    ├── App.css             # 空ファイル（TailwindCSSで管理）
    ├── index.css           # Tailwindディレクティブ
    └── screens/
        ├── SetupScreen.tsx     # ペット作成
        ├── HomeScreen.tsx      # ホーム・入力・公開メモリ表示
        ├── ReviewScreen.tsx    # 確認待ち記憶の承認/拒否
        ├── ExchangeScreen.tsx  # 鳴き声通信・QRフォールバック
        ├── AnalysisScreen.tsx  # 共通点分析結果
        └── ReportScreen.tsx    # 帰宅後レポート・カード反応
```

---

## アプリ状態管理

`App.tsx` が React Context でグローバル状態を保持します。画面遷移は `setScreen()` の呼び出しのみで完結します。

```typescript
type Screen = 'setup' | 'home' | 'review' | 'exchange' | 'analysis' | 'report';

interface AppCtx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  pet: PetResponse | null;       // 作成済みペット情報
  setPet: (p: PetResponse | null) => void;
  sessionId: string | null;      // アクティブな交換セッションID
  setSessionId: (id: string | null) => void;
  analysisId: string | null;     // 分析結果ID（レポート表示に使用）
  setAnalysisId: (id: string | null) => void;
}
```

画面遷移フロー：

```
起動
 └─ SetupScreen（ペット作成）
      └─ HomeScreen（ホーム）
           ├─ ReviewScreen（確認待ち記憶）
           ├─ ExchangeScreen（鳴き声通信・QR）
           │    └─ AnalysisScreen（共通点表示）
           │         └─ ReportScreen（帰宅後レポート）
           └─ ReportScreen（過去のレポート再表示）
```

---

## 画面仕様

### SetupScreen
ペット作成フォーム。アプリ初回起動時のみ表示されます（BottomNavなし）。

- **入力フィールド**：ペット名（最大50字）、性格・特徴（最大200字）、話し方・口調（最大200字）
- **API**：`POST /pets` → 成功でContextに `pet` を保存 → `home` へ遷移
- **ローディング状態**：「ペットが目覚めています...」（LLM1処理中）

---

### HomeScreen
日常利用の起点。入力・公開メモリ確認・交換への導線を持ちます。

- **ペット情報ヘッダー**：ペット名・性格を表示
- **要確認バッジ**：`GET /memories/review` で件数取得、1件以上で ReviewScreen へのリンクを表示
- **InputComposer**：chat / diary / interest_tag の3モードを切り替えるタブ付きテキストエリア
  - `POST /inputs` → LLM1がカテゴリ判定
  - 結果（public / private / blocked / review_required）をインライントーストで表示
- **公開メモリカード**：`GET /memories/public` で取得した `safe_topic_tags`（チップ）・`safe_summaries`・`public_conversation_hooks` を表示

---

### ReviewScreen
LLM1が `review_required` と判定した記憶の承認画面。

- **一覧**：`GET /memories/review` で取得
- 各アイテムに `candidate_summary`・`reason` を表示
- **承認/拒否ボタン**：`PUT /memories/{id}/approve` → 楽観的UI（即時リストから削除）
- 承認した記憶は公開メモリに昇格、拒否した記憶はブロック済みとして記録される

---

### ExchangeScreen
**このアプリのコア機能**。ドキュメントの「鳴き声通信フロー」を実装しています。

#### ステート遷移

```
idle
 └─ [近くのペットを探す]
      └─ requesting_mic（マイク許可確認）
           ├─ searching（トークン発行 + 鳴き声再生 + 聴取中）
           │    ├─ detected（相手トークン検出 → join）
           │    │    └─ approving（交換承認画面）
           │    │         └─ waiting_analysis（分析待ちポーリング）
           │    └─ [タイムアウト / ボタン] → qr_fallback
           └─ [マイク拒否] → qr_fallback
```

#### 鳴き声通信の動作

1. マイク許可を `getUserMedia` で確認
2. `POST /exchanges/token` でトークン発行（`sound_frequencies` と `qr_data` を取得）
3. **送信**：`playToken()` で `sound_frequencies` を Web Audio API で順次再生
4. **受信**：`listenForToken()` でマイク入力を FFT 解析し相手のトークンを検出
5. 検出成功 → `POST /exchanges/join` で参加 → `POST /exchanges/{id}/approve` で承認
6. 分析完了後 → `GET /exchanges/{id}/analysis` で `analysis_id` を取得 → AnalysisScreen へ遷移

#### QRフォールバック

マイク不可・検出失敗・タイムアウトの場合、自動でQRコード表示に切り替えます。
失敗理由（マイク許可なし・検出失敗・期限切れ等）を画面に表示します。

---

### AnalysisScreen
交換後の共通点分析結果を表示します。

- **API**：`GET /exchanges/{sessionId}/analysis`（`sessionId` はContextから取得）
- 表示内容：
  - `common_topics`：ハイライトチップ
  - `conversation_hooks`：会話のきっかけ一覧
  - `on_site_cards`：その場カード（最大3枚）
  - `related_topics`：関連トピック
- 「帰宅後レポートを見る」ボタン → ReportScreen へ遷移

---

### ReportScreen
帰宅後レポート（最大6枚のカード）を表示します。

- **API**：`GET /reports/{analysisId}`（初回アクセス時にLLM3が生成するため数秒かかる）
- ローディング中：「ペットがレポートを作成中...」
- 各カードにリアクションボタン（保存🔖・使った✓・いらない✗）
  - クリックで `POST /reports/{analysisId}/feedback` → fire-and-forget（LLM4が記憶更新）

#### カードタイプと色

| card_type | アイコン | 背景色 | 意味 |
|-----------|---------|--------|------|
| common_point | 💜 | purple | 今日の共通点 |
| conversation_starter | 💬 | blue | 会話ネタ・アイスブレイク |
| next_topic | → | teal | 次回につながる話題 |
| thank_you_template | ✉️ | amber | ありがとうLINE案 |
| new_interest | ✨ | green | 新しい趣味候補 |
| pet_message | 🐾 | rose | ペットからの一言 |

---

## 音声通信実装（audio.ts）

### エンコード仕様（バックエンドと共通）

バックエンドの `token_service.py` と同じ仕様でエンコード/デコードします。

```
トークン（8文字 = 8バイト）
  → 各バイトを上位ニブル（4bit）と下位ニブル（4bit）に分割
  → 各ニブル（0〜15）を周波数にマッピング：17000 + nibble × 200 Hz
  → 16個の周波数列（17000〜20000 Hz）
```

| 定数 | 値 | 説明 |
|------|-----|------|
| `FREQ_BASE` | 17000 Hz | 最低データ周波数 |
| `FREQ_STEP` | 200 Hz | ステップ幅 |
| `PILOT_FREQ` | 16800 Hz | 同期用パイロットトーン |
| `TONE_DURATION` | 250 ms | データトーン1音あたりの長さ |
| `PILOT_DURATION` | 300 ms | パイロットトーンの長さ |

**送信シーケンス**（合計約4.6秒）：
```
pilot(300ms) → tone[0](250ms) → tone[1](250ms) → ... → tone[15](250ms) → pilot(300ms)
```

### 送信（playToken）

```typescript
export async function playToken(frequencies: number[]): Promise<void>
```

`AudioContext` の `OscillatorNode` を使って各周波数を指定時間再生します。
ゲインフェードでクリックノイズを防止しています。

### 受信（listenForToken）

```typescript
export async function listenForToken(
  onToken: (token: string) => void,
  onError: (msg: string) => void
): Promise<StopListening>
```

1. `getUserMedia({ audio: true })` でマイクストリームを取得
2. `AnalyserNode`（fftSize: 8192）で高解像度FFT
3. 16500〜20500 Hz の帯域でピーク周波数を検出
4. 最近傍スナッピングで16800 / 17000〜20000 Hz の格子にスナップ
5. `pilot → 16データトーン → pilot` のパターンを検出したらデコード
6. ニブル列 → バイト列 → ASCII文字列（トークン）を復元
7. `onToken(token)` を呼び出してExchangeScreenに通知

クリーンアップ関数を返すので、コンポーネントの `useEffect` でアンマウント時に `stopListening()` を呼び出すことで確実にマイクを解放できます。

### トークン長の選定理由

バックエンドは `secrets.token_urlsafe(6)` で **8文字**のトークンを生成します（6バイト → base64url = 8文字）。

`encode_token_to_frequencies` は先頭8バイトのみエンコードするため、8文字トークンにすることで**全バイトが音声で完全伝送**できます。

---

## APIクライアント（api.ts）

Vite の dev proxy が `/api/*` を `http://localhost:8080/*` に転送するため、CORS設定なしで動作します。

```typescript
// 全APIコール共通のベースfetch
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>
```

`Authorization: Bearer dev-token` ヘッダーを自動付与します（`SKIP_AUTH=true` のバックエンドが認証をスキップ）。

エラー時はバックエンドの `{ detail: string }` レスポンスから `Error` をスローします。

---

## 型定義（types.ts）

バックエンドの Pydantic スキーマをそのまま TypeScript インターフェースとして定義しています。
バックエンドのスキーマ変更時はこのファイルも合わせて更新してください。

対応関係：

| TypeScript | Python (Pydantic) |
|------------|------------------|
| `PetCreate` | `pet.PetCreate` |
| `PetResponse` | `pet.PetResponse` |
| `MemoryClassifyResult` | `memory.MemoryClassifyResult` |
| `PublicMemoryResponse` | `memory.PublicMemoryResponse` |
| `ReviewItem` | `memory.ReviewItem` |
| `ExchangeTokenResponse` | `encounter.ExchangeTokenResponse` |
| `ExchangeAnalysisResponse` | `encounter.ExchangeAnalysisResponse` |
| `ReportCard` | `encounter.ReportCard` |
| `ReportResponse` | `encounter.ReportResponse` |

---

## ローカル起動手順

```bash
# バックエンド（別ターミナル）
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload

# フロントエンド
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

`backend/.env` に以下を設定してください：

```env
GEMINI_API_KEY=your-api-key
SKIP_AUTH=true
FIRESTORE_ENABLED=false
```

---

## デモシナリオ（推奨操作順）

1. **セットアップ**：http://localhost:5173 を開く → ペット名・性格・口調を入力して作成
2. **記憶入力**：「カフェで作業するのが好き」「読書が趣味」などをchatモードで数件入力
3. **公開メモリ確認**：ホーム下部にタグが追加されることを確認
4. **交換（発行側）**：「近くのペットを探す」をクリック → マイク許可 → 鳴き声が再生される
5. **交換（参加側）**：別タブ・別デバイスで同じアプリを開き、マイクで鳴き声を検出
6. **承認**：双方で「交換を承認する」をクリック
7. **分析**：共通トピック・会話のきっかけが表示される
8. **レポート**：「帰宅後レポートを見る」→ 6枚のカードを確認し、リアクションを押す
