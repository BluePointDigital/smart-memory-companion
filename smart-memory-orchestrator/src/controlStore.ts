import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  FramingPolicy,
  HookTrace,
  KnownSession,
  RetrievalTrace,
  RunDetail,
  RunSummary,
  SmartMemoryCapabilities,
  StageTrace,
  TranscriptSlice,
  WorkspaceBundle,
} from "./contracts.js";
import { nowIso, toRecord, uniqueStrings } from "./utils.js";

type RunStatus = "running" | "completed" | "failed";

export class ControlStore {
  private readonly db: Database.Database;

  constructor(dbPath = "data/control-plane.sqlite") {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        run_id TEXT PRIMARY KEY,
        session_id TEXT,
        runtime TEXT NOT NULL,
        user_message TEXT NOT NULL,
        status TEXT NOT NULL,
        request_json TEXT NOT NULL,
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        framing_policy_json TEXT,
        retrieval_trace_json TEXT,
        transcript_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error_json TEXT
      );

      CREATE TABLE IF NOT EXISTS stage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        stage_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(run_id) REFERENCES orchestration_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS hook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        stage_name TEXT NOT NULL,
        hook_name TEXT NOT NULL,
        outcome TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(run_id) REFERENCES orchestration_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_snapshots (
        run_id TEXT PRIMARY KEY,
        bundle_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES orchestration_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS runtime_outputs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        runtime TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES orchestration_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS known_sessions (
        session_id TEXT PRIMARY KEY,
        label TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  createRun(params: {
    runId: string;
    sessionId?: string;
    runtime: string;
    userMessage: string;
    request: Record<string, unknown>;
    capabilities: SmartMemoryCapabilities;
  }): void {
    const now = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO orchestration_runs(
          run_id, session_id, runtime, user_message, status,
          request_json, capabilities_json, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        params.runId,
        params.sessionId ?? null,
        params.runtime,
        params.userMessage,
        "running",
        JSON.stringify(params.request),
        JSON.stringify(params.capabilities),
        now,
        now,
      );
  }

  completeRun(params: {
    runId: string;
    status: Extract<RunStatus, "completed">;
    capabilities: SmartMemoryCapabilities;
    framingPolicy: FramingPolicy;
    retrievalTrace: RetrievalTrace;
    transcript: TranscriptSlice;
    bundle: WorkspaceBundle;
  }): void {
    const now = nowIso();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `
          UPDATE orchestration_runs
          SET status = ?, capabilities_json = ?, framing_policy_json = ?,
              retrieval_trace_json = ?, transcript_json = ?, updated_at = ?, error_json = NULL
          WHERE run_id = ?
        `,
        )
        .run(
          params.status,
          JSON.stringify(params.capabilities),
          JSON.stringify(params.framingPolicy),
          JSON.stringify(params.retrievalTrace),
          JSON.stringify(params.transcript),
          now,
          params.runId,
        );

      this.db
        .prepare(
          `
          INSERT INTO workspace_snapshots(run_id, bundle_json, created_at)
          VALUES(?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET bundle_json = excluded.bundle_json, created_at = excluded.created_at
        `,
        )
        .run(params.runId, JSON.stringify(params.bundle), now);

      this.db.prepare("DELETE FROM runtime_outputs WHERE run_id = ?").run(params.runId);
      for (const [runtime, payload] of Object.entries(params.bundle.adapters)) {
        this.db
          .prepare(
            `
            INSERT INTO runtime_outputs(run_id, runtime, payload_json, created_at)
            VALUES(?, ?, ?, ?)
          `,
          )
          .run(params.runId, runtime, JSON.stringify(payload), now);
      }
    });

