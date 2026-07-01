variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Cloud Run region."
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name."
  type        = string
}

variable "image" {
  description = "Container image."
  type        = string
}

variable "service_account_email" {
  description = "Runtime service account email."
  type        = string
}

variable "env_vars" {
  description = "Plain environment variables in Cloud Run env order."
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "secret_env_vars" {
  description = "Secret Manager backed environment variables in Cloud Run env order."
  type = list(object({
    name    = string
    secret  = string
    version = string
  }))
  default = []
}
