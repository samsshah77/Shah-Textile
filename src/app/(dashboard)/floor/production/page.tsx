'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useProductionGrid } from '@/hooks/useProductionGrid'
import { productionService } from '@/services/productionService'
import { challanService } from '@/services/challanService'
import { ChalanFoiItem } from '@/types/challan'
import { ProductionTable } from '@/components/floor/ProductionTable'
import { MonthlyMatrixTable } from '@/components/floor/MonthlyMatrixTable'
import { BeamStockTable } from '@/components/floor/BeamStockTable'
import { WeftStockTable } from '@/components/floor/WeftStockTable'
import { ActiveQualitiesTable } from '@/components/floor/ActiveQualitiesTable'
import { QualityEndTable } from '@/components/floor/QualityEndTable'
import { ChalanFoiTable } from '@/components/challan/ChalanFoiTable'
import { ProductionDateFilterBar } from '@/components/floor/ProductionDateFilterBar'
import { NewDayProductionModal } from '@/components/floor/NewDayProductionModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuth } from '@/context/AuthContext'

function ProductionWorkspaceContent() {
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'daily'
  const { isAccountant, canEditProduction } = useAuth()
  const [isNewDayModalOpen, setIsNewDayModalOpen] = useState(false)
  const [foiItems, setFoiItems] = useState<ChalanFoiItem[]>([])

  useEffect(() => {
    challanService.getAllChalanFoiItems().then(setFoiItems)
  }, [])

  const {
    entries,
    filteredEntries,
    beamStock,
    activeQualities,
    monthlyMatrix,
    weftStock,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    selectedDate,
    setSelectedDate,
    selectedMonth,
    setSelectedMonth,
    startNewDay,
    updateEntry,
    mountBeam,
    unmountBeam,
    resetDefaults,
    exportToCsv,
    modifiedLoomIds,
  } = useProductionGrid()

  const qualityEndRecords = productionService.getQualityEndRecords()

  const getFormattedDateLabel = (dateStr: string) => {
    try {
      const d = new Date(`${dateStr}T12:00:00Z`)
      return d.toLocaleDateString('en-US', {
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
    daily: 'Daily Production',
    matrix: 'Loom Monthly Matrix',
    qualities: 'Active Qualities',
    'beam-stock': 'Beam Stock',
    'weft-stock': 'Weft Record',
    challan: 'Challan FOI',
    'quality-end': 'Quality End',
  }

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
              Delivery Challan
            </Link>
            <span className="badge text-bg-secondary">{getFormattedDateLabel(selectedDate)}</span>
          </>
        }
      />

      <ProductionDateFilterBar
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        onOpenNewDayModal={() => setIsNewDayModalOpen(true)}
        canEdit={canEditProduction}
      />

      {isAccountant && (
        <div className="alert alert-warning py-2" role="alert">
          <strong>View-Only (Accountant):</strong> Production editing is restricted to Floor
          Incharge &amp; Admin.
        </div>
      )}

      {currentTab === 'daily' && (
        <div className="card mb-3">
          <div className="card-body p-0">
            <ProductionTable
              entries={filteredEntries}
              onUpdateEntry={updateEntry}
              onResetDefaults={resetDefaults}
              onExportCsv={exportToCsv}
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              modifiedLoomIds={modifiedLoomIds}
              readOnly={!canEditProduction}
              availableQualities={Array.from(new Set(activeQualities.map((q) => q.qualityName)))}
            />
          </div>
        </div>
      )}

      {currentTab === 'matrix' && (
        <MonthlyMatrixTable
          days={monthlyMatrix.days}
          loomTotals={monthlyMatrix.loomTotals}
          grandTotalMeters={monthlyMatrix.grandTotalMeters}
          avgPerDay={monthlyMatrix.avgPerDay}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
        />
      )}

      {currentTab === 'qualities' && <ActiveQualitiesTable qualities={activeQualities} />}

      {currentTab === 'beam-stock' && (
        <BeamStockTable
          beams={beamStock}
          looms={entries}
          onMountBeam={mountBeam}
          onUnmountBeam={unmountBeam}
          readOnly={!canEditProduction}
        />
      )}

      {currentTab === 'weft-stock' && (
        <WeftStockTable yarnColumns={weftStock.yarnColumns} days={weftStock.days} />
      )}

      {currentTab === 'challan' && (
        <ChalanFoiTable
          items={foiItems}
          onUpdateItem={async (id, patch) => {
            const updated = await challanService.updateChalanFoiItem(id, patch)
            setFoiItems((prev) => prev.map((it) => (it.id === id ? updated : it)))
          }}
          onAddItem={async (newItem) => {
            const created = await challanService.addChalanFoiItem(newItem)
            setFoiItems((prev) => [...prev, created])
          }}
          onDeleteItem={async (id) => {
            await challanService.removeChalanFoiItem(id)
            setFoiItems((prev) =>
              prev.filter((it) => it.id !== id).map((it, idx) => ({ ...it, sNo: idx + 1 }))
            )
          }}
          onImportFromProduction={async () => {
            const imported = await challanService.importFromDailyProduction(entries)
            setFoiItems(imported)
          }}
          readOnly={!canEditProduction}
        />
      )}

      {currentTab === 'quality-end' && <QualityEndTable records={qualityEndRecords} />}

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
