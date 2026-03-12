import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RebuildPage } from "./RebuildPage";

vi.mock("../api/hooks", () => ({
  useCapabilities: () => ({
    data: {
      healthy: false,
      endpoints: {
        lanes: false,
      },
    },
    error: null,
  }),
  useSystemStatus: () => ({
    data: {
      ready: false,
      ui_serving: {
        mode: "static",
        available: false,
      },
      smart_memory: {
        healthy: false,
      },
      startup_errors: [],
    },
    error: null,
  }),
  useRebuildAll: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    data: null,
  }),
  useRebuildSession: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    data: null,
  }),
}));

describe("RebuildPage", () => {
  it("disables rebuild actions when Smart Memory is unavailable", () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <RebuildPage />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("button", {
        name: "Rebuild All",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText("Rebuild actions stay disabled while Smart Memory is unavailable."),
    ).toBeInTheDocument();
  });
});
