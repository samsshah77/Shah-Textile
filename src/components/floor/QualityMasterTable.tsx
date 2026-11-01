'use client'

import { ViewModeToggle } from '@/components/shared/ViewModeToggle'
import { ExportPdfButton, exportSheetPdf } from '@/components/shared/ExportPdfButton'
import { WhatsAppShareButton } from '@/components/shared/WhatsAppShareButton'
import { QUALITY_MASTER_CSS } from '@/components/floor/quality/qualityMasterStyles'
import { AddQualityModal } from '@/components/floor/quality/AddQualityModal'
import type { QualityMasterTableProps } from '@/components/floor/quality/qualityMasterParts'
import { useQualityMasterTable } from '@/components/floor/quality/useQualityMasterTable'
import { QualityArchiveGrid } from '@/components/floor/quality/QualityArchiveGrid'
import { QualityActiveGrid } from '@/components/floor/quality/QualityActiveGrid'
import { QualityArchiveTable } from '@/components/floor/quality/QualityArchiveTable'
import { QualityActiveTable } from '@/components/floor/quality/QualityActiveTable'
import { QualityLoomsFooter } from '@/components/floor/quality/QualityLoomsFooter'
import { longDateFromYmd } from '@/lib/longDate'
// Named (not `export *`): Next.js does not allow `export *` in a 'use client' file.
export { qualityStatusCounts, QualityStatusFilterBar, type QualityStatusFilter } from '@/components/floor/quality/qualityMasterParts'

export function QualityMasterTable(props: QualityMasterTableProps) {
  const t = useQualityMasterTable(props)
  const { readOnly, toolbarInChrome, canEditProduction, emptyAddForm, addForm, setAddForm, endsFabricFilter, setEndsFabricFilter, mode, setMode, tableEdit, isAddModalOpen, setIsAddModalOpen, isEndedView, isArchiveView, isHoldView, warpOptions, weftOptions, cardTitle, editToggle, handleAddFormKeyDown, handleCreateQuality, sheetDate, orderedForView, assignedByQuality } = t

  /** Active / Hold list as text for WhatsApp: each quality with its looms on the day. */
  const activeShareText = () => {
    const title = isHoldView ? 'Hold Qualities' : 'Active Qualities'
    const lines = orderedForView.map((q, i) => {
      const looms = assignedByQuality.get(q.id) || []
      return `${i + 1}. ${q.name}${looms.length ? ` — L# ${looms.join(', ')}` : ''}`
    })
    return [`*Sara Textile — ${title}*`, sheetDate ? longDateFromYmd(sheetDate) : '', '', ...lines, '', `Total: ${orderedForView.length}`]
      .filter((l, i) => i !== 1 || l)
      .join('\n')
  }

  return (
    <div className="card">
      <style>{QUALITY_MASTER_CSS}</style>
      <div className="card-header d-flex flex-row flex-wrap gap-2 justify-content-between align-items-center">
        <div className="min-w-0">
          <h3 className="card-title mb-0">{cardTitle}</h3>
          {tableEdit && (
            <div className="small text-warning mt-1 mb-0">
              Edit on — Enter / Tab next field · arrows move cells
            </div>
          )}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
          {isEndedView && (
            <>
              <div className="btn-group btn-group-sm" role="group" aria-label="Fabric type filter">
                <button
                  type="button"
                  className={`btn ${endsFabricFilter === 'ALL' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setEndsFabricFilter('ALL')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`btn ${endsFabricFilter === 'Suiting' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setEndsFabricFilter('Suiting')}
                >
                  Suiting
                </button>
                <button
                  type="button"
                  className={`btn ${endsFabricFilter === 'Shirting' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setEndsFabricFilter('Shirting')}
                >
                  Shirting
                </button>
              </div>

              <ExportPdfButton
                filename={`Quality-Ends-Report-${sheetDate || ''}`}
                sheetLabel="Quality Ends • Completion Register"
              />

              <WhatsAppShareButton
                documentTitle="Quality Ends"
                message={`*Sara Textile — Quality Ends*${sheetDate ? `\n${sheetDate}` : ''}`}
                onDownloadPdf={() => exportSheetPdf(`Quality-Ends-Report-${sheetDate || ''}`, 'Quality Ends • Completion Register')}
              />
            </>
          )}
          {!isEndedView && !isArchiveView && (
            <WhatsAppShareButton
              documentTitle={isHoldView ? 'Hold Qualities' : 'Active Qualities'}
              message={activeShareText}
              onDownloadPdf={() => exportSheetPdf(`Production-Quality-${sheetDate || ''}`, 'Quality')}
            />
          )}
          {!toolbarInChrome && editToggle}
          <ViewModeToggle mode={mode} onChange={setMode} />
          {!toolbarInChrome && !readOnly && canEditProduction && !isArchiveView && (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={() => {
                setAddForm({ ...emptyAddForm })
                setIsAddModalOpen(true)
              }}
            >
              <i className="bi bi-plus-lg me-1" /> Add Quality
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        isArchiveView ? (
          <QualityArchiveGrid t={t} />
        ) : (
          <QualityActiveGrid t={t} />
        )
      ) : isArchiveView ? (
        <QualityArchiveTable t={t} />
      ) : (
        <QualityActiveTable t={t} />
      )}

      {/* Available Looms Footer Bar */}
      <QualityLoomsFooter t={t} />

      {/* Add Quality Modal Dialog */}
      {isAddModalOpen && (
        <AddQualityModal
          addForm={addForm}
          setAddForm={setAddForm}
          handleAddFormKeyDown={handleAddFormKeyDown}
          handleCreateQuality={handleCreateQuality}
          setIsAddModalOpen={setIsAddModalOpen}
        />
      )}
      <datalist id="quality-warp-stock">
        {warpOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="quality-weft-stock">
        {weftOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </div>
  )
}



