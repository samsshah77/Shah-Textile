'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProductionGrid } from '@/hooks/useProductionGrid'
import { ProductionSheetTable } from '@/components/floor/ProductionSheetTable'
import { FloorEntryTable } from '@/components/floor/FloorEntryTable'
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
import { PageHeader } from '@/components/shared/PageHeader'
import { ExportPdfButton } from '@/components/shared/ExportPdfButton'
import { useAuth } from '@/context/AuthContext'

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
  const [isNewDayModalOpen, setIsNewDayModalOpen] = useState(false)
  const [yarnDateMode, setYarnDateMode] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY')
  const [beamFilter, setBeamFilter] = useState<BeamFilterType>('ALL')
  const [qualityStatusFilter, setQualityStatusFilter] = useState<QualityStatusFilter>('ACTIVE')

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

  const tabTitle: Record<string, string> = {
    entry: 'Daily Entry',
    sheet: 'Production Sheet',
    looms: 'Looms',
    beams: 'Beams',
    yarn: 'Yarn Stock',
    quality: 'Quality',
  }

  const showDateBar =
    currentTab === 'sheet' ||
    currentTab === 'entry' ||
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
    <div className="pb-3">
      <PageHeader
        title={tabTitle[currentTab] || 'Production'}
        showBreadcrumbs={false}
        actions={
          <>
            {showDateBar && (
              <span className="badge text-bg-secondary text-truncate" style={{ maxWidth: 160 }}>
                {getFormattedDateLabel(selectedDate)}
              </span>
            )}

            {isYarnTab && (
              <div className="d-flex flex-wrap align-items-center gap-2 print:hidden">
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
              </div>
            )}

            {isBeamsTab && (
              <BeamStockFilterBar
                filter={beamFilter}
                onChange={setBeamFilter}
                counts={beamCounts}
              />
            )}

            {isQualityTab && (
              <QualityStatusFilterBar
                filter={qualityStatusFilter}
                onChange={setQualityStatusFilter}
                counts={qualityCounts}
              />
            )}

            <ExportPdfButton
              filename={`Production-${tabTitle[currentTab] || 'Production-Sheet'}-${selectedDate || selectedMonth || 'export'}`}
              sheetLabel={tabTitle[currentTab] || 'Production Sheet'}
            />
          </>
        }
      />

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
        <div className="alert alert-warning py-2 print:hidden" role="alert">
          <strong>View-Only (Accountant):</strong> Masters &amp; Daily Entry are restricted.
          Production Sheet is auto-calculated from masters + floor entry.
        </div>
      )}

      {currentTab === 'entry' && (
        <FloorEntryTable
          entries={entries}
          onUpdateEntry={updateEntry}
          onResetDayMeters={resetDayMeters}
          canEdit={canEditProduction}
          selectedDate={selectedDate}
          onSubmitForApproval={submitForApproval}
          onApproveSheet={approveSheet}
          onUnlockSheet={unlockSheet}
        />
      )}

      {currentTab === 'sheet' && (
        <ProductionSheetTable entries={entries} sheetDate={selectedDate} />
      )}

      {currentTab === 'looms' && (
        <LoomMasterTable
          looms={looms}
          yarn={yarn}
          qualities={qualities}
          entries={entries}
          sheetDate={selectedDate}
          onUpdate={updateLoom}
          onAdd={addLoom}
          onDelete={deleteLoom}
          readOnly={!canEditProduction}
        />
      )}

      {currentTab === 'beams' && (
        <BeamMasterTable
          beams={beams}
          looms={looms}
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
        />
      )}

      {currentTab === 'yarn' && (
        <YarnStockTable
          yarn={yarn}
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
          sheetDate={selectedDate}
        />
      )}

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
