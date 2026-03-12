import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { TranscriptDetailPage } from "./TranscriptDetailPage";

vi.mock("../api/hooks", () => ({
  useTranscript: () => ({
    isPending: false,
    error: null,
    data: {
      session_id: "session_task",
      messages: [
        {
          message_id: "msg_task",
          session_id: "session_task",
          seq_num: 1,
          role: "user",
          source_type: "conversation",
          content: "Database migration is blocked on schema review.",
          created_at: "2026-03-12T14:05:00Z",
          metadata: {},
        },
      ],
    },
  }),
  useSessionEvidence: () => ({
    data: {
      msg_task: [
        {
          memory: {
            id: "mem_task",
            content: "Database migration is blocked on schema review.",
          },
          evidence: {
            message_id: "msg_task",
          },
        },
      ],
    },
  }),
}));

describe("TranscriptDetailPage", () => {
  it("shows linked memories next to transcript messages", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/transcripts/session_task"]}>
          <Routes>
            <Route path="/transcripts/:sessionId" element={<TranscriptDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getAllByText("Database migration is blocked on schema review.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", {
        name: "Database migration is blocked on schema review.",
      }),
    ).toBeInTheDocument();
  });
});
