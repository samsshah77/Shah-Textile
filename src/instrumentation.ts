export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverEnv } = await import("@/lib/env");
    serverEnv();
    // Copy business tables into data_snapshots right after each deploy/restart
    // (skipped if the last snapshot is < 6h old). Never blocks or crashes startup.
    const { snapshotOnStartup } = await import("@/server/dbSnapshot");
    // Fault videos older than 90 days are removed once a day (disk space).
    const { scheduleFaultVideoCleanup } = await import("@/server/floor/faultVideoCleanup");
    scheduleFaultVideoCleanup();
    // Snapshot first, then rebuild the production ledger from the sheets.
    void snapshotOnStartup().then(async () => {
      const { rebuildProductionLedger } = await import("@/server/productionLedger");
      const n = await rebuildProductionLedger();
      if (n != null) console.log("[ledger] rebuilt on startup:", n, "rows");
      if (n == null) return;
      // One-time: copy resolved quality ids into rows saved before ids existed.
      try {
        const q = await import("@/server/qualityStamp");
        const missing = await q.countRowsMissingQualityId();
        if (missing > 0) {
          const { takeSnapshot } = await import("@/server/dbSnapshot");
          await takeSnapshot("before-qualityId-backfill");
          const done = await q.backfillQualityIds();
          console.log("[qualityId] backfilled", done, "rows");
        }
      } catch (err) {
        console.error("[qualityId] backfill skipped (app continues)", err);
      }
    });
  }
}
