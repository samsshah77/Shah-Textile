export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("@/lib/env");
    serverEnv();
    // Copy business tables into data_snapshots right after each deploy/restart
    // (skipped if the last snapshot is < 6h old). Never blocks or crashes startup.
    const { snapshotOnStartup } = await import("@/server/dbSnapshot");
    // Snapshot first, then rebuild the production ledger from the sheets.
    void snapshotOnStartup().then(async () => {
      const { rebuildProductionLedger } = await import("@/server/productionLedger");
      const n = await rebuildProductionLedger();
      if (n != null) console.log("[ledger] rebuilt on startup:", n, "rows");
    });
  }
}
