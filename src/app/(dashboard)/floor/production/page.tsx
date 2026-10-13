'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProductionGrid } from '@/hooks/useProductionGrid'
import { ProductionSheetTable, type SheetTextSize } from '@/components/floor/ProductionSheetTable'
import { FloorEntryTable } from '@/components/floor/FloorEntryTable'
import { FabricFaultTable } from '@/components/floor/FabricFaultTable'
import { LoomMasterTable } from '@/components/floor/LoomMasterTable'
import {
  BeamMasterTable,
  BeamStockFilterBar,
  beamStockCounts,
  type BeamFilterType,
} from '@/components/floor/BeamMasterTable'
import { YarnStockTable } from '@/components/floor/YarnStockTable'
import {
  QualityMasterTable,
  QualityStatusFilterBar,
  qualityStatusCounts,
  type QualityStatusFilter,
} from '@/components/floor/QualityMasterTable'
import { ProductionDateFilterBar } from '@/components/floor/ProductionDateFilterBar'
import { NewDayProductionModal } from '@/components/floor/NewDayProductionModal'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { type TableGridMode } from '@/components/shared/ViewModeToggle'
import { useAuth } from '@/context/AuthContext'
import { useFloorDateLabel } from '@/context/FloorDateContext'

function ProductionWorkspaceContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab') || 'sheet'
  const currentTab =
    rawTab === 'daily'
      ? 'entry'
      : rawTab === 'beam-stock'
        ? 'beams'
        : rawTab === 'weft-stock'
          ? 'yarn'
          : rawTab === 'qualities'
            ? 'quality'
            : rawTab

  const { isAccountant, canEditProduction } = useAuth()
  const { setDateLabel } = useFloorDateLabel()
  const [isNewDayModalOpen, setIsNewDayModalOpen] = useState(false)
  const [yarnDateMode, setYarnDateMode] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY')
  const [beamFilter, setBeamFilter] = useState<BeamFilterType>('ALL')
  const [qualityStatusFilter, setQualityStatusFilter] = useState<QualityStatusFilter>('ACTIVE')
  const [qualityEdit, setQualityEdit] = useState(false)
  const [qualityViewMode, setQualityViewMode] = useState<TableGridMode>('table')
  const [qualityAddOpen, setQualityAddOpen] = useState(false)
  const [loomEdit, setLoomEdit] = useState(false)
  const [loomAddOpen, setLoomAddOpen] = useState(false)
  const [beamEdit, setBeamEdit] = useState(false)
  const [beamAddOpen, setBeamAddOpen] = useState(false)
  const [entryEdit, setEntryEdit] = useState(false)
  const [fabricFaultEdit, setFabricFaultEdit] = useState(false)
  const [yarnEdit, setYarnEdit] = useState(false)
  const [yarnAddOpen, setYarnAddOpen] = useState(false)
  const [sheetTextSize, setSheetTextSize] = useState<SheetTextSize>('normal')
  const [isSheetExportOpen, setIsSheetExportOpen] = useState(false)

  // Accountant: Production Sheet only (view)
  useEffect(() => {
    if (isAccountant && currentTab !== 'sheet') {
      router.replace('/floor/production')
    }
  }, [isAccountant, currentTab, router])

  const {
    looms,
    beams,
    yarn,
    qualities,
    entries,
    selectedDate,
    setSelectedDate,
    selectedMonth,
    setSelectedMonth,
    updateLoom,
    addQualitySegment,
    removeQualitySegment,
    addLoom,
    deleteLoom,
    updateBeam,
    addBeam,
    deleteBeam,
    mountBeam,
    unmountBeam,
    receiveBeamFromSizing,
    sendBeamToSizing,
    updateYarn,
    addYarn,
    deleteYarn,
    addYarnInward,
    issueYarnToLoom,
    yarnIssuances,
    yarnMovements,
    updateQuality,
    addQuality,
    deleteQuality,
    reassignEndedQuality,
    startNewDay,
    updateEntry,
    resetDayMeters,
    todaySheetReady,
    submitForApproval,
    approveSheet,
    unlockSheet,
  } = useProductionGrid()

  const getFormattedDateLabel = (dateStr: string) => {
    try {
      return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  // Publish selected floor date into the main website header (before the clock).
  useEffect(() => {
    setDateLabel(getFormattedDateLabel(selectedDate))
    return () => setDateLabel(null)
  }, [selectedDate, setDateLabel])

  useEffect(() => {
    if (qualityStatusFilter !== 'ACTIVE') {
      setQualityEdit(false)
      setQualityAddOpen(false)
    }
  }, [qualityStatusFilter])

  useEffect(() => {
    setQualityEdit(false)
    setQualityAddOpen(false)
    setLoomEdit(false)
    setLoomAddOpen(false)
    setBeamEdit(false)
    setBeamAddOpen(false)
    setEntryEdit(false)
    setFabricFaultEdit(false)
    setYarnEdit(false)
    setYarnAddOpen(false)
  }, [currentTab])

  const tabTitle: Record<string, string> = {
    entry: 'Daily Entry',
    'fabric-fault': 'Fabric Fault',
    sheet: 'Production Sheet',
    looms: 'Looms',
    beams: 'Beams',
    yarn: 'Yarn Stock',
    quality: 'Quality',
  }

  const showDateBar =
    currentTab === 'sheet' ||
    currentTab === 'entry' ||
    currentTab === 'fabric-fault' ||
    currentTab === 'quality' ||
    currentTab === 'looms'
  const isYarnTab = currentTab === 'yarn'
  const isBeamsTab = currentTab === 'beams'
  const isQualityTab = currentTab === 'quality'
  const beamCounts = useMemo(() => beamStockCounts(beams), [beams])
  const qualityCounts = useMemo(
    () => qualityStatusCounts(qualities, selectedDate),
    [qualities, selectedDate]
  )

  return (
    <div className="sara-production-workspace">
      <div className="sara-production-chrome print:hidden">
        <PrintBrandHeader sheetTitle={tabTitle[currentTab] || 'Production'} />
        <div className="sara-page-header sara-prod-toolbar-row">
          <div className="d-flex flex-wrap align-items-center gap-2 justify-content-between w-100">
            <div className="d-flex flex-wrap align-items-center gap-2">
              {isQualityTab && (
                <QualityStatusFilterBar
                  filter={qualityStatusFilter}
                  onChange={setQualityStatusFilter}
                  counts={qualityCounts}
                />
              )}
              {isBeamsTab && (
                <BeamStockFilterBar
                  filter={beamFilter}
                  onChange={setBeamFilter}
                  counts={beamCounts}
                />
              )}
              {isYarnTab && (
                <>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    style={{ width: 145 }}
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value)
                      if (yarnDateMode === 'ALL') setYarnDateMode('DAILY')
                    }}
                    aria-label="Yarn date"
                  />
                  <div className="btn-group btn-group-sm" role="group" aria-label="Yarn period">
                    {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`btn ${yarnDateMode === mode ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setYarnDateMode(mode)}
                      >
                        {mode === 'ALL'
                          ? 'All'
                          : mode === 'DAILY'
                            ? 'Daily'
                            : mode === 'WEEKLY'
                              ? 'Weekly'
                              : 'Monthly'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2 ms-auto">
              {isQualityTab && canEditProduction && qualityStatusFilter === 'ACTIVE' && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${qualityEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    title={qualityEdit ? 'Lock table (view only)' : 'Enable editing'}
                    onClick={() => setQualityEdit(!qualityEdit)}
                  >
                    <i className={`bi ${qualityEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {qualityEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setQualityAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Quality
                  </button>
                </>
              )}

              {currentTab === 'looms' && canEditProduction && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${loomEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setLoomEdit(!loomEdit)}
                  >
                    <i className={`bi ${loomEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {loomEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setLoomAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Loom
                  </button>
                </>
              )}

              {isBeamsTab && canEditProduction && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${beamEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setBeamEdit(!beamEdit)}
                  >
                    <i className={`bi ${beamEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {beamEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setBeamAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Beam
                  </button>
                </>
              )}

              {currentTab === 'entry' && canEditProduction && (
                <button
                  type="button"
                  className={`btn btn-sm ${entryEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => setEntryEdit(!entryEdit)}
                >
                  <i className={`bi ${entryEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                  {entryEdit ? 'Done' : 'Edit'}
                </button>
              )}

              {currentTab === 'fabric-fault' && canEditProduction && (
                <button
                  type="button"
                  className={`btn btn-sm ${fabricFaultEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => setFabricFaultEdit(!fabricFaultEdit)}
                >
                  <i className={`bi ${fabricFaultEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                  {fabricFaultEdit ? 'Done' : 'Edit'}
                </button>
              )}

              {isYarnTab && canEditProduction && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${yarnEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setYarnEdit(!yarnEdit)}
                  >
                    <i className={`bi ${yarnEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {yarnEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setYarnAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Inward Yarn
                  </button>
                </>
              )}

              {currentTab === 'sheet' ? (
                <>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Sheet font size">
                    <button
                      type="button"
                      className={`btn ${sheetTextSize === 'normal' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSheetTextSize('normal')}
                      title="Normal font size"
                    >
                      A
                    </button>
                    <button
                      type="button"
                      className={`btn ${sheetTextSize === 'large' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSheetTextSize('large')}
                      title="Large font size (+20% Bara)"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      className={`btn ${sheetTextSize === 'xlarge' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSheetTextSize('xlarge')}
                      title="Extra Large font size (+40% Sab Se Bara)"
                    >
                      A++
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1.5"
                    onClick={() => setIsSheetExportOpen(true)}
                    title="Save PDF, Print, Share via WhatsApp or Email"
                  >
                    <i className="bi bi-file-earmark-pdf" />
                    <span>PDF</span>
                  </button>
                </>
              ) : (
                <ExportPdfButton
                  filename={`Production-${tabTitle[currentTab] || 'Production-Sheet'}-${selectedDate || selectedMonth || 'export'}`}
                  sheetLabel={tabTitle[currentTab] || 'Production Sheet'}
                />
              )}
            </div>
          </div>
        </div>

        {showDateBar && (
          <ProductionDateFilterBar
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            onOpenNewDayModal={() => setIsNewDayModalOpen(true)}
            canEdit={canEditProduction}
            showStartNewDay={currentTab !== 'quality' && !todaySheetReady}
          />
        )}

        {isAccountant && (
          <div className="alert alert-warning py-2 mb-0" role="alert">
            <strong>View-Only (Accountant):</strong> Masters &amp; Daily Entry are restricted.
            Production Sheet is auto-calculated from masters + floor entry.
          </div>
        )}
      </div>

      <div className="sara-production-panel">
        {currentTab === 'entry' && (
          <FloorEntryTable
            entries={entries}
            onUpdateEntry={updateEntry}
            onResetDayMeters={resetDayMeters}
            onRemoveQualitySegment={removeQualitySegment}
            canEdit={canEditProduction}
            selectedDate={selectedDate}
            onSubmitForApproval={submitForApproval}
            onApproveSheet={approveSheet}
            onUnlockSheet={unlockSheet}
            toolbarInChrome
            tableEdit={entryEdit}
            onTableEditChange={setEntryEdit}
          />
        )}

        {currentTab === 'fabric-fault' && (
          <FabricFaultTable
            entries={entries}
            selectedDate={selectedDate}
            onUpdateEntry={updateEntry}
            canEdit={canEditProduction && fabricFaultEdit}
          />
        )}

        {currentTab === 'sheet' && (
          <ProductionSheetTable
            entries={entries}
            sheetDate={selectedDate}
            textSize={sheetTextSize}
            onChangeTextSize={setSheetTextSize}
            isExportOpen={isSheetExportOpen}
            onExportOpenChange={setIsSheetExportOpen}
          />
        )}

        {currentTab === 'looms' && (
          <LoomMasterTable
            looms={looms}
            yarn={yarn}
            qualities={qualities}
            entries={entries}
            sheetDate={selectedDate}
            onUpdate={updateLoom}
            onAddQualitySegment={addQualitySegment}
            onRemoveQualitySegment={removeQualitySegment}
            onAdd={addLoom}
            onDelete={deleteLoom}
            readOnly={!canEditProduction}
            toolbarInChrome
            tableEdit={loomEdit}
            onTableEditChange={setLoomEdit}
            addModalOpen={loomAddOpen}
            onAddModalOpenChange={setLoomAddOpen}
          />
        )}

        {currentTab === 'beams' && (
          <BeamMasterTable
            beams={beams}
            looms={looms}
            qualities={qualities}
            selectedDate={selectedDate}
            onUpdate={updateBeam}
            onAdd={addBeam}
            onMount={mountBeam}
            onUnmount={unmountBeam}
            onReceiveFromSizing={receiveBeamFromSizing}
            onSendToSizing={sendBeamToSizing}
            onDelete={deleteBeam}
            readOnly={!canEditProduction}
            filter={beamFilter}
            onFilterChange={setBeamFilter}
            toolbarInChrome
            tableEdit={beamEdit}
            onTableEditChange={setBeamEdit}
            addModalOpen={beamAddOpen}
            onAddModalOpenChange={setBeamAddOpen}
          />
        )}

        {currentTab === 'yarn' && (
          <YarnStockTable
            yarn={yarn}
            looms={looms}
            qualities={qualities}
            onUpdate={updateYarn}
            onAdd={(yarnData, arrival) => {
              if (arrival) {
                addYarnInward({
                  yarnType: yarnData.yarnType || 'New Yarn',
                  bags: arrival.bags,
                  weightKg: arrival.weightKg,
                  dateStr: arrival.date,
                  lotOrSupplier: arrival.lotOrSupplier,
                })
              } else {
                addYarn(yarnData)
              }
            }}
            onIssue={issueYarnToLoom}
            issuances={yarnIssuances}
            movements={yarnMovements}
            selectedDate={selectedDate}
            dateFilterMode={yarnDateMode}
            setDateFilterMode={setYarnDateMode}
            onDelete={deleteYarn}
            readOnly={!canEditProduction}
            toolbarInChrome
            tableEdit={yarnEdit}
            onTableEditChange={setYarnEdit}
            addModalOpen={yarnAddOpen}
            onAddModalOpenChange={setYarnAddOpen}
          />
        )}

        {currentTab === 'quality' && (
          <QualityMasterTable
            qualities={qualities}
            onUpdate={updateQuality}
            onAdd={addQuality}
            onDelete={deleteQuality}
            onReassignEnded={reassignEndedQuality}
            readOnly={!canEditProduction}
            entries={entries}
            looms={looms}
            beams={beams}
            yarn={yarn}
            statusFilter={qualityStatusFilter}
            onStatusFilterChange={setQualityStatusFilter}
            sheetDate={selectedDate}
            toolbarInChrome
            tableEdit={qualityEdit}
            onTableEditChange={setQualityEdit}
            viewMode={qualityViewMode}
            onViewModeChange={setQualityViewMode}
            addModalOpen={qualityAddOpen}
            onAddModalOpenChange={setQualityAddOpen}
          />
        )}
      </div>

      <NewDayProductionModal
        isOpen={isNewDayModalOpen}
        onClose={() => setIsNewDayModalOpen(false)}
        onStartNewDay={startNewDay}
        currentSelectedDate={selectedDate}
      />
    </div>
  )
}

export default function ProductionGridPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="spinner-border text-primary" role="status" />
        </div>
      }
    >
      <ProductionWorkspaceContent />
    </Suspense>
  )
}
