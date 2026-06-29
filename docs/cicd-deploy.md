# CI/CD Deploy

GitHub の `main` と `dev` に push された内容を、自動で別々の常設環境へデプロイします。Pull Request では Firebase Hosting Preview Channel と PR 専用 Cloud Run service を作成します。

## デプロイ先

| Branch | 用途 | Firebase Hosting site | Cloud Run service |
| --- | --- | --- | --- |
| `main` | 本番 | `gen-lang-client-0099285268` | `ai-pet-api` |
| `dev` | 開発確認 | `gen-lang-client-0099285268-dev` | `ai-pet-api-dev` |
| Pull Request | 一時確認 | `gen-lang-client-0099285268-dev` の preview channel | `ai-pet-api-pr-<PR番号>` |

`dev` は Firebase Hosting の preview channel ではなく、独立した Hosting site と Cloud Run service を使います。AI 応答や `/api/**` rewrite を含めた動作確認を常設 URL で行えます。

## 事前準備

### Firebase Hosting site

`main` 用 site は既存のものを使います。`dev` 用 site が未作成の場合は、一度だけ作成します。

```bash
firebase hosting:sites:create gen-lang-client-0099285268-dev \
  --project gen-lang-client-0099285268
```

Firebase Authentication を使う場合は、Authentication の承認済みドメインに以下を追加します。

```txt
gen-lang-client-0099285268.web.app
gen-lang-client-0099285268.firebaseapp.com
gen-lang-client-0099285268-dev.web.app
gen-lang-client-0099285268-dev.firebaseapp.com
```

### Artifact Registry

Docker image は Artifact Registry repository `ai-pet` に push します。未作成の場合は一度だけ作成します。

```bash
gcloud artifacts repositories create ai-pet \
  --project gen-lang-client-0099285268 \
  --repository-format docker \
  --location asia-northeast1
```

### Cloud Run runtime service account

Cloud Run 実行用サービスアカウントは `ai-pet-api-runner` を使います。未作成の場合は作成します。

```bash
gcloud iam service-accounts create ai-pet-api-runner \
  --project gen-lang-client-0099285268 \
  --display-name "AI Pet API Cloud Run runtime"
```

Firestore と Vertex AI を使うため、実行用サービスアカウントに権限を付与します。

```bash
gcloud projects add-iam-policy-binding gen-lang-client-0099285268 \
  --member "serviceAccount:ai-pet-api-runner@gen-lang-client-0099285268.iam.gserviceaccount.com" \
  --role "roles/datastore.user"

gcloud projects add-iam-policy-binding gen-lang-client-0099285268 \
  --member "serviceAccount:ai-pet-api-runner@gen-lang-client-0099285268.iam.gserviceaccount.com" \
  --role "roles/aiplatform.user"
```

### Secret Manager

Gemini API キーを Secret Manager に登録します。workflow は Cloud Run deploy 時に `--set-secrets "GEMINI_API_KEY=gemini-api-key:latest"` で注入します。

```bash
gcloud secrets create gemini-api-key \
  --project gen-lang-client-0099285268 \
  --replication-policy=automatic

echo -n "your-actual-api-key" | gcloud secrets versions add gemini-api-key \
  --project gen-lang-client-0099285268 \
  --data-file=-
```

Cloud Run の実行用サービスアカウントに secret 参照権限を付与します。

```bash
gcloud secrets add-iam-policy-binding gemini-api-key \
  --project gen-lang-client-0099285268 \
  --member "serviceAccount:ai-pet-api-runner@gen-lang-client-0099285268.iam.gserviceaccount.com" \
  --role "roles/secretmanager.secretAccessor"
```

## Workload Identity Federation

GitHub Actions から Google Cloud へは WIF で認証します。サービスアカウントキー JSON は作らない方針です。

```bash
PROJECT_ID=gen-lang-client-0099285268
REPO=Perunamico/devops-ai-agent-hackathon-2026

gcloud iam service-accounts create github-actions-sa \
  --project "$PROJECT_ID" \
  --display-name "GitHub Actions SA"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/firebasehosting.admin"

gcloud iam service-accounts add-iam-policy-binding \
  "ai-pet-api-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/iam.serviceAccountUser"

gcloud iam workload-identity-pools create github-pool \
  --project "$PROJECT_ID" \
  --location global \
  --display-name "GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project "$PROJECT_ID" \
  --workload-identity-pool github-pool \
  --location global \
  --display-name "GitHub provider" \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "attribute.repository == '$REPO'"
```

