import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useSessions } from "../api/hooks";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";
import { formatTimestampWithRelative } from "../utils/format";

export function TranscriptsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const sessions = useSessions(search);

  function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim()) {
      navigate(`/transcripts/${search.trim()}`);
    }
  }

  return (
    <div className="page">
      <SectionTitle
        title="Transcripts"
        meta="Browse known sessions from the orchestrator index or jump directly to a session ID for manual transcript lookup."
      />

      <Panel title="Session Lookup">
        <form className="inline-form" onSubmit={handleLookup}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="session_task"
          />
          <button className="button-primary" type="submit">
            Open Transcript
          </button>
        </form>
      </Panel>

      <Panel title="Known Sessions">
        {sessions.isPending ? <LoadingState label="Loading known sessions..." rows={5} /> : null}
        {sessions.error ? <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} /> : null}
        {!sessions.isPending && !sessions.error && sessions.data?.items.length === 0 ? (
          <EmptyState>
            No known sessions yet. Companion-observed ingests and lookups will populate this list.
          </EmptyState>
        ) : null}
        {sessions.data?.items.length ? (
          <ul className="list">
            {sessions.data.items.map((session) => (
              <li className="list-item" key={session.session_id}>
                <strong>
                  <Link to={`/transcripts/${session.session_id}`}>{session.session_id}</Link>
                </strong>
                <div className="meta">
                  {session.source} · {formatTimestampWithRelative(session.last_seen_at)}
                </div>
                {session.label ? <div>{session.label}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
