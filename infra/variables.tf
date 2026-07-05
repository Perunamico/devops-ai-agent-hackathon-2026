variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region for Artifact Registry and Cloud Run."
  type        = string
  default     = "asia-northeast1"
}

variable "enabled_services" {
  description = "Google APIs required by this project."
  type        = list(string)
  default = [
    "artifactregistry.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "aiplatform.googleapis.com",
    "iam.googleapis.com",
  ]
}

variable "artifact_repository_id" {
  description = "Artifact Registry Docker repository ID."
  type        = string
  default     = "ai-pet"
}

variable "cloud_run_image" {
  description = "Initial Cloud Run image. CI/CD deploys commit-tagged images later."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "prod_cloud_run_service" {
  description = "Production Cloud Run service name."
  type        = string
  default     = "ai-pet-api"
}

variable "dev_cloud_run_service" {
  description = "Development Cloud Run service name."
  type        = string
  default     = "ai-pet-api-dev"
}

variable "prod_app_base_url" {
  description = "Production Firebase Hosting base URL."
  type        = string
  default     = "https://gen-lang-client-0099285268.web.app"
}

variable "dev_app_base_url" {
  description = "Development Firebase Hosting base URL."
  type        = string
  default     = "https://gen-lang-client-0099285268-dev.web.app"
}

variable "firestore_database" {
  description = "Firestore database ID."
  type        = string
  default     = "(default)"
}

variable "gemini_model" {
  description = "Gemini model used by the backend."
  type        = string
  default     = "gemini-2.5-flash"
}

variable "gemini_secret_id" {
  description = "Secret Manager secret ID for Gemini API key."
  type        = string
  default     = "gemini-api-key"
}
