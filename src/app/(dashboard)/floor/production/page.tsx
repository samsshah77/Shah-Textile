'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useProductionGrid } from '@/hooks/useProductionGrid'
import { productionService } from '@/services/productionService'
import { ProductionTable } from '@/components/floor/ProductionTable'
import { ProductionCharts } from '@/components/floor/ProductionCharts'
import { MonthlyMatrixTable } from '@/components/floor/MonthlyMatrixTable'
import { BeamStockTable } from '@/components/floor/BeamStockTable'
import { WeftStockTable } from '@/components/floor/WeftStockTable'
import { ActiveQualitiesTable } from '@/components/floor/ActiveQualitiesTable'
import { QualityEndTable } from '@/components/floor/QualityEndTable'
import { MetricCard } from '@/components/shared/MetricCard'
import { useAuth } from '@/context/AuthContext'
import {
  Activity,
  Gauge,
  Layers,
  DollarSign,
  Calculator,
  Calendar,
  Truck,
  Receipt,
  Award,
  Package,
  Clock,
  Factory,
  CheckCircle2,
  Eye,
} from 'lucide-react'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'

function ProductionWorkspaceContent() {
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'daily'
  const { isAccountant, canEditProduction } = useAuth()

  const {
    entries,
    filteredEntries,
    summary,
    loading,
    filterCategory,
    setFilterCategory,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    selectedDate,
    setSelectedDate,
    updateEntry,
    resetDefaults,
    exportToCsv,
    modifiedLoomIds,
  } = useProductionGrid()

  // Get data for other sheets from productionService
  const monthlyMatrix = productionService.getMonthlyMatrix()
  const activeQualities = productionService.getActiveQualities()
  const beamStock = productionService.getBeamStock()
  const weftStock = productionService.getWeftStock()
  const qualityEndRecords = productionService.getQualityEndRecords()

  return (
    <div className="space-y-6 pb-12">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              Production Workspace
            </h1>
            <span className="erp-badge-blue">
              34 Rapier & PU Looms
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real mill floor operations: Daily shifts, efficiency, 34-loom monthly matrix, beam stock, and weft yarn logs.
          </p>
        </div>

        {/* Date Selector & Challan Quick Link */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/floor/challan"
            className="erp-btn-secondary"
          >
            <Truck className="size-3.5 text-[#0066cc]" />
            <span>Delivery Challan #001414</span>
          </Link>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs">
            <Clock className="size-3.5 text-slate-400" />
            <span>Wednesday, 09-Sept-2026</span>
          </div>
        </div>
      </div>

      {/* Accountant View-Only Notice Banner */}
      {isAccountant && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200 font-medium animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Eye className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>View-Only Mode (Accountant Access):</strong> You can review loom production, matrices, and floor stock, but production editing and data entry controls are restricted to the Floor Incharge & Admin.
            </span>
          </div>
          <span className="rounded-md bg-amber-200/60 dark:bg-amber-900/60 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 whitespace-nowrap">
            Read Only
          </span>
        </div>
      )}


      {/* TAB CONTENT: DAILY PRODUCTION */}
      {currentTab === 'daily' && (
        <div className="space-y-6">
          {/* Executive KPI Cards from Sheet Production */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Daily Floor Production"
              value={`${formatNumber(summary?.grandTotalMeters || 4004, 0)} m`}
              subValue="Shift A (2,190m) + Shift B (1,814m)"
              icon={Layers}
              colorVariant="blue"
              trend={{
                value: '4,004 m',
                isPositive: true,
                label: 'Verified Floor Total',
              }}
            />

            <MetricCard
              title="Weighted Running Efficiency"
              value={`${(summary?.averageEfficiency || 69.8).toFixed(1)}%`}
              subValue="24h Average: 62.6% • Pick Avg: 80.1"
              icon={Gauge}
              colorVariant="blue"
              trend={{
                value: '69.8%',
                isPositive: true,
                label: 'Floor Running Avg',
              }}
            />

            <MetricCard
              title="Active Looms on Floor"
              value={`${summary?.runningLooms || 34} / 34 Looms`}
              subValue="G6200: 20 • PU: 6 • G6300: 8"
              icon={Activity}
              colorVariant="amber"
              trend={{
                value: '100% Manning',
                isPositive: true,
                label: '34 Looms Running',
              }}
            />

            <MetricCard
              title="Monthly Progress Total"
              value={`${formatNumber(summary?.monthlyProduction || 31460, 0)} m`}
              subValue="Avg: 3,932.5 m / Day (Days 2-9)"
              icon={DollarSign}
              colorVariant="purple"
              trend={{
                value: '31,460 m',
                isPositive: true,
                label: '1st Fortnight Met',
              }}
            />
          </div>

          {/* Visual Analytics & Interactive Production Charts */}
          <ProductionCharts />

          {/* Formula Banner */}
          <div className="erp-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 mt-0.5">
                <Calculator className="size-4" />
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Mathematical Production & Stop Loss Calculation Rules
                </div>
                <div className="grid grid-cols-1 gap-2 text-slate-500 dark:text-slate-400 sm:grid-cols-3 pt-1">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">1. Theoretical Meters:</span>
                    <span className="font-mono text-[11px] block text-slate-600 dark:text-slate-400">
                      (RPM × 60 × Hours) / (Pick × 39.3701)
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">2. Efficiency Ratio:</span>
                    <span className="font-mono text-[11px] block text-slate-600 dark:text-slate-400">
                      (Actual Total Meters / Theoretical Meters) × 100
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">3. Weave Stop Loss:</span>
                    <span className="font-mono text-[11px] block text-slate-600 dark:text-slate-400">
                      Theoretical Meters - Actual Produced Meters
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main 34-Loom Production Table */}
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
          />
        </div>
      )}

      {/* TAB CONTENT: MONTHLY MATRIX (SHEET: TOTAL) */}
      {currentTab === 'matrix' && (
        <MonthlyMatrixTable
          days={monthlyMatrix.days}
          loomTotals={monthlyMatrix.loomTotals}
          grandTotalMeters={monthlyMatrix.grandTotalMeters}
          avgPerDay={monthlyMatrix.avgPerDay}
        />
      )}

      {/* TAB CONTENT: ACTIVE QUALITY ORDERS */}
      {currentTab === 'qualities' && <ActiveQualitiesTable qualities={activeQualities} />}

      {/* TAB CONTENT: BEAM STOCK FLOOR */}
      {currentTab === 'beam-stock' && <BeamStockTable beams={beamStock} />}

      {/* TAB CONTENT: DAILY WEFT RECORD */}
      {currentTab === 'weft-stock' && (
        <WeftStockTable
          yarnColumns={weftStock.yarnColumns}
          days={weftStock.days}
        />
      )}

      {/* TAB CONTENT: QUALITY END REPORT */}
      {currentTab === 'quality-end' && <QualityEndTable records={qualityEndRecords} />}
    </div>
  )
}

export default function ProductionGridPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-pulse p-4">
          <div className="h-8 w-64 bg-muted rounded-lg" />
          <div className="grid grid-cols-4 gap-4 h-28 bg-muted/60 rounded-xl" />
          <div className="h-96 bg-muted/40 rounded-xl" />
        </div>
      }
    >
      <ProductionWorkspaceContent />
    </Suspense>
  )
}
