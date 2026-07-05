output "artifact_registry_repository" {
  description = "Artifact Registry repository resource name."
  value       = module.artifact_registry.repository_name
}

output "cloud_run_runtime_service_account" {
  description = "Cloud Run runtime service account email."
  value       = google_service_account.cloud_run_runtime.email
}

output "prod_cloud_run_service_name" {
  description = "Production Cloud Run service name."
  value       = module.cloud_run_prod.service_name
}

output "prod_cloud_run_uri" {
  description = "Production Cloud Run service URI."
  value       = module.cloud_run_prod.uri
}

output "dev_cloud_run_service_name" {
  description = "Development Cloud Run service name."
  value       = module.cloud_run_dev.service_name
}

output "dev_cloud_run_uri" {
  description = "Development Cloud Run service URI."
  value       = module.cloud_run_dev.uri
}

output "gemini_secret_id" {
  description = "Gemini API key Secret Manager secret ID."
  value       = google_secret_manager_secret.gemini_key.secret_id
}
