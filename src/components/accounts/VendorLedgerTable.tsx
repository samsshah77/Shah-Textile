'use client'

import { useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { Search, Building2, Phone, MapPin, ArrowUpRight, ArrowDownLeft } from 'lucide-react'

export interface VendorAccount {
  id: string
  code: string
  name: string
  category: string
  contactPerson: string
  phone: string
  city: string
  openingBalance: number
  currentBalance: number
  status: string
}

interface VendorLedgerTableProps {
  vendors: VendorAccount[]
}

const CATEGORY_LABELS: Record<string, string> = {
  YARN_SPINNER: 'Yarn Spinner',
  SIZING_UNIT: 'Sizing & Warping',
  SPARE_PARTS: 'Spare Parts & Stores',
  CHEMICALS_OIL: 'Lubricants & Oil',
  POWER_ELECTRICITY: 'Power & Energy',
  TRANSPORT: 'Transport & Freight',
  HARDWARE: 'Electrical Hardware',
}

export function VendorLedgerTable({ vendors }: VendorLedgerTableProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  const filtered = vendors.filter((v) => {
    if (selectedCategory !== 'ALL' && v.category !== selectedCategory) {
      return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      return v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q) || v.city.toLowerCase().includes(q)
    }
    return true
  })

  const totalPayable = vendors.reduce((sum, v) => sum + (v.currentBalance > 0 ? v.currentBalance : 0), 0)

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Vendor name, code, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-60 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="YARN_SPINNER">Yarn Spinners</option>
            <option value="SIZING_UNIT">Sizing Units</option>
            <option value="SPARE_PARTS">Spare Parts</option>
            <option value="CHEMICALS_OIL">Oil & Lubricants</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground font-medium">Total Mill Payable (Cr):</span>
          <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
            {formatCurrency(totalPayable)}
          </span>
        </div>
      </div>

      {/* Vendors Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-4">Code / Vendor</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Contact Details</th>
                <th className="py-3 px-3 text-right font-mono">Opening Bal (PKR)</th>
                <th className="py-3 px-4 text-right font-mono">Current Balance (PKR)</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-xs">
              {filtered.map((vendor) => {
                const isPayable = vendor.currentBalance > 0
                return (
                  <tr key={vendor.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold font-mono text-xs">
                          {vendor.code.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{vendor.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{vendor.code}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground border border-border">
                        {CATEGORY_LABELS[vendor.category] || vendor.category}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-muted-foreground">
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <span>{vendor.contactPerson}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" />
                          {vendor.phone}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {vendor.city}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-medium text-muted-foreground">
                      {formatCurrency(vendor.openingBalance)}
                    </td>

                    <td className="py-3 px-4 text-right font-mono">
                      <div className="font-bold text-sm text-foreground">
                        {formatCurrency(vendor.currentBalance)}
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-semibold font-sans',
                          isPayable ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600'
                        )}
                      >
                        {isPayable ? (
                          <>
                            <ArrowUpRight className="size-3" />
                            <span>Payable (Cr)</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownLeft className="size-3" />
                            <span>Advance (Dr)</span>
                          </>
                        )}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 border border-blue-500/20">
                        {vendor.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
