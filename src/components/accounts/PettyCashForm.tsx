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
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-sm font-bold text-foreground">Record Petty Cash Voucher</h3>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setType('CREDIT')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 transition-all cursor-pointer',
              type === 'CREDIT' ? 'bg-rose-600 text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowUpRight className="size-3.5" />
            <span>Cash Out (Credit)</span>
          </button>
          <button
            type="button"
            onClick={() => setType('DEBIT')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 transition-all cursor-pointer',
              type === 'DEBIT' ? 'bg-blue-600 text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowDownLeft className="size-3.5" />
            <span>Cash In (Debit)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Amount (PKR) *
          </label>
          <input
            type="number"
            required
            min="1"
            placeholder="e.g. 15000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm font-bold text-foreground focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-muted-foreground mb-1">
            Description & Purpose *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. 150 Liters HSD Diesel for Generator / Suzuki Beam Transport"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {isSuccess && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-blue-600">
            <Check className="size-4" />
            Voucher Recorded & Balance Updated!
          </span>
        )}
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <PlusCircle className="size-4" />
          <span>Save Cash Voucher</span>
        </button>
      </div>
    </form>
  )
}
