# AI Pet — DevOps x AI Agent Hackathon 2026

ユーザーの趣味嗜好を記憶し、近くにいる他ユーザーのAIペットと**鳴き声通信**で交流することで、自然な会話のきっかけを提案するWebアプリです。

## 仕様ドキュメント

| ファイル | 内容 |
|---------|------|
| [docs/agent_role.md](docs/agent_role.md) | AIペットの役割・記憶分類・口調仕様 |
| [docs/flow.md](docs/flow.md) | 全フロー図（初期設定〜交流履歴まで7フロー + ERD） |
| [docs/stack.md](docs/stack.md) | 技術スタック・Docker構成仕様 |
| [docs/frontend.md](docs/frontend.md) | フロントエンド構成・画面仕様・音声通信実装 |
| [docs/deploy.md](docs/deploy.md) | Google Cloud / Firebase への手動デプロイ手順 |

---

## アーキテクチャ概要

```
ユーザー入力 → MemoryAgent(LLM1) → Private / Public / Blocked / Review Required
                                           ↓
交換イベント → EncounterAgent(LLM2) → 共通点分析
                                           ↓
               TopicAgent(LLM3) → その場カード / 帰宅後レポート
                                           ↓
カード反応   → MemoryAgent(LLM4) → 記憶更新（ペットが育つ）
```

### 4つのLLM処理

| # | Agent | 処理内容 |
|---|-------|---------|
| LLM1 | MemoryAgent | ユーザー入力 → Private / Public / Blocked / ReviewRequired に分類 |
| LLM2 | EncounterAgent | 2ユーザーのPublic Memoryを照合 → 共通点・会話のきっかけを抽出 |
| LLM3 | TopicAgent | 交流分析 → その場カード（3枚）と帰宅後レポート（6種）を生成 |
| LLM4 | MemoryAgent | カードへの反応 → 記憶を更新してペットを育てる |

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
│   └── frontend.md            # フロントエンド構成・音声通信仕様
├── frontend/                  # Next.js + React フロントエンド
│   ├── app/                   # App Router エントリポイント
│   ├── src/
│   │   ├── App.tsx            # 画面状態管理・BottomNav
│   │   ├── types.ts           # バックエンドスキーマ対応型定義
│   │   ├── api.ts             # 全APIクライアント関数
│   │   ├── audio.ts           # 鳴き声通信（Web Audio API + FFT）
│   │   └── screens/           # 6画面コンポーネント
│   ├── package.json
│   └── next.config.ts         # Firebase Hosting 用 static export
└── backend/
    ├── Dockerfile             # python:3.12-slim、PORT=8080
    ├── .env.example           # 環境変数テンプレート
    ├── requirements.txt
    ├── sample_requests.http   # E2Eテスト用HTTPリクエスト集
    ├── app/
    │   ├── main.py            # FastAPI app + 全12エンドポイント
    │   ├── config.py          # 環境変数設定 (pydantic-settings)
    │   ├── agents/
    │   │   ├── memory_agent.py      # LLM1 + LLM4
    │   │   ├── pet_persona_agent.py # LLM1（初期プロフィール抽出）
    │   │   ├── encounter_agent.py   # LLM2 + トークン発行
    │   │   └── topic_agent.py       # LLM3（カード・レポート生成）
    │   ├── services/
    │   │   ├── vertex_ai_service.py # Gemini呼び出し（JSON強制、3リトライ）
    │   │   ├── firestore_service.py # Firestore CRUD（インメモリ fallback付き）
    │   │   └── token_service.py     # Firebase Auth + 超音波トークンエンコード
    │   ├── schemas/
    │   │   ├── pet.py
    │   │   ├── memory.py
    │   │   └── encounter.py
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
git checkout feature/ai-pet-backend
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

