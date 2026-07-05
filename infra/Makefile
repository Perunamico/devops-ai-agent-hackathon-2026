PROJECT_ID ?= gen-lang-client-0099285268
REGION ?= asia-northeast1

.PHONY: fmt validate plan apply output check

fmt:
	terraform fmt -recursive

validate:
	terraform validate

plan:
	terraform plan -var="project_id=$(PROJECT_ID)" -var="region=$(REGION)"

apply:
	terraform apply -var="project_id=$(PROJECT_ID)" -var="region=$(REGION)"

output:
	terraform output

check: fmt validate plan
