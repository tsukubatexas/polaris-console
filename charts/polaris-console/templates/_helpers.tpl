{{/*
Expand the name of the chart.
*/}}
{{- define "polaris-console.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "polaris-console.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "polaris-console.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "polaris-console.labels" -}}
helm.sh/chart: {{ include "polaris-console.chart" . }}
app.kubernetes.io/name: {{ include "polaris-console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "polaris-console.selectorLabels" -}}
app.kubernetes.io/name: {{ include "polaris-console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "polaris-console.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "polaris-console.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "polaris-console.secretName" -}}
{{- if .Values.session.existingSecret -}}
{{- .Values.session.existingSecret -}}
{{- else -}}
{{- printf "%s-session" (include "polaris-console.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "polaris-console.sessionSecret" -}}
{{- $secretName := include "polaris-console.secretName" . -}}
{{- $secretKey := .Values.session.secretKey -}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace $secretName -}}
{{- if .Values.session.secret -}}
{{- .Values.session.secret -}}
{{- else if and $existing (hasKey $existing.data $secretKey) -}}
{{- index $existing.data $secretKey | b64dec -}}
{{- else -}}
{{- randAlphaNum 64 -}}
{{- end -}}
{{- end -}}

{{- define "polaris-console.cloudServiceAccountAnnotations" -}}
{{- $provider := default "none" .Values.cloud.provider -}}
{{- if eq $provider "aws" -}}
{{- if .Values.cloud.aws.irsa.enabled }}
eks.amazonaws.com/role-arn: {{ required "cloud.aws.irsa.roleArn is required when AWS IRSA is enabled." .Values.cloud.aws.irsa.roleArn | quote }}
{{- with .Values.cloud.aws.irsa.audience }}
eks.amazonaws.com/audience: {{ . | quote }}
{{- end }}
{{- if .Values.cloud.aws.irsa.stsRegionalEndpoints }}
eks.amazonaws.com/sts-regional-endpoints: "true"
{{- end }}
{{- with .Values.cloud.aws.irsa.tokenExpirationSeconds }}
eks.amazonaws.com/token-expiration: {{ . | quote }}
{{- end }}
{{- end }}
{{- else if eq $provider "azure" -}}
{{- if .Values.cloud.azure.workloadIdentity.enabled }}
azure.workload.identity/client-id: {{ required "cloud.azure.workloadIdentity.clientId is required when Azure Workload Identity is enabled." .Values.cloud.azure.workloadIdentity.clientId | quote }}
{{- with .Values.cloud.azure.workloadIdentity.tenantId }}
azure.workload.identity/tenant-id: {{ . | quote }}
{{- end }}
{{- with .Values.cloud.azure.workloadIdentity.serviceAccountTokenExpirationSeconds }}
azure.workload.identity/service-account-token-expiration: {{ . | quote }}
{{- end }}
{{- end }}
{{- else if eq $provider "gcp" -}}
{{- if .Values.cloud.gcp.workloadIdentity.enabled }}
{{- if eq .Values.cloud.gcp.workloadIdentity.mode "serviceAccountImpersonation" }}
iam.gke.io/gcp-service-account: {{ required "cloud.gcp.workloadIdentity.serviceAccountEmail is required for GCP serviceAccountImpersonation mode." .Values.cloud.gcp.workloadIdentity.serviceAccountEmail | quote }}
{{- end }}
{{- if .Values.cloud.gcp.workloadIdentity.returnPrincipalIdAsEmail }}
iam.gke.io/return-principal-id-as-email: "true"
{{- end }}
{{- with .Values.cloud.gcp.workloadIdentity.credentialQuotaProject }}
iam.gke.io/credential-quota-project: {{ . | quote }}
{{- end }}
{{- end }}
{{- end -}}
{{- end -}}

{{- define "polaris-console.cloudPodLabels" -}}
{{- if and (eq (default "none" .Values.cloud.provider) "azure") .Values.cloud.azure.workloadIdentity.enabled }}
azure.workload.identity/use: "true"
{{- end -}}
{{- end -}}

{{- define "polaris-console.cloudPodAnnotations" -}}
{{- if and (eq (default "none" .Values.cloud.provider) "azure") .Values.cloud.azure.workloadIdentity.enabled }}
{{- if .Values.cloud.azure.workloadIdentity.injectProxySidecar }}
azure.workload.identity/inject-proxy-sidecar: "true"
azure.workload.identity/proxy-sidecar-port: {{ .Values.cloud.azure.workloadIdentity.proxySidecarPort | quote }}
{{- end }}
{{- with .Values.cloud.azure.workloadIdentity.skipContainers }}
azure.workload.identity/skip-containers: {{ join ";" . | quote }}
{{- end }}
{{- end -}}
{{- end -}}

{{- define "polaris-console.validate" -}}
{{- if and .Values.session.secret .Values.session.existingSecret -}}
{{- fail "Set only one of session.secret or session.existingSecret." -}}
{{- end -}}
{{- if and (not .Values.config.allowAnyTargetHost) (empty .Values.config.allowedTargetHosts) -}}
{{- fail "config.allowedTargetHosts must list the exact Polaris/OAuth hosts, or set config.allowAnyTargetHost=true only for local development." -}}
{{- end -}}
{{- if and .Values.config.allowInsecureTls (not .Values.config.allowAnyTargetHost) -}}
{{- fail "config.allowInsecureTls=true is only allowed together with explicit local-development mode config.allowAnyTargetHost=true." -}}
{{- end -}}
{{- $provider := default "none" .Values.cloud.provider -}}
{{- if not (has $provider (list "none" "aws" "azure" "gcp")) -}}
{{- fail "cloud.provider must be one of: none, aws, azure, gcp." -}}
{{- end -}}
{{- if eq $provider "aws" -}}
{{- if and (not .Values.cloud.aws.irsa.enabled) (not .Values.cloud.aws.podIdentity.enabled) -}}
{{- fail "cloud.provider=aws requires cloud.aws.irsa.enabled=true or cloud.aws.podIdentity.enabled=true." -}}
{{- end -}}
{{- if and .Values.cloud.aws.irsa.enabled (empty .Values.cloud.aws.irsa.roleArn) -}}
{{- fail "cloud.aws.irsa.roleArn is required when AWS IRSA is enabled." -}}
{{- end -}}
{{- end -}}
{{- if eq $provider "azure" -}}
{{- if not .Values.cloud.azure.workloadIdentity.enabled -}}
{{- fail "cloud.provider=azure requires cloud.azure.workloadIdentity.enabled=true." -}}
{{- end -}}
{{- if empty .Values.cloud.azure.workloadIdentity.clientId -}}
{{- fail "cloud.azure.workloadIdentity.clientId is required when Azure Workload Identity is enabled." -}}
{{- end -}}
{{- $expiration := int .Values.cloud.azure.workloadIdentity.serviceAccountTokenExpirationSeconds -}}
{{- if or (lt $expiration 3600) (gt $expiration 86400) -}}
{{- fail "cloud.azure.workloadIdentity.serviceAccountTokenExpirationSeconds must be between 3600 and 86400." -}}
{{- end -}}
{{- end -}}
{{- if eq $provider "gcp" -}}
{{- if not .Values.cloud.gcp.workloadIdentity.enabled -}}
{{- fail "cloud.provider=gcp requires cloud.gcp.workloadIdentity.enabled=true." -}}
{{- end -}}
{{- if not (has .Values.cloud.gcp.workloadIdentity.mode (list "direct" "serviceAccountImpersonation")) -}}
{{- fail "cloud.gcp.workloadIdentity.mode must be direct or serviceAccountImpersonation." -}}
{{- end -}}
{{- if and (eq .Values.cloud.gcp.workloadIdentity.mode "serviceAccountImpersonation") (empty .Values.cloud.gcp.workloadIdentity.serviceAccountEmail) -}}
{{- fail "cloud.gcp.workloadIdentity.serviceAccountEmail is required for GCP serviceAccountImpersonation mode." -}}
{{- end -}}
{{- end -}}
{{- end -}}
