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
{{- end -}}
