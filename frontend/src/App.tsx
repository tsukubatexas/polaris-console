import {
  Activity,
  Braces,
  Cable,
  CheckCircle2,
  CircleAlert,
  Database,
  GitPullRequestArrow,
  KeyRound,
  Lock,
  Network,
  Play,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  SquareTerminal,
  Table2,
  Unplug,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationRegistry } from "./generated/operations";
import { api, Operation, OperationResponse, PolarisSession } from "./lib/api";

type View = "overview" | "catalogs" | "identity" | "lakehouse" | "explorer" | "activity";
type FieldValues = Record<string, string>;

const operations = operationRegistry.operations as unknown as Operation[];

function methodClass(method: string) {
  return `method method-${method.toLowerCase()}`;
}

function safeJson(value: string) {
  if (!value.trim()) return null;
  return JSON.parse(value);
}

function shortDescription(operation: Operation) {
  return operation.summary || operation.description.split("\n")[0] || operation.id;
}

function seedBody(operation: Operation) {
  if (!operation.request_body_required) return "";
  if (!operation.request_schema_name) return "{\n  \n}";
  return JSON.stringify({ _schema: operation.request_schema_name }, null, 2);
}

export function App() {
  const [view, setView] = useState<View>("overview");
  const [session, setSession] = useState<PolarisSession>({ connected: false });
  const [connectOpen, setConnectOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [selectedId, setSelectedId] = useState("listCatalogs");
  const [pathValues, setPathValues] = useState<FieldValues>({ prefix: "main" });
  const [queryValues, setQueryValues] = useState<FieldValues>({});
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<OperationResponse | null>(null);
  const [activity, setActivity] = useState<OperationResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => operations.find((operation) => operation.id === selectedId) ?? operations[0],
    [selectedId]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return operations.filter((operation) => {
      const matchesService = service === "all" || operation.service === service;
      const text = `${operation.id} ${operation.path} ${operation.summary} ${operation.tags.join(" ")}`.toLowerCase();
      return matchesService && (!needle || text.includes(needle));
    });
  }, [query, service]);

  const summary = useMemo(() => {
    const services = operations.reduce<Record<string, number>>((acc, operation) => {
      acc[operation.service] = (acc[operation.service] ?? 0) + 1;
      return acc;
    }, {});
    return {
      release: operationRegistry.polaris_release,
      count: operations.length,
      mutating: operations.filter((operation) => operation.mutating).length,
      services
    };
  }, []);

  useEffect(() => {
    api.session().then(setSession).catch(() => setSession({ connected: false }));
  }, []);

  useEffect(() => {
    if (selected) {
      setResponse(null);
      setError(null);
      setBody(seedBody(selected));
      const defaults: FieldValues = {};
      selected.path_params.forEach((parameter) => {
        defaults[parameter.name] = pathValues[parameter.name] ?? (parameter.name === "prefix" ? "main" : "");
      });
      setPathValues(defaults);
      setQueryValues({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function runOperation(operation = selected) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.execute(operation.id, {
        path_params: pathValues,
        query_params: queryValues,
        body: safeJson(body)
      });
      setResponse(result);
      setActivity((current) => [result, ...current].slice(0, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const coreCards = [
    { title: "Catalogs", icon: Database, view: "catalogs" as View, operations: ["listCatalogs", "createCatalog", "getCatalog"] },
    { title: "Identity", icon: UsersRound, view: "identity" as View, operations: ["listPrincipals", "listPrincipalRoles", "listCatalogRoles"] },
    { title: "Lakehouse", icon: Table2, view: "lakehouse" as View, operations: ["listNamespaces", "listTables", "loadTable"] },
    { title: "Explorer", icon: SquareTerminal, view: "explorer" as View, operations: ["execute any operationId"] }
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Network size={22} /></div>
          <div>
            <h1>Polaris Console</h1>
            <span>{summary.release}</span>
          </div>
        </div>
        <nav>
          {[
            ["overview", Activity, "Overview"],
            ["catalogs", Database, "Catalogs"],
            ["identity", UsersRound, "Identity"],
            ["lakehouse", Table2, "Lakehouse"],
            ["explorer", SquareTerminal, "Explorer"],
            ["activity", GitPullRequestArrow, "Activity"]
          ].map(([key, Icon, label]) => (
            <button
              key={key as string}
              className={view === key ? "nav-active" : ""}
              onClick={() => setView(key as View)}
              title={label as string}
            >
              <Icon size={18} />
              <span>{label as string}</span>
            </button>
          ))}
        </nav>
        <div className="session-panel">
          <div className={session.connected ? "status status-ok" : "status"}>
            {session.connected ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            <span>{session.connected ? "Connected" : "Disconnected"}</span>
          </div>
          {session.connected && <small>{session.realm || "No realm"} · {session.auth_mode}</small>}
          <button className="primary" onClick={() => setConnectOpen(true)}>
            <Cable size={16} />
            {session.connected ? "Connection" : "Connect"}
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{view}</p>
            <h2>{view === "overview" ? "Control Plane" : view[0].toUpperCase() + view.slice(1)}</h2>
          </div>
          <div className="top-actions">
            <span className="pill"><ShieldCheck size={15} /> Bearer / OAuth2</span>
            <span className="pill"><Braces size={15} /> {summary.count} operations</span>
            <button onClick={() => api.session().then(setSession)} title="Refresh session">
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        {view === "overview" && (
          <div className="overview-grid">
            <section className="metric-row">
              <Metric label="Operations" value={summary.count} />
              <Metric label="Mutating" value={summary.mutating} />
              <Metric label="Management" value={summary.services.management ?? 0} />
              <Metric label="Catalog" value={(summary.services.catalog ?? 0) + (summary.services.iceberg ?? 0)} />
            </section>
            <section className="core-grid">
              {coreCards.map((card) => (
                <button key={card.title} className="core-card" onClick={() => setView(card.view)}>
                  <card.icon size={24} />
                  <strong>{card.title}</strong>
                  <span>{card.operations.join(" · ")}</span>
                </button>
              ))}
            </section>
            <section className="band">
              <div>
                <h3>Dynamic Surface</h3>
                <p>{operationRegistry.source_url}</p>
              </div>
              <button onClick={() => setView("explorer")}><Play size={16} /> Open Explorer</button>
            </section>
          </div>
        )}

        {view !== "overview" && view !== "activity" && (
          <OperationWorkbench
            view={view}
            operations={filtered}
            selected={selected}
            setSelectedId={setSelectedId}
            query={query}
            setQuery={setQuery}
            service={service}
            setService={setService}
            pathValues={pathValues}
            setPathValues={setPathValues}
            queryValues={queryValues}
            setQueryValues={setQueryValues}
            body={body}
            setBody={setBody}
            runOperation={runOperation}
            busy={busy}
            response={response}
            error={error}
          />
        )}

        {view === "activity" && <ActivityLog items={activity} />}
      </section>

      {connectOpen && (
        <ConnectModal
          session={session}
          onClose={() => setConnectOpen(false)}
          onConnected={(next) => {
            setSession(next);
            setConnectOpen(false);
          }}
        />
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OperationWorkbench(props: {
  view: View;
  operations: Operation[];
  selected: Operation;
  setSelectedId: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  service: string;
  setService: (value: string) => void;
  pathValues: FieldValues;
  setPathValues: (value: FieldValues) => void;
  queryValues: FieldValues;
  setQueryValues: (value: FieldValues) => void;
  body: string;
  setBody: (value: string) => void;
  runOperation: () => void;
  busy: boolean;
  response: OperationResponse | null;
  error: string | null;
}) {
  const {
    view,
    operations,
    selected,
    setSelectedId,
    query,
    setQuery,
    service,
    setService,
    pathValues,
    setPathValues,
    queryValues,
    setQueryValues,
    body,
    setBody,
    runOperation,
    busy,
    response,
    error
  } = props;

  const curated = useMemo(() => {
    const tags: Record<View, string[]> = {
      overview: [],
      catalogs: ["catalog"],
      identity: ["principal", "role", "grant"],
      lakehouse: ["namespace", "table", "view", "policy"],
      explorer: [],
      activity: []
    };
    const wanted = tags[view];
    if (!wanted.length) return operations;
    return operations.filter((operation) => {
      const text = `${operation.id} ${operation.tags.join(" ")} ${operation.path}`.toLowerCase();
      return wanted.some((tag) => text.includes(tag));
    });
  }, [operations, view]);

  return (
    <div className="workbench">
      <section className="operation-list">
        <div className="filters">
          <div className="search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search operations" />
          </div>
          <select value={service} onChange={(event) => setService(event.target.value)}>
            <option value="all">All services</option>
            <option value="management">Management</option>
            <option value="catalog">Catalog</option>
            <option value="iceberg">Iceberg</option>
          </select>
        </div>
        <div className="list-scroll">
          {curated.map((operation) => (
            <button
              key={operation.id}
              className={selected.id === operation.id ? "operation-row selected" : "operation-row"}
              onClick={() => setSelectedId(operation.id)}
            >
              <span className={methodClass(operation.method)}>{operation.method}</span>
              <span>
                <strong>{operation.id}</strong>
                <small>{operation.path}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="executor">
        <div className="operation-head">
          <span className={methodClass(selected.method)}>{selected.method}</span>
          <div>
            <h3>{selected.id}</h3>
            <p>{shortDescription(selected)}</p>
          </div>
        </div>
        <code className="path-line">{selected.path}</code>
        <FormFields title="Path" params={selected.path_params} values={pathValues} setValues={setPathValues} />
        <FormFields title="Query" params={selected.query_params} values={queryValues} setValues={setQueryValues} />
        {selected.mutating && (
          <div className="body-editor">
            <label>JSON Body {selected.request_schema_name && <span>{selected.request_schema_name}</span>}</label>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} />
          </div>
        )}
        <div className="execute-bar">
          <button className="primary" disabled={busy} onClick={runOperation}>
            <Play size={16} />
            {busy ? "Running" : "Execute"}
          </button>
          {selected.mutating && <span className="warning"><Lock size={15} /> Mutating operation</span>}
        </div>
        {error && <pre className="response response-error">{error}</pre>}
        {response && (
          <pre className={response.ok ? "response" : "response response-error"}>
            {JSON.stringify(response, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

function FormFields({
  title,
  params,
  values,
  setValues
}: {
  title: string;
  params: readonly { name: string; required: boolean; description: string }[];
  values: FieldValues;
  setValues: (value: FieldValues) => void;
}) {
  if (!params.length) return null;
  return (
    <div className="field-group">
      <h4>{title}</h4>
      <div className="field-grid">
        {params.map((param) => (
          <label key={param.name}>
            <span>{param.name}{param.required && " *"}</span>
            <input
              value={values[param.name] ?? ""}
              onChange={(event) => setValues({ ...values, [param.name]: event.target.value })}
              placeholder={param.description || param.name}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ActivityLog({ items }: { items: OperationResponse[] }) {
  return (
    <div className="activity-log">
      {items.length === 0 && <div className="empty">No calls in this browser session.</div>}
      {items.map((item, index) => (
        <div className="activity-row" key={`${item.operation.id}-${index}`}>
          <span className={methodClass(item.operation.method)}>{item.operation.method}</span>
          <strong>{item.operation.id}</strong>
          <small>{item.status_code}</small>
        </div>
      ))}
    </div>
  );
}

function ConnectModal({
  session,
  onClose,
  onConnected
}: {
  session: PolarisSession;
  onClose: () => void;
  onConnected: (session: PolarisSession) => void;
}) {
  const [authMode, setAuthMode] = useState(session.auth_mode ?? "bearer");
  const [form, setForm] = useState<Record<string, string>>({
    management_url: session.management_url ?? "http://localhost:8181/api/management/v1",
    catalog_url: session.catalog_url ?? "http://localhost:8181/api/catalog",
    realm: session.realm ?? "POLARIS",
    bearer_token: "",
    token_url: "http://localhost:8181/api/catalog/v1/oauth/tokens",
    client_id: "",
    client_secret: "",
    scope: "PRINCIPAL_ROLE:ALL"
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.connect({ ...form, auth_mode: authMode });
      onConnected(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <div>
            <p>Polaris Connection</p>
            <h3>Connect</h3>
          </div>
          <button onClick={onClose} title="Close">×</button>
        </header>
        <div className="field-grid">
          <label><span>Management URL</span><input value={form.management_url} onChange={(event) => setForm({ ...form, management_url: event.target.value })} /></label>
          <label><span>Catalog URL</span><input value={form.catalog_url} onChange={(event) => setForm({ ...form, catalog_url: event.target.value })} /></label>
          <label><span>Realm</span><input value={form.realm} onChange={(event) => setForm({ ...form, realm: event.target.value })} /></label>
        </div>
        <div className="auth-tabs">
          {[
            ["bearer", KeyRound, "Bearer"],
            ["client_credentials", PlugZap, "OAuth2"],
            ["none", Unplug, "None"]
          ].map(([key, Icon, label]) => (
            <button key={key as string} className={authMode === key ? "selected" : ""} onClick={() => setAuthMode(key as string)}>
              <Icon size={16} />
              {label as string}
            </button>
          ))}
        </div>
        {authMode === "bearer" && (
          <label className="full"><span>Bearer Token</span><textarea value={form.bearer_token} onChange={(event) => setForm({ ...form, bearer_token: event.target.value })} /></label>
        )}
        {authMode === "client_credentials" && (
          <div className="field-grid">
            <label><span>Token URL</span><input value={form.token_url} onChange={(event) => setForm({ ...form, token_url: event.target.value })} /></label>
            <label><span>Client ID</span><input value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} /></label>
            <label><span>Client Secret</span><input type="password" value={form.client_secret} onChange={(event) => setForm({ ...form, client_secret: event.target.value })} /></label>
            <label><span>Scope</span><input value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })} /></label>
          </div>
        )}
        {error && <pre className="response response-error">{error}</pre>}
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={connect}>{busy ? "Connecting" : "Connect"}</button>
        </footer>
      </div>
    </div>
  );
}

