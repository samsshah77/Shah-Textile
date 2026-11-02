'use client'

import { useEffect, useCallback } from 'react'
import { normalizeFabricType, qualityNameKey, findLiveQualityByName } from '@/services/productionMastersService'
import { rememberQualityAssignFlash } from '@/lib/qualityAssignFlash'
import { ADD_QUALITY_FIELD_ORDER } from '@/components/floor/quality/AddQualityModal'
import { formatShortDate } from '@/components/floor/quality/qualityMasterParts'
import type { QualityCore } from './useQualityCore'

/** Add Quality form: field order, Enter-to-next, create. */
export function useQualityAddForm(core: QualityCore) {
  const { onAdd, sheetDate, qualities, showSuccessSoon, showError, emptyAddForm, addForm, setAddForm, isAddModalOpen, setIsAddModalOpen, isEndedView, isHoldView, flashRows } = core
  const addFormFieldOrder = ADD_QUALITY_FIELD_ORDER

  const focusAddFormField = useCallback((name: string) => {
    const el = document.querySelector<HTMLElement>(`[data-add-q-field="${name}"]`)
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select?.()
    }
  }, [])

  const handleAddFormKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, field: (typeof addFormFieldOrder)[number]) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsAddModalOpen(false)
        return
      }
      if (e.key !== 'Enter') return
      // Ctrl/Cmd+Enter → save from any field
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const form = e.currentTarget.closest('form')
        form?.requestSubmit()
        return
      }
      e.preventDefault()
      const idx = addFormFieldOrder.indexOf(field)
      if (idx < 0) return
      if (idx < addFormFieldOrder.length - 1) {
        focusAddFormField(addFormFieldOrder[idx + 1])
        return
      }
      // Last field → submit
      const form = e.currentTarget.closest('form')
      form?.requestSubmit()
    },
    [focusAddFormField, setIsAddModalOpen]
  )

  useEffect(() => {
    if (!isAddModalOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAddModalOpen(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [isAddModalOpen, setIsAddModalOpen])

  const handleCreateQuality = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim()) return
    const name = addForm.name.trim()
    const key = qualityNameKey(name)
    const duplicate = findLiveQualityByName(qualities, name) || qualities.find((q) => qualityNameKey(q.name) === key)
    if (duplicate) {
      showError({
        title: 'Quality pehle se maujood hai',
        message:
          (duplicate.status ?? 'ACTIVE') === 'ACTIVE' || (duplicate.status ?? '') === 'HOLD'
            ? `"${duplicate.name}" Active/Hold pe pehle se hai. Same naam do baar nahi. Ends pe ho to wahan se Reuse (zero se) karo.`
            : `"${duplicate.name}" Ends list me pehle se hai. Naya Add mat karo — Ends se Reuse (zero se) karo, ya Continue (same meters).`,
      })
      return
    }
    const newId = onAdd({
      name,
      fabricType: normalizeFabricType(addForm.fabricType),
      weavePlan: addForm.weavePlan.trim(),
      warpYarn: addForm.warpYarn.trim(),
      weftYarn: addForm.weftYarn.trim(),
      reed: Number(addForm.reed) || 0,
      pick: Number(addForm.pick) || 0,
      widthInch: Number(addForm.widthInch) || 0,
      gsm: Number(Number(addForm.gsm).toFixed(2)) || 0,
    })
    setIsAddModalOpen(false)
    setAddForm({ ...emptyAddForm })
    if (newId) {
      rememberQualityAssignFlash(newId)
      flashRows(newId, 'active')
    }
    showSuccessSoon({
      title: 'Quality Added',
      message: `"${name}" add ho gayi — thodi der highlight.`,
    })
  }

  const emptyCopy = isHoldView
    ? {
        icon: 'bi-pause-circle',
        title: 'No qualities on Hold',
        hint: 'Active se Hold karne par yahan dikhengi — baad mein Resume se wapas Active.',
      }
    : isEndedView
      ? {
          icon: 'bi-stop-circle',
          title: `Is mahine ${formatShortDate(sheetDate)} tak koi quality end nahi hui`,
          hint: 'Upar mahina ya date badal kar dekhein. Jab End karoge, Ends list yahan aayegi.',
        }
      : {
          icon: 'bi-stars',
          title: 'No active qualities yet',
          hint: 'Add Quality se naya run banao, phir Looms pe assign karo — list yahan dikhegi.',
        }


  return {
    addFormFieldOrder,
    focusAddFormField,
    handleAddFormKeyDown,
    handleCreateQuality,
    emptyCopy,
  }
}
