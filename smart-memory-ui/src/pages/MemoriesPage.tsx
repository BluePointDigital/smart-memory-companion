import { ChangeEvent, useState } from "react";
import { Link } from "react-router-dom";

import { useMemories } from "../api/hooks";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";
import { formatTimestampWithRelative } from "../utils/format";

export function MemoriesPage() {
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    lane: "",
    sessionId: "",
  });
  const memories = useMemories(filters);

  function updateFilter<K extends keyof typeof filters>(key: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFilters((current) => ({
        ...current,
        [key]: event.target.value,
      }));
    };
  }

  return (
    <div className="page">
      <SectionTitle
        title="Memory Explorer"
        meta="Filter by type, status, lane, and source session. Drill into evidence, history, and revision chain from the detail view."
      />

      <Panel title="Filters">
        <div className="inline-form">
          <select value={filters.type} onChange={updateFilter("type")}>
            <option value="">All types</option>
            <option value="identity">Identity</option>
            <option value="task_state">Task state</option>
            <option value="preference">Preference</option>
            <option value="belief">Belief</option>
            <option value="semantic">Semantic</option>
            <option value="episodic">Episodic</option>
          </select>
          <select value={filters.status} onChange={updateFilter("status")}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="superseded">Superseded</option>
            <option value="expired">Expired</option>
          </select>
          <select value={filters.lane} onChange={updateFilter("lane")}>
            <option value="">All lanes</option>
            <option value="core">Core</option>
            <option value="working">Working</option>
          </select>
          <input
            value={filters.sessionId}
            onChange={updateFilter("sessionId")}
            placeholder="session_task"
          />
        </div>
      </Panel>

      <Panel title="Memories">
        {memories.isPending ? <LoadingState label="Loading memories..." rows={6} /> : null}
        {memories.error ? <ErrorState error={memories.error} onRetry={() => memories.refetch()} /> : null}
        {!memories.isPending && !memories.error && memories.data?.items.length === 0 ? (
          <EmptyState>No memories matched the current filters.</EmptyState>
        ) : null}
        {memories.data?.items.length ? (
          <ul className="list">
            {memories.data.items.map((memory) => (
              <li className="list-item" key={memory.id}>
                <strong>
                  <Link to={`/memories/${memory.id}`}>{memory.content}</Link>
                </strong>
                <div className="meta">
                  {(memory.memory_type ?? memory.type ?? "unknown")} · {memory.status ?? "unknown"} ·{" "}
                  {formatTimestampWithRelative(memory.updated_at ?? memory.created_at)}
                </div>
                {memory.source_session_id ? (
                  <div className="meta">
                    session:{" "}
                    <Link to={`/transcripts/${memory.source_session_id}`}>
                      {memory.source_session_id}
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
