/** Row tints for the Quality Master (flash after End / Hold / Resume / Reuse, past-history rows). */
export const QUALITY_MASTER_CSS = `
        /* Flat soft row tint — one solid color, no per-cell accent stripes */
        .sara-quality-flash-ended,
        .sara-quality-flash-ended.master-grid-card,
        li.sara-quality-flash-ended {
          background-color: var(--bs-danger-bg-subtle, #f8d7da) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-ended > td {
          background-color: var(--bs-danger-bg-subtle, #f8d7da) !important;
          border-color: var(--bs-danger-bg-subtle, #f8d7da) !important;
          box-shadow: none !important;
        }
        .sara-quality-flash-hold,
        .sara-quality-flash-hold.master-grid-card,
        li.sara-quality-flash-hold {
          background-color: var(--bs-warning-bg-subtle, #fff3cd) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-hold > td {
          background-color: var(--bs-warning-bg-subtle, #fff3cd) !important;
          border-color: var(--bs-warning-bg-subtle, #fff3cd) !important;
          box-shadow: none !important;
        }
        .sara-quality-flash-active,
        .sara-quality-flash-active.master-grid-card,
        li.sara-quality-flash-active {
          background-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-active > td {
          background-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          border-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          box-shadow: none !important;
        }
        .sara-quality-flash-reuse,
        .sara-quality-flash-reuse.master-grid-card,
        li.sara-quality-flash-reuse {
          background-color: var(--bs-info-bg-subtle, #cff4fc) !important;
          box-shadow: none !important;
        }
        tr.sara-quality-flash-reuse > td {
          background-color: var(--bs-info-bg-subtle, #cff4fc) !important;
          border-color: var(--bs-info-bg-subtle, #cff4fc) !important;
          box-shadow: none !important;
        }
        /* HOLD on past Active days (was running then) — history only, not Resume. */
        .sara-quality-held-history,
        .sara-quality-held-history.master-grid-card,
        li.sara-quality-held-history {
          background-color: rgba(253, 126, 20, 0.22) !important;
          box-shadow: inset 4px 0 0 #fd7e14 !important;
          opacity: 0.92;
        }
        tr.sara-quality-held-history > td {
          background-color: rgba(253, 126, 20, 0.2) !important;
        }
        /* ENDED on past Active days — muted slate history bg. */
        .sara-quality-ended-history,
        .sara-quality-ended-history.master-grid-card,
        li.sara-quality-ended-history {
          background-color: rgba(108, 117, 125, 0.18) !important;
          box-shadow: inset 4px 0 0 #6c757d !important;
          opacity: 0.92;
        }
        tr.sara-quality-ended-history > td {
          background-color: rgba(108, 117, 125, 0.16) !important;
        }
        /* Available Looms small boxes */
        .sara-available-loom-chip {
          min-width: 28px;
          height: 24px;
          padding: 0 5px;
          font-size: 0.72rem;
          font-weight: 700;
          border-radius: 4px;
          background-color: var(--bs-card-bg, #ffffff);
          border: 1px solid var(--bs-border-color, #dee2e6);
          color: var(--bs-body-color, #212529);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
          transition: all 0.15s ease-in-out;
          cursor: default;
          user-select: none;
        }
        .sara-available-loom-chip:hover {
          border-color: var(--bs-success, #198754) !important;
          background-color: var(--bs-success-bg-subtle, #d1e7dd) !important;
          color: var(--bs-success-emphasis, #0a3622) !important;
        }
`
