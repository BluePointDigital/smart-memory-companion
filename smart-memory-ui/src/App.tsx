import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { MemoriesPage } from "./pages/MemoriesPage";
import { MemoryDetailPage } from "./pages/MemoryDetailPage";
import { RebuildPage } from "./pages/RebuildPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { RunsPage } from "./pages/RunsPage";
import { TranscriptDetailPage } from "./pages/TranscriptDetailPage";
import { TranscriptsPage } from "./pages/TranscriptsPage";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <RunsPage />,
      },
      {
        path: "runs/:runId",
        element: <RunDetailPage />,
      },
      {
        path: "transcripts",
        element: <TranscriptsPage />,
      },
      {
        path: "transcripts/:sessionId",
        element: <TranscriptDetailPage />,
      },
      {
        path: "memories",
        element: <MemoriesPage />,
      },
      {
        path: "memories/:memoryId",
        element: <MemoryDetailPage />,
      },
      {
        path: "rebuild",
        element: <RebuildPage />,
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
