import { Link, useParams } from "react-router-dom";

import { useSessionEvidence, useTranscript } from "../api/hooks";
import {
  CopyButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";
import { formatTimestampWithRelative } from "../utils/format";

export function TranscriptDetailPage() {
  const params = useParams();
  const transcript = useTranscript(params.sessionId);
  const evidence = useSessionEvidence(params.sessionId);

  return (
    <div className="page">
      <SectionTitle
        title="Transcript Detail"
        meta="Ordered messages, message metadata, and linked memory evidence discovered through the orchestrator's inspection routes."
        actions={
          transcript.data?.session_id ? (
            <CopyButton label="Copy session ID" value={transcript.data.session_id} />
          ) : undefined
        }
      />

      {transcript.isPending ? <LoadingState label="Loading transcript..." rows={6} /> : null}
      {transcript.error ? <ErrorState error={transcript.error} onRetry={() => transcript.refetch()} /> : null}
      {transcript.data ? (
        <Panel title={transcript.data.session_id}>
          {evidence.error ? <ErrorState error={evidence.error} onRetry={() => evidence.refetch()} /> : null}
          {transcript.data.messages.length === 0 ? (
            <EmptyState>This session has no transcript messages.</EmptyState>
          ) : (
            <ul className="list">
              {transcript.data.messages.map((message) => (
                <li className="list-item" key={message.message_id}>
                  <div className="list-item-header">
                    <strong>
                      {message.role} · seq {message.seq_num}
                    </strong>
                    <CopyButton label="Copy message ID" value={message.message_id} />
                  </div>
                  <div>{message.content}</div>
                  <div className="meta">{formatTimestampWithRelative(message.created_at)}</div>
                  {evidence.data?.[message.message_id]?.length ? (
                    <div className="stack" style={{ marginTop: 12 }}>
                      <span className="meta">Linked memories</span>
                      {evidence.data[message.message_id].map((pair) => (
                        <Link
                          key={`${message.message_id}-${pair.memory.id}`}
                          to={`/memories/${pair.memory.id}`}
                        >
                          {pair.memory.content}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
