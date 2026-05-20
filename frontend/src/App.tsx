import {
  Activity,
  Braces,
  Cable,
  CheckCircle2,
  CircleAlert,
  Database,
  Eye,
  FolderTree,
  GitPullRequestArrow,
  KeyRound,
  Layers,
  Lock,
  Network,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SquareTerminal,
  Table2,
  Trash2,
  Unplug,
  UserPlus,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { operationRegistry } from "./generated/operations";
import { api, Operation, OperationResponse, PolarisSession } from "./lib/api";

type View = "overview" | "catalogs" | "identity" | "lakehouse" | "explorer" | "activity";
type FieldValues = Record<string, string>;
type AnyRecord = Record<string, any>;

type Catalog = {
  name: string;
  type?: string;
  readOnly?: boolean;
  entityVersion?: number;
  properties?: Record<string, string>;
  storageConfigInfo?: AnyRecord;
};

type NamedEntity = {
  name: string;
  entityVersion?: number;
  properties?: Record<string, string>;
};

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

function objectBody(response: OperationResponse | null | undefined): AnyRecord {
  return response?.body && typeof response.body === "object" ? (response.body as AnyRecord) : {};
}

function namespaceName(value: unknown) {
  if (Array.isArray(value)) return value.join(".");
  return String(value ?? "");
}

function rolesFromBody(response: OperationResponse): NamedEntity[] {
  const body = objectBody(response);
  const rawRoles = body.roles ?? body.catalogRoles ?? body.principalRoles;
  return Array.isArray(rawRoles) ? rawRoles : [];
}

function operationCounts() {
  return operations.reduce<Record<string, number>>((acc, operation) => {
    acc[operation.service] = (acc[operation.service] ?? 0) + 1;
    return acc;
  }, {});
}

export function App() {
  const [view, setView] = useState<View>("overview");
  const [session, setSession] = useState<PolarisSession>({ connected: false });
  const [connectOpen, setConnectOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [selectedId, setSelectedId] = useState("listCatalogs");
  const [pathValues, setPathValues] = useState<FieldValues>({ prefix: "quickstart_catalog" });
  const [queryValues, setQueryValues] = useState<FieldValues>({});
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<OperationResponse | null>(null);
  const [activity, setActivity] = useState<OperationResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeCatalog, setActiveCatalog] = useState("");

  const selected = useMemo(
    () => operations.find((operation) => operation.id === selectedId) ?? operations[0],
    [selectedId]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return operations.filter((operation) => {
      const matchesService = service === "all" || operation.service === service;
      const text =
        `${operation.id} ${operation.path} ${operation.summary} ${operation.tags.join(" ")}`.toLowerCase();
      return matchesService && (!needle || text.includes(needle));
    });
  }, [query, service]);

  const summary = useMemo(() => {
    const services = operationCounts();
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
    if (session.connected) {
      refreshCatalogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.connected]);

  useEffect(() => {
    if (selected) {
      setResponse(null);
      setError(null);
      setBody(seedBody(selected));
      const defaults: FieldValues = {};
      selected.path_params.forEach((parameter) => {
        defaults[parameter.name] =
          pathValues[parameter.name] ?? (parameter.name === "prefix" ? "quickstart_catalog" : "");
      });
      setPathValues(defaults);
      setQueryValues({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function executePolaris(
    operationId: string,
    payload: {
      path_params?: Record<string, string>;
      query_params?: Record<string, string>;
      body?: unknown;
    } = {}
  ) {
    setBusyKey(operationId);
    try {
      const result = await api.execute(operationId, {
        path_params: payload.path_params ?? {},
        query_params: payload.query_params ?? {},
        body: payload.body ?? null
      });
      setActivity((current) => [result, ...current].slice(0, 50));
      return result;
    } finally {
      setBusyKey(null);
    }
  }

  async function refreshCatalogs() {
    if (!session.connected) return;
    setCatalogError(null);
    try {
      const result = await executePolaris("listCatalogs");
      if (!result.ok) {
        setCatalogError(`Polaris HTTP ${result.status_code}`);
        return;
      }
      const body = objectBody(result);
      const nextCatalogs = Array.isArray(body.catalogs) ? body.catalogs : [];
      setCatalogs(nextCatalogs);
      setActiveCatalog((current) =>
        current && nextCatalogs.some((catalog: Catalog) => catalog.name === current)
          ? current
          : nextCatalogs[0]?.name ?? ""
      );
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Could not load catalogs");
    }
  }

  async function runOperation(operation = selected) {
    setBusy(true);
    setError(null);
    try {
      const result = await executePolaris(operation.id, {
        path_params: pathValues,
        query_params: queryValues,
        body: safeJson(body)
      });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const title = view === "overview" ? "Topology" : view[0].toUpperCase() + view.slice(1);
  const viewLabel = view === "overview" ? "topology" : view;
  const hierarchicalView = view !== "explorer" && view !== "activity";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Network size={22} />
          </div>
          <div>
            <h1>Polaris Console</h1>
            <span>{summary.release}</span>
          </div>
        </div>
        <nav>
          {[
            ["overview", Activity, "Topology"],
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
          {session.connected && (
            <small>
              {session.realm || "No realm"} · {session.auth_mode}
            </small>
          )}
          <button className="primary" onClick={() => setConnectOpen(true)}>
            <Cable size={16} />
            {session.connected ? "Connection" : "Connect"}
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{viewLabel}</p>
            <h2>{title}</h2>
          </div>
          <div className="top-actions">
            <span className="pill">
              <ShieldCheck size={15} /> Bearer / OAuth2
            </span>
            <span className="pill">
              <Braces size={15} /> {summary.count} operations
            </span>
            <button
              onClick={() => {
                api.session().then(setSession);
                refreshCatalogs();
              }}
              title="Refresh session"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        {hierarchicalView && (
          <div className="hierarchy-shell">
            <PolarisTree
              session={session}
              catalogs={catalogs}
              activeCatalog={activeCatalog}
              activeView={view}
              catalogError={catalogError}
              setView={setView}
              setActiveCatalog={setActiveCatalog}
              openConnect={() => setConnectOpen(true)}
            />
            <div className="hierarchy-content">
              {view === "overview" && (
                <Overview
                  session={session}
                  catalogs={catalogs}
                  summary={summary}
                  activity={activity}
                  catalogError={catalogError}
                  onRefresh={refreshCatalogs}
                  setView={setView}
                />
              )}

              {view === "catalogs" && (
                <CatalogsView
                  session={session}
                  catalogs={catalogs}
                  activeCatalog={activeCatalog}
                  setActiveCatalog={setActiveCatalog}
                  refreshCatalogs={refreshCatalogs}
                  executePolaris={executePolaris}
                  busyKey={busyKey}
                  openConnect={() => setConnectOpen(true)}
                />
              )}

              {view === "identity" && (
                <IdentityView
                  session={session}
                  catalogs={catalogs}
                  activeCatalog={activeCatalog}
                  setActiveCatalog={setActiveCatalog}
                  executePolaris={executePolaris}
                  busyKey={busyKey}
                  openConnect={() => setConnectOpen(true)}
                />
              )}

              {view === "lakehouse" && (
                <LakehouseView
                  session={session}
                  catalogs={catalogs}
                  activeCatalog={activeCatalog}
                  setActiveCatalog={setActiveCatalog}
                  refreshCatalogs={refreshCatalogs}
                  executePolaris={executePolaris}
                  busyKey={busyKey}
                  openConnect={() => setConnectOpen(true)}
                />
              )}
            </div>
          </div>
        )}

        {view === "explorer" && (
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

function PolarisTree({
  session,
  catalogs,
  activeCatalog,
  activeView,
  catalogError,
  setView,
  setActiveCatalog,
  openConnect
}: {
  session: PolarisSession;
  catalogs: Catalog[];
  activeCatalog: string;
  activeView: View;
  catalogError: string | null;
  setView: (view: View) => void;
  setActiveCatalog: (name: string) => void;
  openConnect: () => void;
}) {
  const realm = session.realm || "POLARIS";

  function go(view: View, catalogName?: string) {
    if (catalogName) setActiveCatalog(catalogName);
    setView(view);
  }

  return (
    <aside className="hierarchy-panel">
      <button
        className={activeView === "overview" ? "tree-node tree-root tree-active" : "tree-node tree-root"}
        onClick={() => go("overview")}
      >
        <Network size={18} />
        <span>
          <strong>{realm}</strong>
          <small>{session.connected ? session.auth_mode : "disconnected"}</small>
        </span>
      </button>

      {!session.connected && (
        <button className="tree-connect primary" onClick={openConnect}>
          <Cable size={16} /> Connect
        </button>
      )}
      {catalogError && <div className="tree-error">{catalogError}</div>}

      <details className="tree-section" open>
        <summary>
          <Database size={16} />
          <span>Catalogs</span>
          <small>{catalogs.length}</small>
        </summary>
        <div className="tree-children">
          {catalogs.map((catalog) => (
            <div className="tree-branch" key={catalog.name}>
              <button
                className={
                  activeView === "catalogs" && activeCatalog === catalog.name
                    ? "tree-node tree-active"
                    : "tree-node"
                }
                onClick={() => go("catalogs", catalog.name)}
              >
                <Database size={16} />
                <span>
                  <strong>{catalog.name}</strong>
                  <small>{catalog.properties?.["default-base-location"] ?? catalog.type ?? "catalog"}</small>
                </span>
              </button>
              <div className="tree-leaves">
                <button onClick={() => go("catalogs", catalog.name)}>
                  <ShieldCheck size={14} />
                  <span>Storage & Roles</span>
                </button>
                <button
                  className={activeView === "lakehouse" && activeCatalog === catalog.name ? "tree-active" : ""}
                  onClick={() => go("lakehouse", catalog.name)}
                >
                  <FolderTree size={14} />
                  <span>Namespaces</span>
                </button>
                <button
                  className={activeView === "lakehouse" && activeCatalog === catalog.name ? "tree-active" : ""}
                  onClick={() => go("lakehouse", catalog.name)}
                >
                  <Table2 size={14} />
                  <span>Tables</span>
                </button>
              </div>
            </div>
          ))}
          {catalogs.length === 0 && <div className="tree-empty">No catalogs</div>}
        </div>
      </details>

      <details className="tree-section" open>
        <summary>
          <UsersRound size={16} />
          <span>Identity</span>
        </summary>
        <div className="tree-children">
          <button
            className={activeView === "identity" ? "tree-node tree-active" : "tree-node"}
            onClick={() => go("identity")}
          >
            <UsersRound size={16} />
            <span>
              <strong>Principals</strong>
              <small>users and services</small>
            </span>
          </button>
          <div className="tree-leaves">
            <button className={activeView === "identity" ? "tree-active" : ""} onClick={() => go("identity")}>
              <KeyRound size={14} />
              <span>Principal Roles</span>
            </button>
            <button className={activeView === "identity" ? "tree-active" : ""} onClick={() => go("identity")}>
              <ShieldCheck size={14} />
              <span>Catalog Grants</span>
            </button>
          </div>
        </div>
      </details>

      <button className="tree-node" onClick={() => go("explorer")}>
        <SquareTerminal size={16} />
        <span>
          <strong>Explorer</strong>
          <small>raw fallback</small>
        </span>
      </button>
    </aside>
  );
}

function Overview({
  session,
  catalogs,
  summary,
  activity,
  catalogError,
  onRefresh,
  setView
}: {
  session: PolarisSession;
  catalogs: Catalog[];
  summary: {
    release: string;
    count: number;
    mutating: number;
    services: Record<string, number>;
  };
  activity: OperationResponse[];
  catalogError: string | null;
  onRefresh: () => void;
  setView: (view: View) => void;
}) {
  const last = activity[0];
  return (
    <div className="overview-grid">
      <section className="metric-row">
        <Metric label="Catalogs" value={catalogs.length} />
        <Metric label="Management Ops" value={summary.services.management ?? 0} />
        <Metric label="Lakehouse Ops" value={(summary.services.catalog ?? 0) + (summary.services.iceberg ?? 0)} />
        <Metric label="Mutating Ops" value={summary.mutating} />
      </section>

      <section className="console-grid">
        <div className="panel span-2">
          <div className="section-title">
            <div>
              <h3>Catalog Estate</h3>
              <span>{session.connected ? "Live from Polaris" : "No active Polaris session"}</span>
            </div>
            <button onClick={onRefresh} disabled={!session.connected}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          {catalogError && <div className="notice notice-error">{catalogError}</div>}
          <div className="catalog-strip">
            {catalogs.map((catalog) => (
              <button key={catalog.name} onClick={() => setView("catalogs")}>
                <Database size={18} />
                <strong>{catalog.name}</strong>
                <span>{catalog.type ?? "CATALOG"}</span>
              </button>
            ))}
            {catalogs.length === 0 && <EmptyState label="No catalogs loaded" />}
          </div>
        </div>

        <div className="panel">
          <div className="section-title">
            <div>
              <h3>Last Call</h3>
              <span>{last ? `${last.operation.id} · ${last.status_code}` : "No activity yet"}</span>
            </div>
          </div>
          {last ? (
            <pre className={last.ok ? "mini-response" : "mini-response mini-response-error"}>
              {JSON.stringify(last.body, null, 2)}
            </pre>
          ) : (
            <EmptyState label="Run a Polaris action" />
          )}
        </div>
      </section>

      <section className="core-grid">
        {[
          { title: "Catalogs", icon: Database, view: "catalogs" as View, detail: "Storage, roles, properties" },
          { title: "Identity", icon: UsersRound, view: "identity" as View, detail: "Principals, roles, assignments" },
          { title: "Lakehouse", icon: Table2, view: "lakehouse" as View, detail: "Namespaces and tables" },
          { title: "Explorer", icon: SquareTerminal, view: "explorer" as View, detail: "Raw operation fallback" }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.title} className="core-card" onClick={() => setView(card.view)}>
              <Icon size={24} />
              <strong>{card.title}</strong>
              <span>{card.detail}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function CatalogsView({
  session,
  catalogs,
  activeCatalog,
  setActiveCatalog,
  refreshCatalogs,
  executePolaris,
  busyKey,
  openConnect
}: DomainProps & {
  catalogs: Catalog[];
  activeCatalog: string;
  setActiveCatalog: (name: string) => void;
  refreshCatalogs: () => void;
}) {
  const [roles, setRoles] = useState<NamedEntity[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [newCatalog, setNewCatalog] = useState({
    name: `console_catalog_${Date.now()}`,
    location: "s3://bucket123",
    endpoint: "http://localhost:9000",
    endpointInternal: "http://rustfs:9000",
    region: "us-west-2"
  });
  const [propertyEdit, setPropertyEdit] = useState({ key: "owner", value: "platform" });
  const [roleName, setRoleName] = useState(`console_role_${Date.now()}`);

  const selected = catalogs.find((catalog) => catalog.name === activeCatalog) ?? catalogs[0];

  useEffect(() => {
    if (!activeCatalog && catalogs.length) setActiveCatalog(catalogs[0].name);
  }, [activeCatalog, catalogs, setActiveCatalog]);

  useEffect(() => {
    if (selected?.name) loadRoles(selected.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.name]);

  async function loadRoles(catalogName: string) {
    const result = await executePolaris("listCatalogRoles", {
      path_params: { catalogName }
    });
    setRoles(rolesFromBody(result));
  }

  async function createCatalog() {
    setMessage(null);
    const result = await executePolaris("createCatalog", {
      body: {
        catalog: {
          name: newCatalog.name,
          type: "INTERNAL",
          readOnly: false,
          properties: { "default-base-location": newCatalog.location },
          storageConfigInfo: {
            storageType: "S3",
            allowedLocations: [newCatalog.location],
            endpoint: newCatalog.endpoint,
            endpointInternal: newCatalog.endpointInternal,
            pathStyleAccess: true,
            region: newCatalog.region
          }
        }
      }
    });
    setMessage(result.ok ? "Catalog created" : `Polaris HTTP ${result.status_code}`);
    await refreshCatalogs();
    setActiveCatalog(newCatalog.name);
  }

  async function updateCatalogProperty() {
    if (!selected) return;
    const nextProperties = {
      ...(selected.properties ?? {}),
      [propertyEdit.key]: propertyEdit.value
    };
    const result = await executePolaris("updateCatalog", {
      path_params: { catalogName: selected.name },
      body: {
        currentEntityVersion: selected.entityVersion,
        properties: nextProperties
      }
    });
    setMessage(result.ok ? "Catalog properties updated" : `Polaris HTTP ${result.status_code}`);
    await refreshCatalogs();
  }

  async function deleteCatalog() {
    if (!selected) return;
    const result = await executePolaris("deleteCatalog", {
      path_params: { catalogName: selected.name }
    });
    setMessage(result.ok ? "Catalog deleted" : `Polaris HTTP ${result.status_code}`);
    setActiveCatalog("");
    await refreshCatalogs();
  }

  async function createRole() {
    if (!selected) return;
    const result = await executePolaris("createCatalogRole", {
      path_params: { catalogName: selected.name },
      body: { catalogRole: { name: roleName, properties: {} } }
    });
    setMessage(result.ok ? "Catalog role created" : `Polaris HTTP ${result.status_code}`);
    await loadRoles(selected.name);
  }

  async function deleteRole(name: string) {
    if (!selected) return;
    const result = await executePolaris("deleteCatalogRole", {
      path_params: { catalogName: selected.name, catalogRoleName: name }
    });
    setMessage(result.ok ? "Catalog role deleted" : `Polaris HTTP ${result.status_code}`);
    await loadRoles(selected.name);
  }

  if (!session.connected) return <ConnectRequired openConnect={openConnect} />;

  return (
    <div className="domain-layout">
      <section className="resource-list">
        <div className="section-title">
          <div>
            <h3>Catalogs</h3>
            <span>{catalogs.length} loaded</span>
          </div>
          <button onClick={refreshCatalogs}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        <div className="list-scroll">
          {catalogs.map((catalog) => (
            <button
              key={catalog.name}
              className={selected?.name === catalog.name ? "resource-row selected" : "resource-row"}
              onClick={() => setActiveCatalog(catalog.name)}
            >
              <Database size={18} />
              <span>
                <strong>{catalog.name}</strong>
                <small>{catalog.type ?? "INTERNAL"} · {catalog.readOnly ? "read only" : "writable"}</small>
              </span>
            </button>
          ))}
          {catalogs.length === 0 && <EmptyState label="No catalogs found" />}
        </div>
      </section>

      <section className="detail-panel">
        <div className="section-title">
          <div>
            <h3>{selected?.name ?? "Catalog"}</h3>
            <span>{selected?.properties?.["default-base-location"] ?? "No location"}</span>
          </div>
          {selected && (
            <button className="danger" disabled={busyKey === "deleteCatalog"} onClick={deleteCatalog}>
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
        {message && <div className="notice">{message}</div>}
        {selected ? (
          <>
            <KeyValueGrid
              items={{
                Type: selected.type ?? "",
                Version: selected.entityVersion ?? "",
                Readonly: selected.readOnly ? "true" : "false",
                Region: selected.storageConfigInfo?.region ?? ""
              }}
            />
            <JsonPanel title="Storage Config" value={selected.storageConfigInfo ?? {}} />
            <div className="inline-form">
              <label>
                <span>Property</span>
                <input value={propertyEdit.key} onChange={(event) => setPropertyEdit({ ...propertyEdit, key: event.target.value })} />
              </label>
              <label>
                <span>Value</span>
                <input value={propertyEdit.value} onChange={(event) => setPropertyEdit({ ...propertyEdit, value: event.target.value })} />
              </label>
              <button className="primary" onClick={updateCatalogProperty}>
                <Save size={16} /> Save Property
              </button>
            </div>
            <div className="split-panel">
              <div>
                <div className="section-title compact">
                  <div>
                    <h3>Catalog Roles</h3>
                    <span>{roles.length} roles</span>
                  </div>
                </div>
                <div className="entity-stack">
                  {roles.map((role) => (
                    <div className="entity-line" key={role.name}>
                      <span>{role.name}</span>
                      <button className="danger ghost" onClick={() => deleteRole(role.name)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {roles.length === 0 && <EmptyState label="No catalog roles" />}
                </div>
              </div>
              <div className="create-box">
                <h3>Create Role</h3>
                <input value={roleName} onChange={(event) => setRoleName(event.target.value)} />
                <button className="primary" onClick={createRole}>
                  <Plus size={16} /> Create Role
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState label="Select a catalog" />
        )}
      </section>

      <section className="detail-panel span-all">
        <div className="section-title">
          <div>
            <h3>Create Catalog</h3>
            <span>Internal S3-compatible catalog</span>
          </div>
          <button className="primary" disabled={busyKey === "createCatalog"} onClick={createCatalog}>
            <Plus size={16} /> Create Catalog
          </button>
        </div>
        <div className="field-grid">
          <label><span>Name</span><input value={newCatalog.name} onChange={(event) => setNewCatalog({ ...newCatalog, name: event.target.value })} /></label>
          <label><span>Base Location</span><input value={newCatalog.location} onChange={(event) => setNewCatalog({ ...newCatalog, location: event.target.value })} /></label>
          <label><span>Endpoint</span><input value={newCatalog.endpoint} onChange={(event) => setNewCatalog({ ...newCatalog, endpoint: event.target.value })} /></label>
          <label><span>Internal Endpoint</span><input value={newCatalog.endpointInternal} onChange={(event) => setNewCatalog({ ...newCatalog, endpointInternal: event.target.value })} /></label>
          <label><span>Region</span><input value={newCatalog.region} onChange={(event) => setNewCatalog({ ...newCatalog, region: event.target.value })} /></label>
        </div>
      </section>
    </div>
  );
}

type DomainProps = {
  session: PolarisSession;
  executePolaris: (
    operationId: string,
    payload?: {
      path_params?: Record<string, string>;
      query_params?: Record<string, string>;
      body?: unknown;
    }
  ) => Promise<OperationResponse>;
  busyKey: string | null;
  openConnect: () => void;
};

function IdentityView({
  session,
  catalogs,
  activeCatalog,
  setActiveCatalog,
  executePolaris,
  busyKey,
  openConnect
}: DomainProps & {
  catalogs: Catalog[];
  activeCatalog: string;
  setActiveCatalog: (name: string) => void;
}) {
  const [principals, setPrincipals] = useState<NamedEntity[]>([]);
  const [principalRoles, setPrincipalRoles] = useState<NamedEntity[]>([]);
  const [selectedPrincipal, setSelectedPrincipal] = useState("");
  const [selectedPrincipalRole, setSelectedPrincipalRole] = useState("");
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [selectedCatalogRole, setSelectedCatalogRole] = useState("");
  const [catalogRoles, setCatalogRoles] = useState<NamedEntity[]>([]);
  const [newPrincipal, setNewPrincipal] = useState(`console_principal_${Date.now()}`);
  const [newPrincipalRole, setNewPrincipalRole] = useState(`console_principal_role_${Date.now()}`);
  const [message, setMessage] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AnyRecord | null>(null);

  useEffect(() => {
    if (session.connected) refreshIdentity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.connected]);

  useEffect(() => {
    const nextCatalog = activeCatalog || catalogs[0]?.name || "";
    if (nextCatalog && selectedCatalog !== nextCatalog) setSelectedCatalog(nextCatalog);
  }, [activeCatalog, catalogs, selectedCatalog]);

  useEffect(() => {
    if (selectedCatalog) loadCatalogRoles(selectedCatalog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatalog]);

  async function refreshIdentity() {
    const [principalsResult, rolesResult] = await Promise.all([
      executePolaris("listPrincipals"),
      executePolaris("listPrincipalRoles")
    ]);
    const principalBody = objectBody(principalsResult);
    const nextPrincipals = Array.isArray(principalBody.principals) ? principalBody.principals : [];
    const nextRoles = rolesFromBody(rolesResult);
    setPrincipals(nextPrincipals);
    setPrincipalRoles(nextRoles);
    if (!selectedPrincipal && nextPrincipals.length) setSelectedPrincipal(nextPrincipals[0].name);
    if (!selectedPrincipalRole && nextRoles.length) setSelectedPrincipalRole(nextRoles[0].name);
  }

  async function loadCatalogRoles(catalogName: string) {
    const result = await executePolaris("listCatalogRoles", {
      path_params: { catalogName }
    });
    const roles = rolesFromBody(result);
    setCatalogRoles(roles);
    if (!selectedCatalogRole && roles.length) setSelectedCatalogRole(roles[0].name);
  }

  async function createPrincipal() {
    const result = await executePolaris("createPrincipal", {
      body: { principal: { name: newPrincipal, properties: {} } }
    });
    setMessage(result.ok ? "Principal created" : `Polaris HTTP ${result.status_code}`);
    setCredentials(objectBody(result).credentials ?? null);
    await refreshIdentity();
  }

  async function deletePrincipal(name: string) {
    const result = await executePolaris("deletePrincipal", {
      path_params: { principalName: name }
    });
    setMessage(result.ok ? "Principal deleted" : `Polaris HTTP ${result.status_code}`);
    setSelectedPrincipal("");
    await refreshIdentity();
  }

  async function createPrincipalRole() {
    const result = await executePolaris("createPrincipalRole", {
      body: { principalRole: { name: newPrincipalRole, properties: {} } }
    });
    setMessage(result.ok ? "Principal role created" : `Polaris HTTP ${result.status_code}`);
    await refreshIdentity();
  }

  async function deletePrincipalRole(name: string) {
    const result = await executePolaris("deletePrincipalRole", {
      path_params: { principalRoleName: name }
    });
    setMessage(result.ok ? "Principal role deleted" : `Polaris HTTP ${result.status_code}`);
    await refreshIdentity();
  }

  async function assignPrincipalRole() {
    if (!selectedPrincipal || !selectedPrincipalRole) return;
    const result = await executePolaris("assignPrincipalRole", {
      path_params: { principalName: selectedPrincipal },
      body: { principalRole: { name: selectedPrincipalRole } }
    });
    setMessage(result.ok ? "Principal role assigned" : `Polaris HTTP ${result.status_code}`);
  }

  async function assignCatalogRole() {
    if (!selectedCatalog || !selectedCatalogRole || !selectedPrincipalRole) return;
    const result = await executePolaris("assignCatalogRoleToPrincipalRole", {
      path_params: { principalRoleName: selectedPrincipalRole, catalogName: selectedCatalog },
      body: { catalogRole: { name: selectedCatalogRole } }
    });
    setMessage(result.ok ? "Catalog role assigned" : `Polaris HTTP ${result.status_code}`);
  }

  if (!session.connected) return <ConnectRequired openConnect={openConnect} />;

  return (
    <div className="domain-layout identity-layout">
      <section className="detail-panel">
        <div className="section-title">
          <div>
            <h3>Principals</h3>
            <span>{principals.length} identities</span>
          </div>
          <button onClick={refreshIdentity}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        {message && <div className="notice">{message}</div>}
        <div className="entity-stack">
          {principals.map((principal) => (
            <div
              key={principal.name}
              className={selectedPrincipal === principal.name ? "entity-line selected" : "entity-line"}
            >
              <button className="entity-main" onClick={() => setSelectedPrincipal(principal.name)}>
                <UsersRound size={17} />
                <span>{principal.name}</span>
              </button>
              <button className="danger ghost" onClick={() => deletePrincipal(principal.name)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {principals.length === 0 && <EmptyState label="No principals" />}
        </div>
        <div className="inline-form one-line">
          <input value={newPrincipal} onChange={(event) => setNewPrincipal(event.target.value)} />
          <button className="primary" disabled={busyKey === "createPrincipal"} onClick={createPrincipal}>
            <UserPlus size={16} /> Create
          </button>
        </div>
        {credentials && <JsonPanel title="New Credentials" value={credentials} />}
      </section>

      <section className="detail-panel">
        <div className="section-title">
          <div>
            <h3>Principal Roles</h3>
            <span>{principalRoles.length} roles</span>
          </div>
        </div>
        <div className="entity-stack">
          {principalRoles.map((role) => (
            <div
              key={role.name}
              className={selectedPrincipalRole === role.name ? "entity-line selected" : "entity-line"}
            >
              <button className="entity-main" onClick={() => setSelectedPrincipalRole(role.name)}>
                <KeyRound size={17} />
                <span>{role.name}</span>
              </button>
              <button className="danger ghost" onClick={() => deletePrincipalRole(role.name)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {principalRoles.length === 0 && <EmptyState label="No principal roles" />}
        </div>
        <div className="inline-form one-line">
          <input value={newPrincipalRole} onChange={(event) => setNewPrincipalRole(event.target.value)} />
          <button className="primary" disabled={busyKey === "createPrincipalRole"} onClick={createPrincipalRole}>
            <Plus size={16} /> Create
          </button>
        </div>
      </section>

      <section className="detail-panel span-all">
        <div className="section-title">
          <div>
            <h3>Assignments</h3>
            <span>Principal roles and catalog roles</span>
          </div>
        </div>
        <div className="assignment-grid">
          <label>
            <span>Principal</span>
            <select value={selectedPrincipal} onChange={(event) => setSelectedPrincipal(event.target.value)}>
              {principals.map((principal) => <option key={principal.name}>{principal.name}</option>)}
            </select>
          </label>
          <label>
            <span>Principal Role</span>
            <select value={selectedPrincipalRole} onChange={(event) => setSelectedPrincipalRole(event.target.value)}>
              {principalRoles.map((role) => <option key={role.name}>{role.name}</option>)}
            </select>
          </label>
          <button className="primary" onClick={assignPrincipalRole}>
            <Save size={16} /> Assign Role
          </button>
          <label>
            <span>Catalog</span>
            <select
              value={selectedCatalog}
              onChange={(event) => {
                setSelectedCatalog(event.target.value);
                setActiveCatalog(event.target.value);
              }}
            >
              {catalogs.map((catalog) => <option key={catalog.name}>{catalog.name}</option>)}
            </select>
          </label>
          <label>
            <span>Catalog Role</span>
            <select value={selectedCatalogRole} onChange={(event) => setSelectedCatalogRole(event.target.value)}>
              {catalogRoles.map((role) => <option key={role.name}>{role.name}</option>)}
            </select>
          </label>
          <button className="primary" onClick={assignCatalogRole}>
            <ShieldCheck size={16} /> Grant Catalog Role
          </button>
        </div>
      </section>
    </div>
  );
}

function LakehouseView({
  session,
  catalogs,
  activeCatalog,
  setActiveCatalog,
  refreshCatalogs,
  executePolaris,
  busyKey,
  openConnect
}: DomainProps & {
  catalogs: Catalog[];
  activeCatalog: string;
  setActiveCatalog: (name: string) => void;
  refreshCatalogs: () => void;
}) {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespace, setNamespace] = useState("");
  const [newNamespace, setNewNamespace] = useState(`console_ns_${Date.now()}`);
  const [tables, setTables] = useState<string[]>([]);
  const [tableName, setTableName] = useState(`console_table_${Date.now()}`);
  const [message, setMessage] = useState<string | null>(null);
  const selectedCatalog = activeCatalog || catalogs[0]?.name || "quickstart_catalog";

  useEffect(() => {
    if (!activeCatalog && catalogs.length) setActiveCatalog(catalogs[0].name);
  }, [activeCatalog, catalogs, setActiveCatalog]);

  useEffect(() => {
    if (session.connected && selectedCatalog) loadNamespaces(selectedCatalog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.connected, selectedCatalog]);

  useEffect(() => {
    if (namespace) loadTables(namespace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace, selectedCatalog]);

  async function loadNamespaces(prefix = selectedCatalog) {
    if (!prefix) return;
    const result = await executePolaris("iceberg_listNamespaces", {
      path_params: { prefix }
    });
    const body = objectBody(result);
    const next = Array.isArray(body.namespaces) ? body.namespaces.map(namespaceName) : [];
    setNamespaces(next);
    if (!namespace && next.length) setNamespace(next[0]);
    if (namespace && !next.includes(namespace)) setNamespace(next[0] ?? "");
  }

  async function createNamespace() {
    const parts = newNamespace.split(".").filter(Boolean);
    const result = await executePolaris("iceberg_createNamespace", {
      path_params: { prefix: selectedCatalog },
      body: { namespace: parts, properties: { owner: "polaris-console" } }
    });
    setMessage(result.ok ? "Namespace created" : `Polaris HTTP ${result.status_code}`);
    await loadNamespaces();
    setNamespace(newNamespace);
  }

  async function dropNamespace(name = namespace) {
    const result = await executePolaris("iceberg_dropNamespace", {
      path_params: { prefix: selectedCatalog, namespace: name }
    });
    setMessage(result.ok ? "Namespace dropped" : `Polaris HTTP ${result.status_code}`);
    setNamespace("");
    await loadNamespaces();
  }

  async function loadTables(ns = namespace) {
    if (!ns) return;
    const result = await executePolaris("iceberg_listTables", {
      path_params: { prefix: selectedCatalog, namespace: ns }
    });
    const body = objectBody(result);
    const next = Array.isArray(body.identifiers)
      ? body.identifiers.map((item: AnyRecord) => String(item.name ?? item.table ?? ""))
      : [];
    setTables(next.filter(Boolean));
  }

  async function createTable() {
    if (!namespace) return;
    const result = await executePolaris("iceberg_createTable", {
      path_params: { prefix: selectedCatalog, namespace },
      body: {
        name: tableName,
        schema: {
          type: "struct",
          "schema-id": 0,
          fields: [
            { id: 1, name: "id", required: true, type: "long" },
            { id: 2, name: "name", required: false, type: "string" }
          ]
        },
        "partition-spec": { "spec-id": 0, fields: [] },
        "write-order": { "order-id": 0, fields: [] },
        "stage-create": false,
        properties: { "format-version": "2" }
      }
    });
    setMessage(result.ok ? "Table created" : `Polaris HTTP ${result.status_code}`);
    await loadTables();
  }

  async function loadTable(name: string) {
    const result = await executePolaris("iceberg_loadTable", {
      path_params: { prefix: selectedCatalog, namespace, table: name }
    });
    setMessage(result.ok ? `Loaded ${name}` : `Polaris HTTP ${result.status_code}`);
  }

  async function dropTable(name: string) {
    const result = await executePolaris("iceberg_dropTable", {
      path_params: { prefix: selectedCatalog, namespace, table: name }
    });
    setMessage(result.ok ? "Table dropped" : `Polaris HTTP ${result.status_code}`);
    await loadTables();
  }

  if (!session.connected) return <ConnectRequired openConnect={openConnect} />;

  return (
    <div className="domain-layout lakehouse-layout">
      <section className="resource-list">
        <div className="section-title">
          <div>
            <h3>Catalog</h3>
            <span>{selectedCatalog}</span>
          </div>
          <button onClick={refreshCatalogs}>
            <RefreshCw size={16} />
          </button>
        </div>
        <select value={selectedCatalog} onChange={(event) => setActiveCatalog(event.target.value)}>
          {catalogs.map((catalog) => <option key={catalog.name}>{catalog.name}</option>)}
        </select>
        <div className="section-title compact">
          <div>
            <h3>Namespaces</h3>
            <span>{namespaces.length} namespaces</span>
          </div>
          <button onClick={() => loadNamespaces()}>
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="list-scroll">
          {namespaces.map((item) => (
            <button
              key={item}
              className={namespace === item ? "resource-row selected" : "resource-row"}
              onClick={() => setNamespace(item)}
            >
              <FolderTree size={18} />
              <span><strong>{item}</strong><small>{selectedCatalog}</small></span>
            </button>
          ))}
          {namespaces.length === 0 && <EmptyState label="No namespaces" />}
        </div>
      </section>

      <section className="detail-panel">
        <div className="section-title">
          <div>
            <h3>{namespace || "Namespace"}</h3>
            <span>{tables.length} tables</span>
          </div>
          {namespace && (
            <button className="danger" onClick={() => dropNamespace()}>
              <Trash2 size={16} /> Drop Namespace
            </button>
          )}
        </div>
        {message && <div className="notice">{message}</div>}
        <div className="inline-form one-line">
          <input value={newNamespace} onChange={(event) => setNewNamespace(event.target.value)} />
          <button className="primary" disabled={busyKey === "iceberg_createNamespace"} onClick={createNamespace}>
            <Plus size={16} /> Namespace
          </button>
        </div>
        <div className="table-toolbar">
          <input value={tableName} onChange={(event) => setTableName(event.target.value)} />
          <button className="primary" disabled={!namespace || busyKey === "iceberg_createTable"} onClick={createTable}>
            <Plus size={16} /> Table
          </button>
          <button disabled={!namespace} onClick={() => loadTables()}>
            <RefreshCw size={16} /> Tables
          </button>
        </div>
        <div className="entity-stack">
          {tables.map((table) => (
            <div className="entity-line" key={table}>
              <Layers size={17} />
              <span>{table}</span>
              <button className="ghost" onClick={() => loadTable(table)}>
                <Eye size={15} />
              </button>
              <button className="danger ghost" onClick={() => dropTable(table)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {tables.length === 0 && <EmptyState label="No tables" />}
        </div>
      </section>
    </div>
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

function KeyValueGrid({ items }: { items: Record<string, string | number | boolean> }) {
  return (
    <div className="kv-grid">
      {Object.entries(items).map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <strong>{String(value || "-")}</strong>
        </div>
      ))}
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="json-panel">
      <h3>{title}</h3>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function ConnectRequired({ openConnect }: { openConnect: () => void }) {
  return (
    <div className="connect-required">
      <CircleAlert size={20} />
      <strong>Not connected</strong>
      <button className="primary" onClick={openConnect}>
        <Cable size={16} /> Connect
      </button>
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
          {operations.map((operation) => (
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
  const [authMode, setAuthMode] = useState(session.auth_mode ?? "client_credentials");
  const [form, setForm] = useState<Record<string, string>>({
    management_url: session.management_url ?? "http://localhost:8181/api/management/v1",
    catalog_url: session.catalog_url ?? "http://localhost:8181/api/catalog",
    realm: session.realm ?? "POLARIS",
    bearer_token: "",
    token_url: "http://localhost:8181/api/catalog/v1/oauth/tokens",
    client_id: "root",
    client_secret: "s3cr3t",
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
