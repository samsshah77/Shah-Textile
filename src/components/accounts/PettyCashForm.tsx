'use client'

import { useState } from 'react'
import { expenseService } from '@/services/expenseService'
import { PlusCircle, ArrowUpRight, ArrowDownLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PettyCashFormProps {
  onEntryAdded: () => void
}

export function PettyCashForm({ onEntryAdded }: PettyCashFormProps) {
  const [type, setType] = useState<'DEBIT' | 'CREDIT'>('CREDIT') // CREDIT = Cash Out (Expenses), DEBIT = Cash In (Bank)
  const [amount, setAmount] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) return

    expenseService.addPettyCashEntry({
      date: new Date().toISOString().split('T')[0],
      description: description || 'Daily Mill Operation expense',
      debitAmount: type === 'DEBIT' ? numAmount : 0,
      creditAmount: type === 'CREDIT' ? numAmount : 0,
    })

    setAmount('')
    setDescription('')
    setIsSuccess(true)
    setTimeout(() => setIsSuccess(false), 2500)
    onEntryAdded()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold text-foreground sm:text-base shrink-0">
          Record Petty Cash Voucher
        </h3>
        <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto sm:inline-flex sm:rounded-lg sm:bg-muted sm:p-1">
          <button
            type="button"
            onClick={() => setType('CREDIT')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all cursor-pointer sm:py-1.5 sm:rounded-md',
              type === 'CREDIT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-muted text-muted-foreground hover:text-foreground sm:bg-transparent'
            )}
          >
            <ArrowUpRight className="size-3.5 shrink-0" />
            <span className="truncate">Cash Out</span>
          </button>
          <button
            type="button"
            onClick={() => setType('DEBIT')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all cursor-pointer sm:py-1.5 sm:rounded-md',
              type === 'DEBIT'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-muted text-muted-foreground hover:text-foreground sm:bg-transparent'
            )}
          >
            <ArrowDownLeft className="size-3.5 shrink-0" />
            <span className="truncate">Cash In</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
            Amount (PKR) <span className="text-[#0066cc]">*</span>
          </label>
          <input
            type="number"
            required
            min="1"
            placeholder="e.g. 15000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm font-bold text-foreground focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-muted-foreground mb-1.5">
            Description & Purpose <span className="text-[#0066cc]">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 150 Liters HSD Diesel for Generator / Suzuki"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
        {isSuccess && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-600">
            <Check className="size-4" />
            Voucher recorded & balance updated
          </span>
        )}
        <button type="submit" className="erp-btn-primary w-full sm:w-auto justify-center">
          <PlusCircle className="size-3.5" />
          <span>Save Cash Voucher</span>
        </button>
      </div>
    </form>
  )
}
