export async function ensureServiceRunning({
  mode,
  probeReady,
  startProcess,
  waitForReady,
  terminateProcess,
}) {
  if (await probeReady()) {
    return {
      state: "reused",
      child: null,
    };
  }

  if (mode === "manual") {
    return {
      state: "manual",
      child: null,
    };
  }

  const child = await startProcess();

  try {
    await waitForReady();
    return {
      state: "started",
      child,
    };
  } catch (error) {
    terminateProcess?.(child);
    throw error;
  }
}

export async function shutdownManagedChildren(children, terminateProcess) {
  for (const child of [...children].reverse()) {
    terminateProcess(child);
  }
}
