'use client'

export type TableGridMode = 'table' | 'grid'

interface ViewModeToggleProps {
  mode: TableGridMode
  onChange: (mode: TableGridMode) => void
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="View mode">
      <button
        type="button"
        className={`btn ${mode === 'table' ? 'btn-primary' : 'btn-outline-primary'}`}
        title="Table view"
        onClick={() => onChange('table')}
      >
        <i className="bi bi-table" />
        <span className="ms-1 d-none d-sm-inline">Table</span>
      </button>
      <button
        type="button"
        className={`btn ${mode === 'grid' ? 'btn-primary' : 'btn-outline-primary'}`}
        title="Grid view"
        onClick={() => onChange('grid')}
      >
        <i className="bi bi-grid-3x3-gap" />
        <span className="ms-1 d-none d-sm-inline">Grid</span>
      </button>
    </div>
  )
}
