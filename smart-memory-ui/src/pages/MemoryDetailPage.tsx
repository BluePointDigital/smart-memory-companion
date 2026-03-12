import { useParams } from "react-router-dom";

import {
  useDemoteLane,
  useMemory,
  useMemoryChain,
  useMemoryEvidence,
  useMemoryHistory,
  usePromoteLane,
  useSystemStatus,
} from "../api/hooks";
import {
  EmptyState,
  ErrorState,
  JsonBlock,
  LoadingState,
  Panel,
  SectionTitle,
} from "../components/UiPrimitives";

export function MemoryDetailPage() {
  const params = useParams();
  const systemStatus = useSystemStatus();
  const memory = useMemory(params.memoryId);
  const chain = useMemoryChain(params.memoryId);
  const history = useMemoryHistory(params.memoryId);
  const evidence = useMemoryEvidence(params.memoryId);
  const promote = usePromoteLane(params.memoryId, "core");
  const demote = useDemoteLane(params.memoryId, "core");

  async function handlePromote() {
    if (!systemStatus.data?.ready) {
      return;
    }
    if (window.confirm("Promote this memory into the core lane?")) {
      await promote.mutateAsync();
    }
  }

  async function handleDemote() {
    if (!systemStatus.data?.ready) {
      return;
    }
    if (window.confirm("Remove this memory from the core lane?")) {
      await demote.mutateAsync();
    }
  }

  return (
    <div className="page">
      <SectionTitle
        title="Memory Detail"
        meta="Inspect the memory record, evidence attachments, revision chain, and manual lane operations."
      />

      {memory.isPending ? <LoadingState label="Loading memory detail..." rows={5} /> : null}
      {memory.error ? <ErrorState error={memory.error} onRetry={() => memory.refetch()} /> : null}
      {!memory.isPending && !memory.error && !memory.data ? (
        <EmptyState>Memory not found.</EmptyState>
      ) : null}

      {memory.data ? (
        <>
          <Panel title="Memory Record">
            <div className="button-row" style={{ marginBottom: 12 }}>
              <button
                className="button-primary"
                disabled={!systemStatus.data?.ready || promote.isPending}
                onClick={handlePromote}
                type="button"
              >
                Promote to Core
              </button>
              <button
                className="button-secondary"
                disabled={!systemStatus.data?.ready || demote.isPending}
                onClick={handleDemote}
                type="button"
              >
                Demote from Core
              </button>
            </div>
            {!systemStatus.data?.ready ? (
              <p className="meta" style={{ marginBottom: 12 }}>
                Lane actions are disabled until Smart Memory is healthy.
              </p>
            ) : null}
            <JsonBlock
              filename={`${memory.data.id}-record.json`}
              title="Memory record"
              value={memory.data}
            />
          </Panel>

          <div className="grid two">
            <Panel title="Evidence">
              {evidence.isPending ? <LoadingState label="Loading evidence..." rows={4} /> : null}
              {evidence.error ? (
                <ErrorState error={evidence.error} onRetry={() => evidence.refetch()} />
              ) : null}
              {evidence.data?.items.length ? (
                <JsonBlock
                  collapsed
                  filename={`${memory.data.id}-evidence.json`}
                  title="Evidence records"
                  value={evidence.data.items}
                />
              ) : (
                <EmptyState>No evidence records were returned.</EmptyState>
              )}
            </Panel>
            <Panel title="Revision Chain">
              {chain.isPending ? <LoadingState label="Loading revision chain..." rows={4} /> : null}
              {chain.error ? <ErrorState error={chain.error} onRetry={() => chain.refetch()} /> : null}
              {chain.data?.items.length ? (
                <JsonBlock
                  collapsed
                  filename={`${memory.data.id}-chain.json`}
                  title="Revision chain"
                  value={chain.data.items}
                />
              ) : (
                <EmptyState>No revision chain was returned.</EmptyState>
              )}
            </Panel>
          </div>

          <Panel title="History">
            {history.isPending ? <LoadingState label="Loading memory history..." rows={4} /> : null}
            {history.error ? <ErrorState error={history.error} onRetry={() => history.refetch()} /> : null}
            {history.data?.items.length ? (
              <JsonBlock
                collapsed
                filename={`${memory.data.id}-history.json`}
                title="History entries"
                value={history.data.items}
              />
            ) : (
              <EmptyState>No history entries were returned.</EmptyState>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
