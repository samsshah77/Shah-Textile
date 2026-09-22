'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
import { useAuth } from '@/context/AuthContext'

function ProductionWorkspaceContent() {
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
    updateYarn,
    addYarn,
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

  const showDateBar =
    currentTab === 'sheet' || currentTab === 'entry' || currentTab === 'beams'

  return (
    <div className="pb-3">
      <PageHeader
        title={tabTitle[currentTab] || 'Production'}
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Production', href: '/floor/production' },
          { label: tabTitle[currentTab] || 'Workspace' },
        ]}
        actions={
          <>
            <Link href="/floor/challan" className="btn btn-sm btn-outline-primary">
              <span className="d-none d-sm-inline">Delivery Challan</span>
              <span className="d-sm-none">Challan</span>
            </Link>
            {showDateBar && (
              <span className="badge text-bg-secondary text-truncate" style={{ maxWidth: 160 }}>
                {getFormattedDateLabel(selectedDate)}
              </span>
            )}
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
        <div className="alert alert-warning py-2" role="alert">
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
          readOnly={!canEditProduction}
        />
      )}

      {currentTab === 'yarn' && (
        <YarnStockTable
          yarn={yarn}
          onUpdate={updateYarn}
          onAdd={addYarn}
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