作成後、WIF provider 名を確認します。

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --project "$PROJECT_ID" \
  --workload-identity-pool github-pool \
  --location global \
  --format "value(name)"
```

GitHub repository からこのサービスアカウントを使えるようにします。

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format "value(projectNumber)")

gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --project "$PROJECT_ID" \
  --role "roles/iam.workloadIdentityUser" \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$REPO"
```

## GitHub Secrets / Variables

Repository settings の `Secrets and variables` -> `Actions` に登録します。

### Secrets

```txt
GCP_PROJECT_ID=gen-lang-client-0099285268
WIF_PROVIDER=projects/.../locations/global/workloadIdentityPools/github-pool/providers/github-provider
WIF_SERVICE_ACCOUNT=github-actions-sa@gen-lang-client-0099285268.iam.gserviceaccount.com

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gen-lang-client-0099285268.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=gen-lang-client-0099285268
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...

FIREBASE_SERVICE_ACCOUNT={...Firebase Hosting deploy用サービスアカウントJSON全文...}
```

`GEMINI_API_KEY` は GitHub Secrets ではなく、Google Secret Manager の `gemini-api-key` に置きます。

Cloud Run deploy は WIF を使い、Firebase Hosting deploy は `FIREBASE_SERVICE_ACCOUNT` を一時 credentials file として Firebase CLI に渡します。

### Variables

未設定でも workflow 内のデフォルト値で動きます。明示する場合は以下を登録します。

```txt
PROD_FIREBASE_HOSTING_SITE=gen-lang-client-0099285268
DEV_FIREBASE_HOSTING_SITE=gen-lang-client-0099285268-dev
PREVIEW_FIREBASE_HOSTING_SITE=gen-lang-client-0099285268-dev
PROD_CLOUD_RUN_SERVICE=ai-pet-api
DEV_CLOUD_RUN_SERVICE=ai-pet-api-dev
PROD_APP_BASE_URL=https://gen-lang-client-0099285268.web.app
DEV_APP_BASE_URL=https://gen-lang-client-0099285268-dev.web.app
CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT=ai-pet-api-runner@gen-lang-client-0099285268.iam.gserviceaccount.com
```

## 自動デプロイの流れ

`.github/workflows/deploy.yml` が以下を実行します。

1. frontend の lint と build
2. backend の pytest
3. Docker image を build/push
4. Cloud Run に deploy
5. Firebase Hosting に deploy
6. Cloud Run `/health` を確認

Pull Request では Firebase Hosting Preview Channel `pr-<PR番号>-<run番号>` を 7 日間で作成し、backend は `ai-pet-api-pr-<PR番号>` に deploy します。channel id は再実行時の既存 channel 衝突を避けるため、run ごとに一意にします。

## 動作確認

`dev` に push 後:

```txt
https://gen-lang-client-0099285268-dev.web.app
```

`main` に push 後:

```txt
https://gen-lang-client-0099285268.web.app
```

GitHub Actions の `Deploy` workflow が成功していることを確認し、以下を画面から確認します。

- ペット作成
- チャット
- 記憶保存
- 鳴き声通信 / QR 交流
- 設定画面

## 注意点

- `dev` と `main` は Cloud Run service は分離されますが、同じ GCP/Firebase project を使う限り Firestore と Firebase Authentication は共有されます。
- データまで完全分離したい場合は、Firebase/GCP project 自体を `dev` と `prod` で分けます。
- Firestore rules はこの workflow では自動デプロイしません。rules を変更する場合は、影響範囲を確認して手動または別 workflow で反映します。
- PR ごとの Cloud Run service は自動削除していません。不要になったら `gcloud run services delete ai-pet-api-pr-<PR番号> --region asia-northeast1 --project gen-lang-client-0099285268` で削除します。
- Firebase Hosting deploy は Firebase CLI の WIF 認証互換性を避けるため、専用サービスアカウント JSON を `GOOGLE_APPLICATION_CREDENTIALS` として使います。
