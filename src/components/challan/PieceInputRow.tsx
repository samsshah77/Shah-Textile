'use client'

import { FabricPiece } from '@/types/challan'
import { Trash2 } from 'lucide-react'

interface PieceInputRowProps {
  piece: FabricPiece
  index: number
  onUpdate: (pieceNumber: number, patch: Partial<FabricPiece>) => void
  onRemove: (pieceNumber: number) => void
  disabled?: boolean
}

export function PieceInputRow({ piece, index, onUpdate, onRemove, disabled = false }: PieceInputRowProps) {
  const handleMetersChange = (val: string) => {
    const num = parseFloat(val) || 0
    onUpdate(piece.pieceNumber, { meters: num })
  }

  const handleWeightChange = (val: string) => {
    const wt = parseFloat(val) || 0
    onUpdate(piece.pieceNumber, { weightKg: wt })
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 font-mono text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="py-2.5 px-3 text-center font-semibold text-slate-800 dark:text-slate-200">
        #{piece.pieceNumber.toString().padStart(2, '0')}
      </td>

      <td className="py-2.5 px-2 text-right">
        <div className="relative inline-block w-28">
          <input
            type="number"
            step="0.5"
            min="0"
            disabled={disabled}
            value={piece.meters || ''}
            onChange={(e) => handleMetersChange(e.target.value)}
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-right font-mono text-xs font-semibold text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <span className="absolute right-1.5 top-1 text-[10px] text-slate-400 pointer-events-none">
            m
          </span>
        </div>
      </td>

      <td className="py-2.5 px-2 text-right">
        <div className="relative inline-block w-28">
          <input
            type="number"
            step="0.1"
            min="0"
            disabled={disabled}
            value={piece.weightKg || ''}
            onChange={(e) => handleWeightChange(e.target.value)}
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-right font-mono text-xs font-semibold text-slate-900 dark:text-white focus:border-[#0066cc] focus:ring-1 focus:ring-[#0066cc] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <span className="absolute right-1.5 top-1 text-[10px] text-slate-400 pointer-events-none">
            kg
          </span>
        </div>
      </td>

      <td className="py-2.5 px-2 text-center">
        <button
          type="button"
          onClick={() => onRemove(piece.pieceNumber)}
          disabled={disabled}
          className="rounded p-1 text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title={disabled ? 'Enable Editing to remove' : 'Remove Piece'}
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  )
}
