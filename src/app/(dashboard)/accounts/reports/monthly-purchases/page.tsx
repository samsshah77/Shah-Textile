'use client'

import { useState, useEffect, useMemo } from 'react'
import { expenseService } from '@/services/expenseService'
import { InventoryPurchaseEntry, MachineExpenseCategory } from '@/types/expense'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import {
  CalendarDays,
  Layers,
  Cpu,
  Building2,
  Download,
  Filter,
  Search,
  Printer,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

interface GroupedMonthlyBill {
  key: string
  date: string
  billNo: string
  inwardNo: string
  partyName: string
  items: InventoryPurchaseEntry[]
  billTotal: number
}

export default function MonthlyPurchasesReportPage() {
  const [summaries, setSummaries] = useState<
    { month: string; totalAmount: number; totalEntries: number; uniqueParties: number; entries: InventoryPurchaseEntry[] }[]
  >([])
  const [selectedMonth, setSelectedMonth] = useState('2026-08')
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('ALL')

  useEffect(() => {
    const list = expenseService.getMonthlyPurchasesSummary()
    setSummaries(list)
  }, [])

  const currentSummary = summaries.find((s) => s.month === selectedMonth) || summaries[0]

  // Machine Category Breakdown for selected month
  const categoryBreakdown = (currentSummary?.entries || []).reduce(
    (acc, e) => {
      const cat = e.machineCategory || 'All'
      acc[cat] = (acc[cat] || 0) + e.totalPrice
      return acc
    },
    {} as Record<string, number>
  )

  const filteredEntries = (currentSummary?.entries || []).filter((e) => {
    if (filterCategory !== 'ALL' && e.machineCategory !== filterCategory) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return e.partyName.toLowerCase().includes(q) || e.itemDescription.toLowerCase().includes(q) || e.billNo.includes(q)
    }
    return true
  })

  // Group contiguous items belonging to same bill & inward into single merged boxes (rowSpan)
  const groupedEntries = useMemo(() => {
    const groups: GroupedMonthlyBill[] = []
    let currentGroup: GroupedMonthlyBill | null = null

    filteredEntries.forEach((e) => {
      const key = `${e.date}_${e.billNo}_${e.inwardNo}_${e.partyName}`
      if (!currentGroup || currentGroup.key !== key) {
        if (currentGroup) groups.push(currentGroup)
        currentGroup = {
          key,
          date: e.date,
          billNo: e.billNo,
          inwardNo: e.inwardNo,
          partyName: e.partyName,
          items: [e],
          billTotal: e.totalPrice,
        }
      } else {
        currentGroup.items.push(e)
        currentGroup.billTotal += e.totalPrice
      }
    })

    if (currentGroup) groups.push(currentGroup)
    return groups
  }, [filteredEntries])

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="print:hidden">
        <PageHeader
          title="Monthly Spares & Supplier Purchases"
          showTitle={false}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Accounts', href: '/accounts/reports/monthly-purchases' },
            { label: 'Monthly Purchases' },
          ]}
          actions={
            <>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-9 appearance-none rounded-md border border-slate-200 bg-white px-2.5 pr-7 text-xs font-semibold text-slate-800 outline-none focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc]/40"
                  aria-label="Statement month"
                >
                  <option value="2026-08">August-2026</option>
                  <option value="2026-07">July-2026</option>
                  <option value="2026-09">September-2026</option>
                </select>
              </div>
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="erp-btn-primary text-xs !min-h-9 !h-9"
                >
                  <Printer className="size-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </>
          }
        />
      </div>

      {/* Loom Model Category Allocation Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 print:hidden">
        {(['G6200', 'G6300', 'PU', 'Electronic', 'All'] as const).map((cat) => (
          <div key={cat} className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">{cat} Spares</span>
            <div className="font-mono text-base font-bold text-foreground">
              {formatCurrency(categoryBreakdown[cat] || 0)}
            </div>
          </div>
        ))}
      </div>

      {/* Filter and Table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border print:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'G6200', 'G6300', 'PU', 'Electronic', 'All'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  'erp-filter-tab',
                  filterCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {cat === 'ALL' ? 'All Categories' : `${cat} Model`}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search party, item, bill #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-60 rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Printable Report Card with Merged Cells ("Ek hi dabba") */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs print:border-none print:shadow-none">
          {/* Printable Header */}
          <div className="hidden print:block p-6 text-center border-b-2 border-black font-sans">
            <h1 className="text-2xl font-black uppercase">Sara Textile (Pvt) Limited</h1>
            <h2 className="text-base font-bold text-gray-800">Monthly Spares & Supplier Purchases Summary</h2>
            <p className="text-xs text-gray-600 font-mono">Statement for Month: {selectedMonth}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-sans print:bg-gray-200 print:text-black print:border-black">
                  <th className="py-3 px-3 w-24">Date</th>
                  <th className="py-3 px-2.5 w-20">Bill #</th>
                  <th className="py-3 px-2.5 w-20">Inw #</th>
                  <th className="py-3 px-3 w-40">Party / Supplier Name</th>
                  <th className="py-3 px-4 font-sans">Item Description</th>
                  <th className="py-3 px-2 text-center w-16">Model</th>
                  <th className="py-3 px-2 text-center w-14">Qty</th>
                  <th className="py-3 px-3 text-right w-20">Rate</th>
                  <th className="py-3 px-4 text-right w-28">Total (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {groupedEntries.map((group) => {
                  const rowSpan = group.items.length
                  return group.items.map((e, itemIdx) => {
                    const isFirst = itemIdx === 0
                    const isLast = itemIdx === rowSpan - 1

                    return (
                      <tr
                        key={e.id}
                        className={cn(
                          'hover:bg-muted/30 transition-colors text-foreground print:text-black',
                          isLast
                            ? 'border-b-2 border-border/80 print:border-black'
                            : 'border-b border-border/30 print:border-gray-300'
                        )}
                      >
                        {/* Merged Date Box */}
                        {isFirst && (
                          <td
                            rowSpan={rowSpan}
                            className="py-2.5 px-3 text-muted-foreground font-semibold border-r border-border/60 bg-muted/20 align-top print:border-black print:bg-transparent print:text-black"
                          >
                            <div className="sticky top-2">{group.date}</div>
                          </td>
                        )}

                        {/* Merged Bill # Box */}
                        {isFirst && (
                          <td
                            rowSpan={rowSpan}
                            className="py-2.5 px-2.5 font-bold text-foreground border-r border-border/60 bg-muted/20 align-top print:border-black print:bg-transparent print:text-black"
                          >
                            <div className="sticky top-2">{group.billNo}</div>
                          </td>
                        )}

                        {/* Merged Inw # Box */}
                        {isFirst && (
                          <td
                            rowSpan={rowSpan}
                            className="py-2.5 px-2.5 text-muted-foreground border-r border-border/60 bg-muted/20 align-top print:border-black print:bg-transparent print:text-black"
                          >
                            <div className="sticky top-2">{group.inwardNo}</div>
                          </td>
                        )}

                        {/* Merged Party / Supplier Box */}
                        {isFirst && (
                          <td
                            rowSpan={rowSpan}
                            className="py-2.5 px-3 font-semibold text-foreground font-sans border-r border-border/60 bg-muted/10 align-top print:border-black print:bg-transparent print:text-black"
                          >
                            <div className="sticky top-2 font-bold">{group.partyName}</div>
                          </td>
                        )}

                        {/* Item-specific fields */}
                        <td className="py-2.5 px-4 text-foreground font-sans border-r border-border/20 print:border-black print:text-black">
                          {e.itemDescription}
                        </td>
                        <td className="py-2.5 px-2 text-center border-r border-border/20 print:border-black">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground border print:border-black print:bg-transparent">
                            {e.machineCategory}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold border-r border-border/20 print:border-black">
                          {e.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground border-r border-border/20 print:border-black print:text-black">
                          {formatNumber(e.costPerItem, 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-blue-600 print:text-black">
                          {formatCurrency(e.totalPrice)}
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/80 font-mono text-xs font-bold text-foreground print:border-black print:bg-gray-100 print:text-black">
                  <td colSpan={6} className="py-3 px-3 uppercase tracking-wider font-sans border-r print:border-black">
                    Monthly Purchases Grand Total ({filteredEntries.length} items logged across {groupedEntries.length} Bills):
                  </td>
                  <td className="py-3 px-2 text-center border-r print:border-black font-bold">
                    {filteredEntries.reduce((s, e) => s + e.quantity, 0)}
                  </td>
                  <td className="py-3 px-3 text-right border-r print:border-black">-</td>
                  <td className="py-3 px-4 text-right text-sm font-black text-blue-600 print:text-black">
                    {formatCurrency(filteredEntries.reduce((s, e) => s + e.totalPrice, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
