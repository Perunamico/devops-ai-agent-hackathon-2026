# AI Pet Infrastructure

Terraform で GCP 側の共通リソースを管理します。

## 管理対象

- 必要な Google APIs
- Artifact Registry repository `ai-pet`
- Secret Manager secret `gemini-api-key`
- Cloud Run runtime service account `ai-pet-api-runner`
- Cloud Run services
  - `ai-pet-api`
  - `ai-pet-api-dev`
- Cloud Run runtime service account の IAM

Firebase Hosting site、Firebase Authentication、Firestore database 作成、GitHub WIF は既存設定を使うため、この Terraform ではまだ管理しません。

## 初期設定

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

GCS backend を使う場合は、tfstate bucket を作成してから `backend.tf.example` を `backend.tf` にコピーして bucket 名を変更します。

```bash
cp backend.tf.example backend.tf
```

## 既存リソースを import する場合

このプロジェクトでは既に GCP リソースが作成済みです。いきなり `terraform apply` すると既存リソースとの重複で失敗するため、先に import します。

```bash
PROJECT_ID=gen-lang-client-0099285268
REGION=asia-northeast1

terraform init

terraform import 'module.artifact_registry.google_artifact_registry_repository.this' \
  "projects/$PROJECT_ID/locations/$REGION/repositories/ai-pet"

terraform import google_secret_manager_secret.gemini_key \
  "projects/$PROJECT_ID/secrets/gemini-api-key"

terraform import google_service_account.cloud_run_runtime \
  "projects/$PROJECT_ID/serviceAccounts/ai-pet-api-runner@$PROJECT_ID.iam.gserviceaccount.com"

terraform import 'module.cloud_run_prod.google_cloud_run_v2_service.this' \
  "projects/$PROJECT_ID/locations/$REGION/services/ai-pet-api"

terraform import 'module.cloud_run_dev.google_cloud_run_v2_service.this' \
  "projects/$PROJECT_ID/locations/$REGION/services/ai-pet-api-dev"
```

IAM member resources は import せず、`terraform plan` で差分を確認して必要なら `apply` で付与します。

## 実行

```bash
terraform fmt -recursive
terraform validate
terraform plan
terraform apply
```

## CI/CD との関係

Cloud Run の container image は GitHub Actions が commit SHA tag で更新します。Terraform が image を `latest` などへ戻さないよう、Cloud Run module では image の drift を無視しています。

環境変数、Secret Manager 参照、runtime service account、公開 invoker 設定は Terraform で管理します。
