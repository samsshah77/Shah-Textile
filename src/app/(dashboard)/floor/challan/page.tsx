'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useChallanBuilder } from '@/hooks/useChallanBuilder'
import { PieceInputRow } from '@/components/challan/PieceInputRow'
import { challanService } from '@/services/challanService'
import { DeliveryChallan } from '@/types/challan'
import { useAuth } from '@/context/AuthContext'
import { formatNumber, cn } from '@/lib/utils'
import {
  Truck,
  Plus,
  Printer,
  Building,
  Lock,
  ShieldAlert,
} from 'lucide-react'

export default function ChallanBuilderPage() {
  const router = useRouter()
  const { canEditProduction, isAccountant, isEditModeEnabled } = useAuth()

  const {
    formData,
    calculations,
    updateFormField,
    addPiece,
    updatePiece,
    removePiece,
    saveChallan,
    isSubmitting,
  } = useChallanBuilder()

  const [existingChallans, setExistingChallans] = useState<DeliveryChallan[]>([])

  useEffect(() => {
    async function loadHistory() {
      const list = await challanService.getAllChallans()
      setExistingChallans(list)
    }
    loadHistory()
  }, [])

  const handleSaveAndPrint = async () => {
    if (!canEditProduction) return
    try {
      const saved = await saveChallan()
      router.push(`/floor/challan/print/${saved.challanNumber}`)
    } catch (err) {
      console.error('Error saving challan:', err)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              Delivery Challan & Dispatch
            </h1>
            <span className="rounded-full bg-blue-50 dark:bg-blue-950/50 px-2.5 py-0.5 text-xs font-semibold text-[#0066cc] dark:text-sky-400 border border-blue-200 dark:border-blue-800/60">
              Grey Fabric Dispatch
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Log cloth piece lengths, weights, and generate certified A4 Delivery Gate Passes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/floor/challan/history"
            className="erp-btn-secondary"
          >
            <Truck className="size-3.5 text-[#0066cc]" />
            <span>Dispatch History ({existingChallans.length})</span>
          </Link>
        </div>
      </div>

      {/* Safety Mode Notice if Editing is Disabled or User is Accountant */}
      {!canEditProduction && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {isAccountant
              ? 'View-Only Mode: Accountants are restricted from modifying floor delivery challans.'
              : 'Edit Protection Active: Click "Enable Editing" in the top header to add pieces or create new dispatch challans.'}
          </span>
        </div>
      )}

      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="erp-card p-4 space-y-1">
            <span className="text-[11px] uppercase font-semibold text-slate-500">Total Pieces</span>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-white">{calculations.totalRolls}</div>
          </div>

          <div className="erp-card p-4 space-y-1 bg-blue-50/30 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40">
            <span className="text-[11px] uppercase font-semibold text-[#0066cc] dark:text-sky-400">Total Meters</span>
            <div className="font-mono text-xl font-bold text-[#0066cc] dark:text-sky-400">
              {formatNumber(calculations.totalMeters, 1)} m
            </div>
          </div>

          <div className="erp-card p-4 space-y-1">
            <span className="text-[11px] uppercase font-semibold text-slate-500">Total Weight</span>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-white">
              {formatNumber(calculations.totalWeightKg, 1)} kg
            </div>
          </div>

          <div className="erp-card p-4 space-y-1">
            <span className="text-[11px] uppercase font-semibold text-slate-500">Avg Piece Length</span>
            <div className="font-mono text-xl font-bold text-slate-900 dark:text-white">
              {calculations.averagePieceMeters} <span className="text-xs font-normal text-slate-500">m</span>
            </div>
          </div>
        </div>

        {/* Form Meta */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="erp-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Building className="size-4 text-[#0066cc]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Consignee & Dispatch Information</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Buyer / Consignee Name *</label>
                <input
                  type="text"
                  disabled={!canEditProduction}
                  value={formData.buyerName}
                  onChange={(e) => updateFormField('buyerName', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-medium text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Destination Target *</label>
                <select
                  disabled={!canEditProduction}
                  value={formData.destination}
                  onChange={(e) => updateFormField('destination', e.target.value as 'DYEING_UNIT' | 'CLIENT')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="CLIENT">Direct Client / Processing</option>
                  <option value="DYEING_UNIT">Dyeing & Bleaching Unit</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Challan Number</label>
                <input
                  type="text"
                  disabled={!canEditProduction}
                  value={formData.challanNumber}
                  onChange={(e) => updateFormField('challanNumber', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="erp-card p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Truck className="size-4 text-[#0066cc]" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Fabric & Beam Details</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Quality Name</label>
                <input
                  type="text"
                  disabled={!canEditProduction}
                  value={formData.qualityName}
                  onChange={(e) => updateFormField('qualityName', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-medium text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Fabric Type</label>
                <input
                  type="text"
                  disabled={!canEditProduction}
                  value={formData.fabricType}
                  onChange={(e) => updateFormField('fabricType', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-300 mb-1">Beam Number</label>
                <input
                  type="text"
                  disabled={!canEditProduction}
                  value={formData.beamNumber}
                  onChange={(e) => updateFormField('beamNumber', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pieces Table */}
        <div className="erp-card p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Fabric Pieces Roll Measurements</h3>
              <p className="text-xs text-slate-500">Log piece meters and actual gross weight (kg).</p>
            </div>

            <button
              type="button"
              onClick={() => addPiece()}
              disabled={!canEditProduction}
              className="erp-btn-primary"
            >
              <Plus className="size-3.5" />
              <span>Add Piece</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-3 text-center">Piece #</th>
                  <th className="py-2.5 px-2 text-right">Length (Meters)</th>
                  <th className="py-2.5 px-2 text-right">Weight (kg)</th>
                  <th className="py-2.5 px-2 text-center">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {formData.pieces.map((piece, index) => (
                  <PieceInputRow
                    key={piece.pieceNumber}
                    piece={piece}
                    index={index}
                    disabled={!canEditProduction}
                    onUpdate={updatePiece}
                    onRemove={removePiece}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="text-xs text-slate-500 font-mono text-center sm:text-left">
              Total Pieces: <span className="font-semibold text-slate-900 dark:text-white">{formData.pieces.length}</span> • Net Fabric:{' '}
              <span className="font-semibold text-[#0066cc] dark:text-sky-400">{formatNumber(calculations.totalMeters, 1)} m</span>
            </div>

            <button
              type="button"
              onClick={handleSaveAndPrint}
              disabled={isSubmitting || !canEditProduction}
              className="erp-btn-primary py-2.5 px-5"
            >
              <Printer className="size-4" />
              <span>{isSubmitting ? 'Generating...' : 'Save & Print Delivery Challan'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
