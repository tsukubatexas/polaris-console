export type PolarisSession = {
  connected: boolean;
  management_url?: string;
  catalog_url?: string;
  realm?: string | null;
  auth_mode?: string;
  expires_at?: number;
  has_token?: boolean;
};

export type Parameter = {
  name: string;
  location: string;
  required: boolean;
  description: string;
  schema_type: string;
};

export type Operation = {
  id: string;
  service: "management" | "catalog" | "iceberg" | string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: readonly string[];
  path_params: readonly Parameter[];
  query_params: readonly Parameter[];
  header_params: readonly Parameter[];
  request_body_required: boolean;
  request_schema_name: string | null;
  request_schema: unknown;
  responses: readonly string[];
  source: string;
  mutating: boolean;
};

export type OperationResponse = {
  status_code: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  operation: {
    id: string;
    method: string;
    path: string;
    service: string;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
    throw new Error(detail);
  }
  return body as T;
}

export const api = {
  session: () => request<PolarisSession>("/api/session"),
  connect: (payload: Record<string, unknown>) =>
    request<PolarisSession>("/api/session/connect", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  logout: () =>
    request<PolarisSession>("/api/session/logout", {
      method: "POST"
    }),
  execute: (operationId: string, payload: Record<string, unknown>) =>
    request<OperationResponse>(`/api/polaris/operations/${encodeURIComponent(operationId)}`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