| Method | Path | 認証 | 説明 |
|--------|------|------|------|
| GET | `/health` | なし | ヘルスチェック |
| POST | `/pets` | 必須 | ペット作成（LLM1で初期プロフィール抽出） |
| POST | `/inputs` | 必須 | ユーザー入力→記憶分類（LLM1） |
| GET | `/memories/public` | 必須 | 自分の公開プロフィールを確認 |
| GET | `/memories/review` | 必須 | 確認待ちの記憶一覧を取得 |
| PUT | `/memories/{id}/approve` | 必須 | 記憶の公開・非公開を決定 |
| POST | `/exchanges/token` | 必須 | 交換トークン発行（超音波 + QR用） |
| POST | `/exchanges/join` | 必須 | トークンを使って交換セッションに参加 |
| POST | `/exchanges/{id}/approve` | 必須 | 交換を承認（双方承認でLLM2実行） |
| GET | `/exchanges/{id}/analysis` | 必須 | 共通点分析結果を取得 |
| GET | `/reports/{id}` | 必須 | 帰宅後レポート取得（初回アクセス時にLLM3実行） |
| POST | `/reports/{id}/feedback` | 必須 | カードへの反応を送信（LLM4で記憶更新） |

### 認証ヘッダー

```
Authorization: Bearer <Firebase ID Token>
```

ローカル開発時（`SKIP_AUTH=true`）は任意の文字列を渡すと `dev-user-id` として認識されます。

---

## E2Eテスト手順

`backend/sample_requests.http` に全シーケンスが記載されています。VS Code の [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) 拡張で実行できます。

手動 curl の場合:

```bash
BASE=http://localhost:8080
AUTH="Authorization: Bearer dev-token"

# 1. ペット作成
curl -s -X POST $BASE/pets -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"ポチ","personality":"好奇心旺盛","tone":"やわらかい短文"}' | jq .

# 2. 入力を投稿（LLM1で記憶分類）
curl -s -X POST $BASE/inputs -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"input_type":"chat","content":"最近カフェで作業するのにはまってる"}' | jq .
# → {"category":"public","safe_summary":"カフェでの作業が好き",...}

# 3. 交換トークン発行
TOKEN=$(curl -s -X POST $BASE/exchanges/token -H "$AUTH" | jq -r .token)

# 4. 交換セッションに参加
SESSION=$(curl -s -X POST $BASE/exchanges/join -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"exchange_method\":\"qr_fallback\"}" | jq -r .session_id)

# 5. 承認（双方承認でLLM2実行）
RESULT=$(curl -s -X POST $BASE/exchanges/$SESSION/approve -H "$AUTH" \
  -H "Content-Type: application/json" -d '{"approved":true}')
ANALYSIS_ID=$(echo $RESULT | jq -r .analysis_id)

# 6. 帰宅後レポート取得（初回アクセス時にLLM3実行）
curl -s $BASE/reports/$ANALYSIS_ID -H "$AUTH" | jq .
```

---

## 単体テスト

```bash
cd backend
python -m pip install -r requirements-dev.txt
pytest -q
```

| ファイル | テストケース |
|---------|------------|
| `test_health.py` | `GET /health` → 200 OK |
| `test_memory_agent.py` | 電話番号→blocked、カフェ→public、LLMエラー→privateフォールバック |
| `test_encounter_agent.py` | トークン発行、期限切れ、双方向照合でセッション成立 |
| `test_topic_agent.py` | その場カード3枚生成、帰宅後レポート6種類生成 |
| `test_prompt_regression/` | PetPersona / Memory / Encounter / Topic のゴールデンセット回帰テスト |

### プロンプトリグレッションテスト

プロンプト変更時に、4つのエージェントの入力・出力契約が崩れていないかをCIで検証します。

```bash
cd backend
pytest tests/test_prompt_regression -q
```

ゴールデンセットは以下に配置します。

```text
backend/tests/test_prompt_regression/golden_sets/
├── pet_persona_agent_cases.json
├── memory_agent_cases.json
├── encounter_agent_cases.json
└── topic_agent_cases.json
```

CIでは実LLMを呼ばず、モックLLMでプロンプトに必要情報が入っていること、期待カテゴリ・カード種別・保存ルートが維持されることを確認します。

---

## Cloud Run デプロイ

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
| `SKIP_AUTH` | `false` | `true` にすると Firebase Auth を省略（ローカル開発用） |

---

## ブランチ構成

| ブランチ | 内容 |
|---------|------|
| `main` | 本番ブランチ |
| `feature/ai-pet-backend` | バックエンド + フロントエンド実装（本ブランチ） |
| `feature/gemini-chat` | シンプルなGemini chatサンプル |
| `feature/agent-test` | エージェントランタイムの実験 |
