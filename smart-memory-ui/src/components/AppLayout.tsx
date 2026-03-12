import { NavLink, Outlet } from "react-router-dom";

import { useSystemStatus } from "../api/hooks";
import { formatHostPort, formatTimestampWithRelative } from "../utils/format";

function statusClass(healthy?: boolean): string {
  if (healthy === undefined) {
    return "pill warn";
  }
  return healthy ? "pill ok" : "pill danger";
}

function getUiModeLabel(mode?: string, available?: boolean): string {
  if (mode === "static") {
    return available ? "Static UI" : "Static UI missing";
  }
  if (mode === "external") {
    return "External UI";
  }
  return "API-only mode";
}

export function AppLayout() {
  const systemStatus = useSystemStatus();
  const smartMemory = systemStatus.data?.smart_memory;
  const uiServing = systemStatus.data?.ui_serving;
  const urls = systemStatus.data?.urls;
  const lastRefresh =
    systemStatus.data?.last_checked_at ||
    (systemStatus.dataUpdatedAt ? new Date(systemStatus.dataUpdatedAt).toISOString() : undefined);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>Smart Memory</h1>
          <p>Companion orchestrator and visual control surface.</p>
        </div>

        <div className="stack sidebar-meta">
          <span className={statusClass(systemStatus.data?.ready)}>
            {systemStatus.data?.ready ? "System ready" : "System degraded"}
          </span>
          <span className={statusClass(smartMemory?.healthy)}>
            Smart Memory: {smartMemory?.state ?? "checking"}
          </span>
          <span className={statusClass(uiServing?.available)}>
            {getUiModeLabel(uiServing?.mode, uiServing?.available)}
          </span>
          {smartMemory ? (
            <p className="meta">
              Start mode: {smartMemory.start_mode} · Host: {formatHostPort(urls?.smart_memory)}
            </p>
          ) : null}
          {systemStatus.data?.startup_errors.length ? (
            <p className="meta">Startup issue: {systemStatus.data.startup_errors[0]}</p>
          ) : null}
        </div>

        <nav className="nav-list">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} end>
            Runs & Workspace
          </NavLink>
          <NavLink
            to="/transcripts"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            Transcripts
          </NavLink>
          <NavLink
            to="/memories"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            Memory
          </NavLink>
          <NavLink
            to="/rebuild"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            Rebuild & Debug
          </NavLink>
        </nav>
      </aside>

      <div className="content-shell">
        <div className="health-bar">
          <div className="health-bar-group">
            <span className={statusClass(systemStatus.data?.ready)}>Orchestrator</span>
            <span className={statusClass(smartMemory?.healthy)}>Smart Memory</span>
            <span className={statusClass(uiServing?.available)}>
              {getUiModeLabel(uiServing?.mode, uiServing?.available)}
            </span>
          </div>
          <div className="health-bar-group meta">
            <span>Orchestrator: {formatHostPort(urls?.orchestrator)}</span>
            <span>Smart Memory: {formatHostPort(urls?.smart_memory)}</span>
            <span>Last refresh: {formatTimestampWithRelative(lastRefresh)}</span>
          </div>
          <div className="button-row">
            <button
              className="button-secondary button-small"
              disabled={systemStatus.isFetching}
              onClick={() => systemStatus.refetch()}
              type="button"
            >
              {systemStatus.isFetching ? "Refreshing..." : "Refresh status"}
            </button>
          </div>
        </div>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
