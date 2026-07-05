# AI Pet — DevOps x AI Agent Hackathon 2026

ユーザーの趣味嗜好を記憶し、近くにいる他ユーザーのAIペットと**鳴き声通信**で交流することで、自然な会話のきっかけを提案するWebアプリです。

## デプロイ先

| 環境 | URL | 備考 |
|------|-----|------|
| Production (`main`) | https://gen-lang-client-0099285268.web.app | `main` への merge / push 後に自動デプロイ |
| Development (`dev`) | https://gen-lang-client-0099285268-dev.web.app | `dev` への merge / push 後に自動デプロイ |

PR の動作確認用 Preview URL は、各 PR の `Deploy Preview` コメントに表示されます。

## 仕様ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/agent_role.md](docs/agent_role.md) | AIペットの役割・記憶分類・口調仕様 |
| [docs/flow.md](docs/flow.md) | 全フロー図（初期設定〜交流履歴まで + ERD） |
| [docs/stack.md](docs/stack.md) | 技術スタック・Docker構成仕様 |
| [docs/frontend.md](docs/frontend.md) | フロントエンド構成・画面仕様・音声通信実装 |
| [docs/deploy.md](docs/deploy.md) | Google Cloud / Firebase への手動デプロイ手順 |
| [docs/cicd-deploy.md](docs/cicd-deploy.md) | GitHub Actions による自動デプロイ（CI/CD）構成 |

---

## アーキテクチャ概要

```
雑談チャット → ConversationAgent → ペットの応答（応答後に記憶を再分類）
ユーザー入力 → MemoryAgent(LLM1) → Private / Public / Blocked / Review Required
                                           ↓
鳴き声/QR交換 → EncounterAgent(LLM2) → 共通点分析・交流メッセージ
                                           ↓
               TopicAgent(LLM3) → その場カード / 帰宅後レポート
```

### LLM処理

| Agent | 処理内容 |
|-------|---------|
| ConversationAgent | ペットとの雑談チャット応答を生成。応答後に記憶の再分類をバックグラウンド実行 |
| MemoryAgent (LLM1) | ユーザー入力 → Private / Public / Blocked / ReviewRequired に分類。カードへの反応による記憶更新も担当 |
| EncounterAgent (LLM2) | 2ユーザーのPublic Memoryを照合 → 共通点・交流メッセージを抽出（マッチ成立時に非同期実行） |
| TopicAgent (LLM3) | 交流分析 → その場カード（3枚）と帰宅後レポート（6種）を生成 |

---

## 技術スタック

| 領域 | 技術 |
|------|------|
| Frontend | Next.js + React + TypeScript |
| Backend | FastAPI (Python 3.12) |
| AI | Vertex AI Gemini (`gemini-2.5-flash`) |
| Database | Firestore |
| Auth | Firebase Authentication |
| Deploy | Cloud Run (Docker) + Firebase Hosting |

---

## ファイル構成

```
.
├── README.md
├── docs/
│   ├── agent_role.md          # AIペットの役割・口調仕様
│   ├── flow.md                # 全フロー図（Mermaid）
│   ├── stack.md               # 技術スタック・Docker仕様
│   ├── frontend.md            # フロントエンド構成・音声通信仕様
│   ├── deploy.md              # 手動デプロイ手順
│   └── cicd-deploy.md         # CI/CD 自動デプロイ構成
├── frontend/                  # Next.js + React フロントエンド
│   ├── app/                   # App Router エントリポイント
│   ├── public/                # 静的アセット
│   ├── src/
│   │   ├── App.tsx            # 画面状態管理・BottomNav
│   │   ├── types.ts           # バックエンドスキーマ対応型定義
│   │   ├── api.ts             # 全APIクライアント関数
│   │   ├── audio.ts           # 鳴き声通信（Web Audio API + FFT）
│   │   ├── firebase.ts        # Firebase Auth 初期化
│   │   ├── assets/            # 画像・アニメーション素材
│   │   ├── content/           # 文言・コンテンツ定義
│   │   ├── data/              # 静的データ
│   │   └── screens/           # 10画面コンポーネント
│   ├── package.json
│   └── next.config.ts         # Firebase Hosting 用 static export
└── backend/
    ├── Dockerfile             # python:3.12-slim、PORT=8080
    ├── .env.example           # 環境変数テンプレート
    ├── requirements.txt
    ├── requirements-dev.txt   # テスト用依存（pytest, httpx）
    ├── sample_requests.http   # 動作確認用HTTPリクエスト集
    ├── app/
    │   ├── main.py            # FastAPI app + 全23エンドポイント
    │   ├── config.py          # 環境変数設定 (pydantic-settings)
    │   ├── agents/
    │   │   ├── conversation_agent.py # 雑談チャット応答
    │   │   ├── memory_agent.py      # LLM1（記憶分類・記憶更新）
    │   │   ├── pet_persona_agent.py # 初期プロフィール抽出（現在未使用）
    │   │   ├── encounter_agent.py   # LLM2 + トークン発行・マッチング
    │   │   └── topic_agent.py       # LLM3（カード・レポート生成）
    │   ├── services/
    │   │   ├── vertex_ai_service.py # Gemini呼び出し（JSON強制、3リトライ）
    │   │   ├── firestore_service.py # Firestore CRUD（インメモリ fallback付き）
    │   │   └── token_service.py     # Firebase Auth + 超音波トークンエンコード
    │   ├── schemas/
    │   │   ├── pet.py
    │   │   ├── memory.py
    │   │   ├── encounter.py
    │   │   └── chat.py
    │   └── utils/
    │       ├── json_utils.py
    │       └── rule_filter.py
    └── tests/
```

