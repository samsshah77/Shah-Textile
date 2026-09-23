'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProductionGrid } from '@/hooks/useProductionGrid'
import { ProductionSheetTable } from '@/components/floor/ProductionSheetTable'
import { FloorEntryTable } from '@/components/floor/FloorEntryTable'
import { LoomMasterTable } from '@/components/floor/LoomMasterTable'
import { BeamMasterTable } from '@/components/floor/BeamMasterTable'
import { YarnStockTable } from '@/components/floor/YarnStockTable'
import { QualityMasterTable } from '@/components/floor/QualityMasterTable'
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
    updateBeam,
    addBeam,
    mountBeam,
    unmountBeam,
    receiveBeamFromSizing,
    sendBeamToSizing,
    updateYarn,
    addYarn,
    addYarnInward,
    issueYarnToLoom,
    yarnIssuances,
    yarnMovements,
    updateQuality,
    addQuality,
    startNewDay,
    updateEntry,
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

  const showDateBar = currentTab === 'sheet' || currentTab === 'entry'
  const isYarnTab = currentTab === 'yarn'

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

            <ExportPdfButton
              filename={`Production-${tabTitle[currentTab] || 'Sheet'}-${selectedDate || selectedMonth || 'export'}`}
              sheetLabel={tabTitle[currentTab] || 'Production'}
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
          canEdit={canEditProduction}
        />
      )}

      {currentTab === 'sheet' && <ProductionSheetTable entries={entries} />}

      {currentTab === 'looms' && (
        <LoomMasterTable
          looms={looms}
          qualities={qualities}
          yarn={yarn}
          onUpdate={updateLoom}
          onAdd={addLoom}
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
          readOnly={!canEditProduction}
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
          readOnly={!canEditProduction}
        />
      )}

      {currentTab === 'quality' && (
        <QualityMasterTable
          qualities={qualities}
          onUpdate={updateQuality}
          onAdd={addQuality}
          readOnly={!canEditProduction}
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
