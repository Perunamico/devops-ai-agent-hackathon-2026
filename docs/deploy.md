# Google Cloud / Firebase Deployment

このプロジェクトでは、バックエンドだけを Docker 化して Cloud Run に配置し、フロントエンドは Firebase Hosting から静的配信します。

## 前提

- Google Cloud プロジェクトと Firebase プロジェクトが同じプロジェクト ID で作成済み
- Firestore と Firebase Authentication が有効化済み
- Firebase Authentication の匿名ログインプロバイダが有効化済み
- `gcloud` と `firebase` CLI にログイン済み
- Artifact Registry API、Cloud Run API、Vertex AI API、Firestore API が有効化済み

以降の例では次の値を使います。実際のプロジェクト ID に置き換えてください。

```bash
PROJECT_ID=your-project-id
REGION=asia-northeast1
REPOSITORY=ai-pet
SERVICE=ai-pet-api
IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE:latest
```

## Backend: Cloud Run

Artifact Registry リポジトリを作成します。

```bash
gcloud artifacts repositories create $REPOSITORY \
  --project $PROJECT_ID \
  --repository-format docker \
  --location $REGION
```

Cloud Run 実行用サービスアカウントを作成します。

```bash
gcloud iam service-accounts create ai-pet-api-runner \
  --project $PROJECT_ID \
  --display-name "AI Pet API Cloud Run runtime"
```

最小限の権限を付与します。Firestore と Vertex AI Gemini を使うための実行権限です。

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:ai-pet-api-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member "serviceAccount:ai-pet-api-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --role "roles/aiplatform.user"
```

Docker イメージをビルドして push します。

```bash
gcloud auth configure-docker $REGION-docker.pkg.dev

docker build -t $IMAGE backend
docker push $IMAGE
```

Cloud Run にデプロイします。Firebase Hosting の `/api/**` リライトから到達させるため、初期状態では未認証アクセスを許可しています。API 内部では Firebase ID Token を検証します。

```bash
gcloud run deploy $SERVICE \
  --project $PROJECT_ID \
  --region $REGION \
  --image $IMAGE \
  --service-account "ai-pet-api-runner@$PROJECT_ID.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,FIRESTORE_DATABASE=(default),VERTEX_AI_LOCATION=$REGION,GEMINI_MODEL=gemini-2.5-flash,USE_VERTEX_AI=true,SKIP_AUTH=false,FIRESTORE_ENABLED=true,APP_BASE_URL=https://gen-lang-client-0099285268.web.app"
```

デプロイ後にヘルスチェックを確認します。

```bash
API_URL=$(gcloud run services describe $SERVICE \
  --project $PROJECT_ID \
  --region $REGION \
  --format 'value(status.url)')

curl "$API_URL/health"
```

期待レスポンス:

```json
{"status":"ok"}
```

## Frontend: Firebase Hosting

`.firebaserc` の `your-project-id` を実際の Firebase プロジェクト ID に置き換えます。

```bash
firebase use $PROJECT_ID
```

フロントエンドを静的 export して Hosting と Firestore Rules をデプロイします。

```bash
cd frontend
npm ci
cp .env.example .env.local
# .env.local の NEXT_PUBLIC_FIREBASE_* を Firebase Web App の値に置き換える
npm run build
cd ..

firebase deploy --only hosting,firestore:rules --project $PROJECT_ID
```

`firebase.json` では `/api/**` を Cloud Run の `ai-pet-api` にリライトし、それ以外は Next.js の static export を SPA として `index.html` に返します。

## Local Docker Check

```bash
docker build -t ai-pet-api backend
docker run -p 8080:8080 \
  -e SKIP_AUTH=true \
  -e FIRESTORE_ENABLED=false \
  -e GEMINI_API_KEY=dummy \
  ai-pet-api
```

別ターミナルで確認します。

```bash
curl http://localhost:8080/health
```

## Notes

- Secret Manager は API キーなどの秘匿情報が必要になった時だけ使います。Vertex AI を使う構成では、Cloud Run のサービスアカウント権限で Gemini を呼び出します。
- フロントエンドは Next.js の static export として `frontend/out` に出力します。サーバーサイドレンダリングや Next.js API Routes は使いません。
- Firestore はバックエンド経由でアクセスする前提のため、`firestore.rules` はクライアントからの直接 read/write を拒否しています。
