'use client'

import React, { useState, useMemo } from 'react'
import { ChalanFoiItem } from '@/types/challan'
import { DailyLoomProductionEntry } from '@/types/production'
import { formatNumber, cn } from '@/lib/utils'
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Printer,
  Download,
  Search,
  RefreshCw,
  Layers,
  Package,
  Weight,
  Factory,
} from 'lucide-react'
import Link from 'next/link'

interface ChalanFoiTableProps {
  items: ChalanFoiItem[]
  onUpdateItem: (id: string, patch: Partial<ChalanFoiItem>) => Promise<void>
  onAddItem: (item: Partial<ChalanFoiItem>) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
  onImportFromProduction?: () => Promise<void>
  readOnly?: boolean
}

export function ChalanFoiTable({
  items,
  onUpdateItem,
  onAddItem,
  onDeleteItem,
  onImportFromProduction,
  readOnly = false,
}: ChalanFoiTableProps) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ChalanFoiItem>>({})
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newRow, setNewRow] = useState<Partial<ChalanFoiItem>>({
    name: 'PARCOPV',
    type: 'Suiting',
    beam: 'G-190',
    swlNo: 'Sw # 335',
    thaan: 1,
    totalMeters: 120,
    totalKg: 30,
  })

  // Calculations
  const calculations = useMemo(() => {
    const totalThaan = items.reduce((s, it) => s + (Number(it.thaan) || 0), 0)
    const totalMeters = items.reduce((s, it) => s + (Number(it.totalMeters) || 0), 0)
    const totalKg = items.reduce((s, it) => s + (Number(it.totalKg) || 0), 0)
    const avgMetersPerThaan = totalThaan > 0 ? totalMeters / totalThaan : 0
    const avgKgPerMeter = totalMeters > 0 ? (totalKg * 1000) / totalMeters : 0

    return {
      totalThaan,
      totalMeters: Number(totalMeters.toFixed(1)),
      totalKg: Number(totalKg.toFixed(1)),
      avgMetersPerThaan: Number(avgMetersPerThaan.toFixed(1)),
      avgGsmApprox: Number(avgKgPerMeter.toFixed(1)),
    }
  }, [items])

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q) ||
        it.beam.toLowerCase().includes(q) ||
        it.swlNo.toLowerCase().includes(q) ||
        it.sNo.toString().includes(q)
    )
  }, [items, search])

  // Edit inline handler
  const startEditing = (it: ChalanFoiItem) => {
    if (readOnly) return
    setEditingId(it.id)
    setEditForm({ ...it })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async (id: string) => {
    await onUpdateItem(id, editForm)
    setEditingId(null)
    setEditForm({})
  }

  // Create new row
  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault()
    await onAddItem(newRow)
    setIsAddingNew(false)
    setNewRow({
      name: 'PARCOPV',
      type: 'Suiting',
      beam: 'G-195',
      swlNo: 'Sw # 338',
      thaan: 1,
      totalMeters: 120,
      totalKg: 30,
    })
  }

  // Export CSV
  const exportCsv = () => {
    const headers = ['S.No', 'Name', 'Type', 'Beam', 'SWL #', 'Thaan', 'Total Meter', 'Total KG']
    const rows = items.map((it) => [
      it.sNo,
      `"${it.name}"`,
      `"${it.type}"`,
      `"${it.beam}"`,
      `"${it.swlNo}"`,
      it.thaan,
      it.totalMeters,
      it.totalKg,
    ])
    rows.push(['TOTAL', '', '', '', '', calculations.totalThaan, calculations.totalMeters, calculations.totalKg])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encoded = encodeURI(csvContent)
    const link = document.createElement('a')
    link.href = encoded
    link.download = 'Sara_Textile_Chalan_FOI_Dispatch.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-5">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-2xl border border-border shadow-xs">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-foreground mb-0">
              Chalan FOI Register
            </h2>
            <span className="erp-count-chip bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[#0066cc] dark:text-blue-300 uppercase tracking-wide">
              #001414
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 mb-0">
            Out-gate dispatch: rolls, meters &amp; KG
          </p>
        </div>

        {/* Action Controls — same btn-sm scale as Yarn / Quality */}
        <div className="flex flex-wrap items-center gap-2">
          {onImportFromProduction && !readOnly && (
            <button
              type="button"
              onClick={onImportFromProduction}
              title="Sync today's active loom production directly into Challan"
              className="erp-btn-secondary"
            >
              <RefreshCw className="size-3.5 text-[#0066cc]" />
              <span>Sync Floor Looms</span>
            </button>
          )}

          {!readOnly && (
            <button type="button" onClick={() => setIsAddingNew(true)} className="erp-btn-primary">
              <Plus className="size-3.5" />
              <span>Add Chalan Item</span>
            </button>
          )}

          <button type="button" onClick={exportCsv} className="erp-btn-secondary">
            <Download className="size-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <Link href="/floor/challan/print/001414" className="erp-btn-dark">
            <Printer className="size-3.5" />
            <span>Print Challan (A4)</span>
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards (Total Thaan, Total Meter, Total KG) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Thaan (Pieces)</span>
            <Package className="size-4 text-purple-600" />
          </div>
          <div className="font-mono text-2xl font-black text-foreground">
            {formatNumber(calculations.totalThaan, 0)}{' '}
            <span className="text-xs font-medium text-muted-foreground">Thaan</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Dispatched Fabric Rolls</span>
        </div>

        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-1">
          <div className="flex items-center justify-between text-[#0066cc] dark:text-sky-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Meter</span>
            <Layers className="size-4 text-[#0066cc]" />
          </div>
          <div className="font-mono text-2xl font-black text-[#0066cc] dark:text-sky-400">
            {formatNumber(calculations.totalMeters, 1)}{' '}
            <span className="text-xs font-medium text-[#0066cc]/70 dark:text-sky-400/70">m</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Net Woven Length</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total KG (Gross Weight)</span>
            <Weight className="size-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl font-black text-foreground">
            {formatNumber(calculations.totalKg, 1)}{' '}
            <span className="text-xs font-medium text-muted-foreground">kg</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Actual Net Dispatched</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] uppercase font-bold tracking-wider">Avg Meter / Thaan</span>
            <Factory className="size-4 text-blue-600" />
          </div>
          <div className="font-mono text-2xl font-black text-blue-700 dark:text-blue-300">
            {formatNumber(calculations.avgMetersPerThaan, 1)}{' '}
            <span className="text-xs font-medium text-muted-foreground">m/roll</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Roll Length Average</span>
        </div>
      </div>

      {/* Add New Row Form Modal/Card */}
      {isAddingNew && (
        <form
          onSubmit={handleAddNew}
          className="rounded-2xl border-2 border-blue-500/40 bg-blue-50/20 dark:bg-blue-950/20 p-4 space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0066cc] dark:text-blue-300">
              Add New Chalan FOI Dispatched Roll
            </h3>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">Name (Quality)</label>
              <input
                type="text"
                required
                value={newRow.name}
                onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-semibold text-foreground focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">Type (Fabric)</label>
              <input
                type="text"
                required
                value={newRow.type}
                onChange={(e) => setNewRow({ ...newRow, type: e.target.value })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-semibold text-foreground focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">Beam #</label>
              <input
                type="text"
                required
                value={newRow.beam}
                onChange={(e) => setNewRow({ ...newRow, beam: e.target.value })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-mono font-semibold text-foreground focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">SWL #</label>
              <input
                type="text"
                required
                value={newRow.swlNo}
                onChange={(e) => setNewRow({ ...newRow, swlNo: e.target.value })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-mono font-semibold text-foreground focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">Thaan (Rolls)</label>
              <input
                type="number"
                min="1"
                required
                value={newRow.thaan}
                onChange={(e) => setNewRow({ ...newRow, thaan: Number(e.target.value) })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-mono text-right font-bold text-foreground focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">Total Meter</label>
              <input
                type="number"
                step="0.1"
                required
                value={newRow.totalMeters}
                onChange={(e) => setNewRow({ ...newRow, totalMeters: Number(e.target.value) })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-mono text-right font-bold text-[#0066cc] focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-muted-foreground mb-1">Total KG</label>
              <input
                type="number"
                step="0.1"
                required
                value={newRow.totalKg}
                onChange={(e) => setNewRow({ ...newRow, totalKg: Number(e.target.value) })}
                className="w-full h-8 rounded-lg border border-border bg-background px-2 font-mono text-right font-bold text-emerald-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-8 rounded-lg bg-[#0066cc] px-4 text-xs font-bold text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Save Dispatched Item
            </button>
          </div>
        </form>
      )}

      {/* Main Chalan FOI Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        {/* Search Bar */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by Name, Beam #, Type, or SWL #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Showing <span className="font-bold text-foreground">{filteredItems.length}</span> / {items.length} items
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left border-collapse font-sans text-xs">
            {/* Table Header: S.No, Name, Type, Beam, SWL #, Thaan, Total Meter, Total KG */}
            <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs shadow-xs">
              <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-3 text-center w-14">S.No</th>
                <th className="py-3 px-3.5 min-w-[140px]">Name</th>
                <th className="py-3 px-3 min-w-[130px]">Type</th>
                <th className="py-3 px-3 min-w-[100px] text-center font-mono">Beam</th>
                <th className="py-3 px-3 min-w-[130px] font-mono">SWL #</th>
                <th className="py-3 px-3 text-right font-mono min-w-[80px]">Thaan</th>
                <th className="py-3 px-3.5 text-right font-mono min-w-[110px]">Total Meter</th>
                <th className="py-3 px-3.5 text-right font-mono min-w-[100px]">Total KG</th>
                {!readOnly && <th className="py-3 px-3 text-center w-20">Actions</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-border/50 font-medium">
              {filteredItems.map((it) => {
                const isEditing = editingId === it.id

                if (isEditing) {
                  return (
                    <tr key={it.id} className="bg-blue-50/40 dark:bg-blue-950/30">
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-muted-foreground">
                        {it.sNo}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-semibold text-foreground focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.type || ''}
                          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-semibold text-foreground focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.beam || ''}
                          onChange={(e) => setEditForm({ ...editForm, beam: e.target.value })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-mono text-center font-semibold text-foreground focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={editForm.swlNo || ''}
                          onChange={(e) => setEditForm({ ...editForm, swlNo: e.target.value })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-mono font-semibold text-foreground focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min="1"
                          value={editForm.thaan || 1}
                          onChange={(e) => setEditForm({ ...editForm, thaan: Number(e.target.value) })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-mono text-right font-bold text-foreground focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.totalMeters || 0}
                          onChange={(e) => setEditForm({ ...editForm, totalMeters: Number(e.target.value) })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-mono text-right font-bold text-[#0066cc] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.totalKg || 0}
                          onChange={(e) => setEditForm({ ...editForm, totalKg: Number(e.target.value) })}
                          className="w-full h-8 rounded border border-blue-400 bg-background px-2 text-xs font-mono text-right font-bold text-emerald-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveEdit(it.id)}
                            title="Save Row"
                            className="size-7 rounded bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors cursor-pointer"
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            title="Cancel"
                            className="size-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                          >
                            <X className="size-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={it.id} className="hover:bg-muted/40 transition-colors group">
                    {/* S.No */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-muted-foreground">
                      {it.sNo}
                    </td>

                    {/* Name */}
                    <td className="py-2.5 px-3.5 font-bold text-foreground">
                      {it.name}
                    </td>

                    {/* Type */}
                    <td className="py-2.5 px-3 text-muted-foreground">
                      <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80">
                        {it.type}
                      </span>
                    </td>

                    {/* Beam */}
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-700 dark:text-blue-400">
                      {it.beam}
                    </td>

                    {/* SWL # */}
                    <td className="py-2.5 px-3 font-mono font-semibold text-foreground/90">
                      {it.swlNo}
                    </td>

                    {/* Thaan */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                      {it.thaan === 0 ? <span className="text-muted-foreground/40">—</span> : it.thaan}
                    </td>

                    {/* Total Meter */}
                    <td className="py-2.5 px-3.5 text-right font-mono font-black text-[#0066cc] dark:text-sky-400">
                      {it.totalMeters === 0 ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        `${formatNumber(it.totalMeters, 1)} m`
                      )}
                    </td>

                    {/* Total KG */}
                    <td className="py-2.5 px-3.5 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                      {it.totalKg === 0 ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        `${formatNumber(it.totalKg, 1)} kg`
                      )}
                    </td>

                    {/* Actions */}
                    {!readOnly && (
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditing(it)}
                            title="Edit Item"
                            className="size-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteItem(it.id)}
                            title="Delete Item"
                            className="size-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-muted-foreground hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>

            {/* Calculations Footer: Total Thaan, Total Meter, Total KG */}
            <tfoot className="sticky bottom-0 z-20 bg-muted/95 backdrop-blur-xs font-black border-t-2 border-border text-foreground shadow-xs">
              <tr className="border-b border-border/40">
                <td colSpan={5} className="py-3.5 px-4 uppercase tracking-wider text-xs font-bold text-foreground">
                  Grand Total Dispatched
                </td>
                {/* Total Thaan */}
                <td className="py-3.5 px-3 text-right font-mono text-sm font-black text-purple-700 dark:text-purple-400">
                  {formatNumber(calculations.totalThaan, 0)} Thaan
                </td>
                {/* Total Meter */}
                <td className="py-3.5 px-3.5 text-right font-mono text-sm font-black text-[#0066cc] dark:text-sky-400 bg-blue-500/10">
                  {formatNumber(calculations.totalMeters, 1)} m
                </td>
                {/* Total KG */}
                <td className="py-3.5 px-3.5 text-right font-mono text-sm font-black text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
                  {formatNumber(calculations.totalKg, 1)} kg
                </td>
                {!readOnly && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