    transaction();
  }

  failRun(runId: string, error: Record<string, unknown>): void {
    this.db
      .prepare(
        `
        UPDATE orchestration_runs
        SET status = ?, updated_at = ?, error_json = ?
        WHERE run_id = ?
      `,
      )
      .run("failed", nowIso(), JSON.stringify(error), runId);
  }

  insertStageTrace(runId: string, trace: StageTrace): void {
    this.db
      .prepare(
        `
        INSERT INTO stage_events(
          run_id, stage_name, status, started_at, finished_at, duration_ms, payload_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        runId,
        trace.stage,
        trace.status,
        trace.started_at,
        trace.finished_at,
        trace.duration_ms,
        JSON.stringify(trace.payload),
      );
  }

  insertHookTrace(runId: string, trace: HookTrace): void {
    this.db
      .prepare(
        `
        INSERT INTO hook_events(
          run_id, stage_name, hook_name, outcome, started_at, finished_at, duration_ms, detail_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        runId,
        trace.stage,
        trace.hook_name,
        trace.outcome,
        trace.started_at,
        trace.finished_at,
        trace.duration_ms,
        JSON.stringify(trace.detail),
      );
  }

  upsertKnownSession(params: {
    sessionId: string;
    source: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO known_sessions(session_id, label, source, last_seen_at, metadata_json)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          label = excluded.label,
          source = excluded.source,
          last_seen_at = excluded.last_seen_at,
          metadata_json = excluded.metadata_json
      `,
      )
      .run(
        params.sessionId,
        params.label ?? "",
        params.source,
        nowIso(),
        JSON.stringify(params.metadata ?? {}),
      );
  }

  listKnownSessions(query?: string): KnownSession[] {
    const search = query?.trim().toLowerCase();
    const rows = (search
      ? this.db
          .prepare(
            `
            SELECT session_id, label, source, last_seen_at, metadata_json
            FROM known_sessions
            WHERE lower(session_id) LIKE ? OR lower(label) LIKE ?
            ORDER BY last_seen_at DESC, session_id ASC
          `,
          )
          .all(`%${search}%`, `%${search}%`)
      : this.db
          .prepare(
            `
            SELECT session_id, label, source, last_seen_at, metadata_json
            FROM known_sessions
            ORDER BY last_seen_at DESC, session_id ASC
          `,
          )
          .all()) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      session_id: String(row.session_id),
      label: String(row.label ?? ""),
      source: String(row.source),
      last_seen_at: String(row.last_seen_at),
      metadata: toRecord(JSON.parse(String(row.metadata_json ?? "{}"))),
    }));
  }

  listRuns(limit = 50): RunSummary[] {
    const rows = this.db
      .prepare(
        `
        SELECT run_id, session_id, runtime, user_message, status, created_at, updated_at
        FROM orchestration_runs
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      run_id: String(row.run_id),
      session_id: row.session_id ? String(row.session_id) : undefined,
      runtime: String(row.runtime),
      user_message: String(row.user_message),
      status: String(row.status),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
  }

  getRun(runId: string): RunDetail | null {
    const summaryRow = this.db
      .prepare(
        `
        SELECT run_id, session_id, runtime, user_message, status, created_at, updated_at,
               capabilities_json, framing_policy_json, retrieval_trace_json, transcript_json
        FROM orchestration_runs
        WHERE run_id = ?
      `,
      )
      .get(runId) as Record<string, unknown> | undefined;

    if (!summaryRow) {
      return null;
    }

    const stageRows = this.db
      .prepare(
        `
        SELECT stage_name, status, started_at, finished_at, duration_ms, payload_json
        FROM stage_events
        WHERE run_id = ?
        ORDER BY id ASC
      `,
      )
      .all(runId) as Array<Record<string, unknown>>;

    const hookRows = this.db
      .prepare(
        `
        SELECT stage_name, hook_name, outcome, started_at, finished_at, duration_ms, detail_json
        FROM hook_events
        WHERE run_id = ?
        ORDER BY id ASC
      `,
      )
      .all(runId) as Array<Record<string, unknown>>;

    const workspaceRow = this.db
      .prepare("SELECT bundle_json FROM workspace_snapshots WHERE run_id = ?")
      .get(runId) as Record<string, unknown> | undefined;

    return {
      summary: {
        run_id: String(summaryRow.run_id),
        session_id: summaryRow.session_id ? String(summaryRow.session_id) : undefined,
        runtime: String(summaryRow.runtime),
        user_message: String(summaryRow.user_message),
        status: String(summaryRow.status),
        created_at: String(summaryRow.created_at),
        updated_at: String(summaryRow.updated_at),
      },
      capabilities: JSON.parse(String(summaryRow.capabilities_json ?? "{}")),
      framing_policy: summaryRow.framing_policy_json
        ? JSON.parse(String(summaryRow.framing_policy_json))
        : undefined,
      retrieval_trace: summaryRow.retrieval_trace_json
        ? JSON.parse(String(summaryRow.retrieval_trace_json))
        : undefined,
      transcript: summaryRow.transcript_json
        ? JSON.parse(String(summaryRow.transcript_json))
        : undefined,
      workspace: workspaceRow ? JSON.parse(String(workspaceRow.bundle_json)) : undefined,
      stage_trace: stageRows.map((row) => ({
        stage: String(row.stage_name),
        status: String(row.status),
        started_at: String(row.started_at),
        finished_at: String(row.finished_at),
        duration_ms: Number(row.duration_ms),
        payload: toRecord(JSON.parse(String(row.payload_json ?? "{}"))),
      })),
      hook_trace: hookRows.map((row) => ({
        stage: String(row.stage_name),
        hook_name: String(row.hook_name),
        outcome: String(row.outcome),
        started_at: String(row.started_at),
        finished_at: String(row.finished_at),
        duration_ms: Number(row.duration_ms),
        detail: toRecord(JSON.parse(String(row.detail_json ?? "{}"))),
      })),
    };
  }

  getWorkspace(runId: string): WorkspaceBundle | null {
    const row = this.db
      .prepare("SELECT bundle_json FROM workspace_snapshots WHERE run_id = ?")
      .get(runId) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(String(row.bundle_json));
  }

  listWorkspaceSessionIds(): string[] {
    const rows = this.db
      .prepare("SELECT bundle_json FROM workspace_snapshots ORDER BY created_at DESC")
      .all() as Array<Record<string, unknown>>;

    const sessionIds: string[] = [];
    for (const row of rows) {
      const bundle = JSON.parse(String(row.bundle_json ?? "{}")) as Partial<WorkspaceBundle>;
      if (bundle.request?.session_id) {
        sessionIds.push(bundle.request.session_id);
      }
      if (bundle.transcript?.session_id) {
        sessionIds.push(bundle.transcript.session_id);
      }
    }

    return uniqueStrings(sessionIds);
  }
}
