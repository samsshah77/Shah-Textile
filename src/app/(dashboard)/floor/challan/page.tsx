'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { challanService } from '@/services/challanService'
import { productionService } from '@/services/productionService'
import { DeliveryChallan, ChalanFoiItem } from '@/types/challan'
import { ChalanFoiTable } from '@/components/challan/ChalanFoiTable'
import { useAuth } from '@/context/AuthContext'
import {
  Truck,
  Printer,
  Lock,
  CheckCircle2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'

export default function ChallanPage() {
  const { canEditProduction, isAccountant } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isAccountant) router.replace('/floor/production')
  }, [isAccountant, router])

  const [foiItems, setFoiItems] = useState<ChalanFoiItem[]>([])
  const [loadingFoi, setLoadingFoi] = useState(true)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [existingChallans, setExistingChallans] = useState<DeliveryChallan[]>([])

  // Load FOI items and challan history on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [foiList, challans] = await Promise.all([
          challanService.getAllChalanFoiItems(),
          challanService.getAllChallans(),
        ])
        setFoiItems(foiList)
        setExistingChallans(challans)
      } catch (err) {
        console.error('Failed loading challan data:', err)
      } finally {
        setLoadingFoi(false)
      }
    }
    loadData()
  }, [])

  // FOI Table Actions
  const handleUpdateItem = async (id: string, patch: Partial<ChalanFoiItem>) => {
    try {
      const updated = await challanService.updateChalanFoiItem(id, patch)
      setFoiItems((prev) => prev.map((it) => (it.id === id ? updated : it)))
    } catch (err) {
      console.error('Failed to update FOI item:', err)
    }
  }

  const handleAddItem = async (newItem: Partial<ChalanFoiItem>) => {
    try {
      const created = await challanService.addChalanFoiItem(newItem)
      setFoiItems((prev) => [...prev, created])
    } catch (err) {
      console.error('Failed to add FOI item:', err)
    }
  }

  const handleDeleteItem = async (id: string) => {
    try {
      await challanService.removeChalanFoiItem(id)
      setFoiItems((prev) => prev.filter((it) => it.id !== id).map((it, idx) => ({ ...it, sNo: idx + 1 })))
    } catch (err) {
      console.error('Failed to delete FOI item:', err)
    }
  }

  // Cross-system wiring: Import directly from live loom production
  const handleImportFromProduction = async () => {
    try {
      const entries = await productionService.getAllEntries()
      const imported = await challanService.importFromDailyProduction(entries)
      setFoiItems(imported)
      setSyncMessage(`Successfully synchronized ${imported.length} active loom rolls from Floor Production!`)
      setTimeout(() => setSyncMessage(null), 4500)
    } catch (err) {
      console.error('Failed syncing from production:', err)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Chalan FOI Dispatch"
        breadcrumbs={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Production', href: '/floor/production' },
          { label: 'Chalan FOI' },
        ]}
        actions={
          <>
            <Link href="/floor/challan/history" className="erp-btn-secondary text-xs">
              <Truck className="size-3.5 text-[#0066cc]" />
              <span>Dispatch History ({existingChallans.length})</span>
            </Link>
            <Link href="/floor/challan/print/001414" className="erp-btn-primary text-xs">
              <Printer className="size-3.5" />
              <span>Print Challan #001414</span>
            </Link>
          </>
        }
      />

      {/* Sync Success Message Alert */}
      {syncMessage && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold animate-in fade-in duration-200">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Safety Mode Notice if Editing is Disabled or User is Accountant */}
      {!canEditProduction && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {isAccountant
              ? 'View-Only Mode: Accountants are restricted from modifying floor delivery challans.'
              : 'Edit Protection Active: Click "Enable Editing" in the top header to modify Chalan FOI items or add new rolls.'}
          </span>
        </div>
      )}

      {/* CHALAN FOI SHEET VIEW */}
      <ChalanFoiTable
        items={foiItems}
        onUpdateItem={handleUpdateItem}
        onAddItem={handleAddItem}
        onDeleteItem={handleDeleteItem}
        onImportFromProduction={handleImportFromProduction}
        readOnly={!canEditProduction}
      />
    </div>
  )
}
