terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  runtime_service_account_id = "ai-pet-api-runner"

  cloud_run_env_base = [
    {
      name  = "USE_VERTEX_AI"
      value = "true"
    },
    {
      name  = "GOOGLE_CLOUD_PROJECT"
      value = var.project_id
    },
    {
      name  = "FIRESTORE_DATABASE"
      value = var.firestore_database
    },
    {
      name  = "VERTEX_AI_LOCATION"
      value = var.region
    },
    {
      name  = "GEMINI_MODEL"
      value = var.gemini_model
    },
    {
      name  = "SKIP_AUTH"
      value = "false"
    },
    {
      name  = "FIRESTORE_ENABLED"
      value = "true"
    },
  ]

  cloud_run_secret_env = [
    {
      name    = "GEMINI_API_KEY"
      secret  = google_secret_manager_secret.gemini_key.secret_id
      version = "latest"
    },
  ]
}

resource "google_project_service" "required" {
  for_each = toset(var.enabled_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "artifact_registry" {
  source = "./modules/artifact_registry"

  project_id    = var.project_id
  region        = var.region
  repository_id = var.artifact_repository_id

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "gemini_key" {
  project   = var.project_id
  secret_id = var.gemini_secret_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_service_account" "cloud_run_runtime" {
  project      = var.project_id
  account_id   = local.runtime_service_account_id
  display_name = "AI Pet API Cloud Run runtime"

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "cloud_run_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_project_iam_member" "cloud_run_vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "cloud_run_secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}

module "cloud_run_prod" {
  source = "./modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  service_name          = var.prod_cloud_run_service
  image                 = var.cloud_run_image
  service_account_email = google_service_account.cloud_run_runtime.email
  env_vars = concat(local.cloud_run_env_base, [
    {
      name  = "APP_BASE_URL"
      value = var.prod_app_base_url
    },
  ])
  secret_env_vars = local.cloud_run_secret_env

  depends_on = [
    module.artifact_registry,
    google_project_iam_member.cloud_run_datastore_user,
    google_project_iam_member.cloud_run_vertex_user,
    google_secret_manager_secret_iam_member.cloud_run_secret_accessor,
  ]
}

module "cloud_run_dev" {
  source = "./modules/cloud_run"

  project_id            = var.project_id
  region                = var.region
  service_name          = var.dev_cloud_run_service
  image                 = var.cloud_run_image
  service_account_email = google_service_account.cloud_run_runtime.email
  env_vars = concat(local.cloud_run_env_base, [
    {
      name  = "APP_BASE_URL"
      value = var.dev_app_base_url
    },
  ])
  secret_env_vars = local.cloud_run_secret_env

  depends_on = [
    module.artifact_registry,
    google_project_iam_member.cloud_run_datastore_user,
    google_project_iam_member.cloud_run_vertex_user,
    google_secret_manager_secret_iam_member.cloud_run_secret_accessor,
  ]
}
