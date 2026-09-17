'use client'

import { useState, useMemo, useCallback } from 'react'
import { DeliveryChallan, FabricPiece } from '@/types/challan'
import { challanService } from '@/services/challanService'

export interface ChallanFormState {
  challanNumber: string
  date: string
  buyerName: string
  destination: 'DYEING_UNIT' | 'CLIENT'
  qualityName: string
  fabricType: string
  beamNumber: string
  lotNumber: string
  loomNumbers: number[]
  pieces: FabricPiece[]
}

const DEFAULT_CHALLAN_STATE: ChallanFormState = {
  challanNumber: `ST-DC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
  date: new Date().toISOString().split('T')[0],
  buyerName: 'Al-Karam Textile Mills Ltd.',
  destination: 'CLIENT',
  qualityName: 'Cotton Sheeting 40x40 / 100x80 - 68"',
  fabricType: 'Poplin Grey',
  beamNumber: 'BM-2026-104',
  lotNumber: 'LOT-AK-88',
  loomNumbers: [1, 2, 3, 4],
  pieces: [
    { pieceNumber: 1, meters: 120.5, weightKg: 16.4 },
    { pieceNumber: 2, meters: 118.0, weightKg: 16.1 },
    { pieceNumber: 3, meters: 125.0, weightKg: 17.0 },
    { pieceNumber: 4, meters: 114.5, weightKg: 15.6 },
    { pieceNumber: 5, meters: 122.0, weightKg: 16.6 },
  ],
}

export function useChallanBuilder() {
  const [formData, setFormData] = useState<ChallanFormState>(DEFAULT_CHALLAN_STATE)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const calculations = useMemo(() => {
    const totalRolls = formData.pieces.length
    const totalMeters = formData.pieces.reduce((sum, p) => sum + (Number(p.meters) || 0), 0)
    const totalWeightKg = formData.pieces.reduce((sum, p) => sum + (Number(p.weightKg) || 0), 0)
    const averagePieceMeters = totalRolls > 0 ? totalMeters / totalRolls : 0

    return {
      totalRolls,
      totalMeters: Number(totalMeters.toFixed(2)),
      totalWeightKg: Number(totalWeightKg.toFixed(2)),
      averagePieceMeters: Number(averagePieceMeters.toFixed(1)),
    }
  }, [formData.pieces])

  const updateFormField = useCallback(<K extends keyof ChallanFormState>(field: K, value: ChallanFormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  const addPiece = useCallback((meters: number = 120, weightKg: number = 16.2) => {
    setFormData((prev) => {
      const nextPieceNum = prev.pieces.length + 1
      const newPiece: FabricPiece = {
        pieceNumber: nextPieceNum,
        meters,
        weightKg,
      }
      return {
        ...prev,
        pieces: [...prev.pieces, newPiece],
      }
    })
  }, [])

  const updatePiece = useCallback((pieceNumber: number, patch: Partial<FabricPiece>) => {
    setFormData((prev) => ({
      ...prev,
      pieces: prev.pieces.map((p) => (p.pieceNumber === pieceNumber ? { ...p, ...patch } : p)),
    }))
  }, [])

  const removePiece = useCallback((pieceNumber: number) => {
    setFormData((prev) => ({
      ...prev,
      pieces: prev.pieces
        .filter((p) => p.pieceNumber !== pieceNumber)
        .map((p, idx) => ({ ...p, pieceNumber: idx + 1 })),
    }))
  }, [])

  const saveChallan = useCallback(async (): Promise<DeliveryChallan> => {
    setIsSubmitting(true)
    try {
      const deliveryChallan: DeliveryChallan = {
        challanNumber: formData.challanNumber,
        date: formData.date,
        buyerName: formData.buyerName,
        destination: formData.destination,
        items: [
          {
            loomNumbers: formData.loomNumbers,
            qualityName: formData.qualityName,
            fabricType: formData.fabricType,
            beamNumber: formData.beamNumber,
            lotNumber: formData.lotNumber,
            pieces: formData.pieces,
            totalMeters: calculations.totalMeters,
            totalWeightKg: calculations.totalWeightKg,
          },
        ],
      }
      const result = await challanService.createChallan(deliveryChallan)
      return result
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, calculations])

  return {
    formData,
    calculations,
    updateFormField,
    addPiece,
    updatePiece,
    removePiece,
    saveChallan,
    isSubmitting,
  }
}
