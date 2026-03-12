import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunsPage } from "./RunsPage";

vi.mock("../api/hooks", () => ({
  useRuns: () => ({
    isPending: false,
    error: null,
    data: {
      items: [
        {
          run_id: "run_1234",
          runtime: "openclaw",
          user_message: "What is blocking the database migration?",
          status: "completed",
          created_at: "2026-03-12T14:00:00Z",
          updated_at: "2026-03-12T14:00:00Z",
          session_id: "session_task",
        },
      ],
    },
  }),
  useAssembleWorkspace: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSystemStatus: () => ({
    data: {
      ready: true,
    },
  }),
}));

describe("RunsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders recent runs from the orchestrator feed", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RunsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("New Workspace Run")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "What is blocking the database migration?",
      }),
    ).toBeInTheDocument();
  });
});
