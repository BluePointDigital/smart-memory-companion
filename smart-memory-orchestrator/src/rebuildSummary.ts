import { SmartMemoryCapabilities } from "./contracts.js";
import { SmartMemoryClient } from "./smartMemoryClient.js";

function incrementCount(
  counts: Record<string, number>,
  key: string,
  by = 1,
): Record<string, number> {
  counts[key] = (counts[key] ?? 0) + by;
  return counts;
}

export async function buildMemorySummary(
  client: SmartMemoryClient,
  capabilities: SmartMemoryCapabilities,
): Promise<{
  memories_total: number;
  by_status: Record<string, number>;
  lanes: Record<string, number>;
}> {
  const memories = capabilities.endpoints.memories ? await client.listMemories() : [];
  const byStatus = memories.reduce<Record<string, number>>((accumulator, memory) => {
    incrementCount(accumulator, (memory.status ?? "unknown").toLowerCase());
    return accumulator;
  }, {});

  const lanes: Record<string, number> = {};
  if (capabilities.endpoints.lanes) {
    for (const laneName of ["core", "working"]) {
      const items = await client.getLane(laneName);
      lanes[laneName] = items.length;
    }
  }

  return {
    memories_total: memories.length,
    by_status: byStatus,
    lanes,
  };
}
