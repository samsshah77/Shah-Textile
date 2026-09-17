'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { challanService } from '@/services/challanService'
import { DeliveryChallan } from '@/types/challan'
import { formatNumber, cn } from '@/lib/utils'
import {
  Truck,
  Printer,
  Search,
  ArrowLeft,
  Layers,
  Calendar,
  Building,
} from 'lucide-react'

export default function ChallanHistoryRegisterPage() {
  const [challans, setChallans] = useState<DeliveryChallan[]>([])
  const [search, setSearch] = useState('')
  const [filterDest, setFilterDest] = useState<'ALL' | 'DYEING_UNIT' | 'CLIENT'>('ALL')

  useEffect(() => {
    async function load() {
      const list = await challanService.getAllChallans()
      setChallans(list)
    }
    load()
  }, [])

  const filtered = challans.filter((c) => {
    if (filterDest !== 'ALL' && c.destination !== filterDest) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        c.challanNumber.toLowerCase().includes(q) ||
        c.buyerName.toLowerCase().includes(q) ||
        c.date.includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              Delivery Challan Register & History
            </h1>
            <span className="rounded-full bg-blue-50 dark:bg-blue-950/50 px-2.5 py-0.5 text-xs font-semibold text-[#0066cc] dark:text-sky-400 border border-blue-200 dark:border-blue-800/60">
              {challans.length} Dispatches
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Log of all Grey Fabric dispatches, dye unit transfers, and printable certified gate passes.
          </p>
        </div>

        <Link
          href="/floor/challan"
          className="erp-btn-primary"
        >
          <Truck className="size-4" />
          <span>+ Create New Challan</span>
        </Link>
      </div>

      {/* Filter and Table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Challan #, Buyer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-60 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none"
              />
            </div>

            <select
              value={filterDest}
              onChange={(e) => setFilterDest(e.target.value as any)}
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Destinations</option>
              <option value="CLIENT">Direct Client</option>
              <option value="DYEING_UNIT">Dyeing & Bleaching Unit</option>
            </select>
          </div>

          <div className="text-xs font-mono text-slate-500">
            Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{filtered.length}</span> Records
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-3">Challan #</th>
                  <th className="py-3 px-3 font-mono">Date</th>
                  <th className="py-3 px-3">Buyer / Destination</th>
                  <th className="py-3 px-3 font-mono">Beam / Lot</th>
                  <th className="py-3 px-3 text-center">Pieces</th>
                  <th className="py-3 px-3 text-right font-mono">Total Meters</th>
                  <th className="py-3 px-3 text-right font-mono">Total Weight</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((challan) => {
                  const firstItem = challan.items?.[0]
                  const totalMeters = challan.items?.reduce((s, it) => s + (it.totalMeters || 0), 0) || 0
                  const totalWeight = challan.items?.reduce((s, it) => s + (it.totalWeightKg || 0), 0) || 0
                  const piecesCount = challan.items?.reduce((s, it) => s + (it.pieces?.length || 0), 0) || 0

                  return (
                    <tr key={challan.challanNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-white">
                        {challan.challanNumber}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">
                        {challan.date}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{challan.buyerName}</div>
                        <div className="text-[10px] text-slate-400">{challan.destination}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">
                        <div>{firstItem?.beamNumber || '-'}</div>
                        <div className="text-[10px] text-slate-400">{firstItem?.lotNumber || '-'}</div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {piecesCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-[#0066cc] dark:text-sky-400">
                        {formatNumber(totalMeters, 1)} m
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {formatNumber(totalWeight, 1)} kg
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Link
                          href={`/floor/challan/print/${challan.challanNumber}`}
                          className="erp-btn-secondary px-2.5 py-1 text-xs"
                        >
                          <Printer className="size-3 text-[#0066cc]" />
                          <span>Print</span>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