---

## ローカル環境構築

### 前提条件

- Node.js 18以上、npm
- Python 3.12
- Gemini API キー（[Google AI Studio](https://aistudio.google.com/) で取得）

### フロントエンド + バックエンド 同時起動

**1. リポジトリをクローン**

```bash
git clone https://github.com/Perunamico/devops-ai-agent-hackathon-2026.git
cd devops-ai-agent-hackathon-2026
```

**2. 環境変数ファイルを作成**

```bash
cp backend/.env.example backend/.env
```

`backend/.env` を編集して Gemini API キーを設定:

```env
GEMINI_API_KEY=your-gemini-api-key-here
SKIP_AUTH=true
FIRESTORE_ENABLED=false
```

> `FIRESTORE_ENABLED=false` でFirestoreなしのインメモリモードで動作します。GCPアカウント不要。

**3. バックエンドを起動**（ターミナル 1）

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8080 --reload
```

起動確認：

```bash
curl http://localhost:8080/health
# → {"status":"ok"}
```

**4. フロントエンドを起動**（ターミナル 2）

```bash
cd frontend
npm install
npm run dev
```

**5. ブラウザで確認**

http://localhost:3000 を開くとアプリが表示されます。

```
http://localhost:3000  ← フロントエンド（Next.js）
http://localhost:8080  ← バックエンドAPI（FastAPI）
```

ローカル開発では `next.config.ts` の rewrites が `/api/*` を `localhost:8080` へ転送します。本番では Firebase Hosting の rewrites が `/api/*` を Cloud Run へ転送します。

### Docker での起動（バックエンドのみ）

```bash
cd backend
docker build -t ai-pet-api .
docker run -p 8080:8080 --env-file .env ai-pet-api
```

---

## APIエンドポイント一覧

`GET /health` 以外はすべて認証必須です。

### ペット・チャット

| Method | Path | 説明 |
|--------|------|------|
| GET | `/health` | ヘルスチェック（認証不要） |
| POST | `/pets` | ペット作成（名前・性格・口調を保存） |
| GET | `/pets/me` | 自分のペット情報を取得 |
| POST | `/chat` | ペットとの雑談。応答後に記憶の再分類を非同期実行 |
| POST | `/inputs` | ユーザー入力→記憶分類（LLM1） |

### 記憶

| Method | Path | 説明 |
|--------|------|------|
| GET | `/memories` | 記憶一覧（review / allowed / secret） |
| GET | `/memories/public` | 自分の公開プロフィールを確認 |
| GET | `/memories/review` | 確認待ちの記憶一覧を取得 |
| PUT | `/memories/{id}/approve` | 記憶の公開・非公開を決定 |
| GET | `/memories/labels` | 選択済みの興味ラベルを取得 |
| PUT | `/memories/labels` | 興味ラベルを更新（最大30件） |

### 交換（鳴き声 / QR）

| Method | Path | 説明 |
|--------|------|------|
| POST | `/exchanges/token` | 交換トークン発行（超音波 + QR用） |
| POST | `/exchanges/resolve` | 受信した鳴き声トークンを解決してマッチング |
| GET | `/exchanges/match/{pending_id}` | マッチ成立をポーリング（受信側） |
| GET | `/exchanges/token/{token_key}/poll` | マッチ成立をポーリング（発行側） |
| POST | `/exchanges/qr-scan/{token_key}` | QRスキャンで交換セッションに参加 |
| GET | `/exchanges/session/{session_id}` | 交換セッションの状態を取得 |
| POST | `/exchanges/session/{session_id}/ready` | 交流開始の準備完了を通知 |
| POST | `/exchanges/session/{session_id}/end` | 交流セッションを終了 |
| GET | `/exchanges/{session_id}/analysis` | 共通点分析結果を取得（分析はマッチ成立時にLLM2が非同期実行） |

### 友達・レポート

| Method | Path | 説明 |
|--------|------|------|
| GET | `/friends` | 交流が成立した相手の一覧を取得 |
| GET | `/reports/{analysis_id}` | 帰宅後レポート取得（初回アクセス時にLLM3実行） |
| POST | `/reports/{analysis_id}/feedback` | カードへの反応を送信（記憶更新） |

### 認証ヘッダー

```
Authorization: Bearer <Firebase ID Token>
```

ローカル開発時（`SKIP_AUTH=true`）は任意の文字列を渡すと `dev-user-id` として認識されます。

---

## 単体テスト

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests/ -v
```

| ファイル | 対象 |
|---------|------|
| `test_health.py` | ヘルスチェック |
| `test_conversation_agent.py` | 雑談チャット応答 |
| `test_memory_agent.py` | 記憶分類（blocked / public / フォールバック） |
| `test_encounter_agent.py` | トークン発行・マッチング・共通点分析 |
| `test_encounter_mutual_ready.py` | 双方 ready 時のセッション遷移 |
| `test_topic_agent.py` | その場カード・帰宅後レポート生成 |
| `test_firestore_memory_list.py` | 記憶一覧の取得 |
| `test_firestore_service_safety.py` | Firestore アクセスの安全性 |
| `test_friends.py` | 友達一覧 |
| `test_report_authorization.py` | レポートの認可チェック |
| `test_token_service.py` | 認証・超音波トークンエンコード |

---

## デプロイ

`main` / `dev` への push で GitHub Actions が自動デプロイします（[docs/cicd-deploy.md](docs/cicd-deploy.md) 参照）。

手動で Cloud Run へデプロイする場合（詳細は [docs/deploy.md](docs/deploy.md)）:

```bash
PROJECT=your-project-id
REGION=asia-northeast1
IMAGE=$REGION-docker.pkg.dev/$PROJECT/ai-pet/api:latest

docker build -t $IMAGE ./backend
docker push $IMAGE

gcloud run deploy ai-pet-api \
  --image $IMAGE \
  --region $REGION \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,USE_VERTEX_AI=true,GEMINI_MODEL=gemini-2.5-flash" \
  --allow-unauthenticated
```

---

## 環境変数リファレンス

| 変数名 | デフォルト | 説明 |
|-------|-----------|------|
| `GEMINI_API_KEY` | なし | Gemini API キー（ローカル開発用） |
| `USE_VERTEX_AI` | `false` | `true` にすると Vertex AI 経由で Gemini を呼び出す |
| `GOOGLE_CLOUD_PROJECT` | なし | GCP プロジェクト ID |
| `VERTEX_AI_LOCATION` | `asia-northeast1` | Vertex AI リージョン |
| `GEMINI_MODEL` | `gemini-2.5-flash` | 使用するモデル名 |
| `FIRESTORE_DATABASE` | `(default)` | Firestore データベース名 |
| `FIRESTORE_ENABLED` | `true` | `false` にするとインメモリで動作（ローカル開発用） |
| `FIREBASE_PROJECT_ID` | なし | Firebase Auth のプロジェクト ID |
| `SKIP_AUTH` | `false` | `true` にすると Firebase Auth を省略（ローカル開発用） |
| `LOG_LEVEL` | `INFO` | ログレベル |

---

## ブランチ構成

| ブランチ | 内容 |
|---------|------|
| `main` | 本番ブランチ。push / merge で本番環境へ自動デプロイ |
| `dev` | 開発ブランチ。push / merge で開発環境へ自動デプロイ |
| `feature/*` | 作業ブランチ。`dev` へ push で反映し、`main` へは PR 経由で反映 |

---

## CI/CD Automation

GitHub Actions で以下を自動実行します。

* CI
  * frontend: `npm ci`, `npm run lint`, `npm run build`
  * backend: `pip install -r requirements-dev.txt`, `pytest -q`
  * 対象: `main` / `dev` 向け Pull Request、`main` / `dev` / `feature/**` への push
* CD
  * `main` / `dev` への push で Firebase Hosting + Cloud Run へ自動デプロイ
  * Pull Request では Preview 環境（Hosting Preview Channel + PR 専用 Cloud Run）を作成
  * 構成の詳細は [docs/cicd-deploy.md](docs/cicd-deploy.md) を参照
