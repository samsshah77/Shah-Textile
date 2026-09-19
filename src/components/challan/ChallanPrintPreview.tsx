'use client'

import { DeliveryChallan } from '@/types/challan'
import { formatNumber } from '@/lib/utils'
import { Printer, ArrowLeft, Factory, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

interface ChallanPrintPreviewProps {
  challan: DeliveryChallan
}

export function ChallanPrintPreview({ challan }: ChallanPrintPreviewProps) {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const hasFoiItems = Boolean(challan.foiItems && challan.foiItems.length > 0)
  const foiThaanTotal = challan.foiItems?.reduce((s, it) => s + (it.thaan || 0), 0) || 0
  const foiMetersTotal = challan.foiItems?.reduce((s, it) => s + (it.totalMeters || 0), 0) || 0
  const foiKgTotal = Number((challan.foiItems?.reduce((s, it) => s + (it.totalKg || 0), 0) || 0).toFixed(1))

  const firstItem = challan.items?.[0]
  const totalMetersAll = hasFoiItems ? foiMetersTotal : challan.items?.reduce((s, it) => s + (it.totalMeters || 0), 0) || 0
  const totalWeightAll = hasFoiItems ? foiKgTotal : challan.items?.reduce((s, it) => s + (it.totalWeightKg || 0), 0) || 0
  const totalPiecesCount = hasFoiItems ? foiThaanTotal : challan.items?.reduce((s, it) => s + (it.pieces?.length || 0), 0) || 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 print:hidden">
        <Link
          href="/floor/challan"
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Chalan FOI</span>
        </Link>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Printer className="size-4" />
          <span>Print Delivery Challan (A4)</span>
        </button>
      </div>

      {/* Formal Printable Document Card */}
      <div className="rounded-2xl border border-border bg-white text-black p-8 sm:p-10 shadow-lg print:border-none print:p-0 print:shadow-none font-sans">
        {/* Mill Header */}
        <div className="border-b-2 border-black pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Factory className="size-7 text-blue-800 print:text-black" />
                <h1 className="text-2xl font-black tracking-tight uppercase text-black">
                  SARA TEXTILE (PVT) LIMITED
                </h1>
              </div>
              <p className="text-xs font-medium text-gray-700 mt-1">
                Weaving Division • 34 Looms Rapier & Sulzer Projectile Facility
              </p>
              <p className="text-[11px] text-gray-600">
                Plot 14-B, Small Industrial Estate, Jhang Road, Faisalabad, Pakistan
              </p>
            </div>

            <div className="text-right">
              <div className="inline-block rounded-md border-2 border-black bg-gray-50 px-3 py-1 text-center">
                <span className="block text-[10px] font-bold tracking-wider uppercase text-gray-600">
                  Document Type
                </span>
                <span className="font-mono text-sm font-black tracking-wide text-black">
                  DELIVERY CHALLAN
                </span>
              </div>
              <div className="mt-2 space-y-0.5 text-xs font-mono">
                <div><span className="font-bold">Challan #:</span> {challan.challanNumber}</div>
                <div><span className="font-bold">Date:</span> {challan.date}</div>
                <div><span className="font-bold">Destination:</span> {challan.destination === 'DYEING_UNIT' ? 'Dyeing & Processing Unit' : 'Direct Client'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Consignee & Quality Details */}
        <div className="my-5 grid grid-cols-2 gap-6 rounded-lg border border-gray-300 bg-gray-50/50 p-4 text-xs">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Buyer / Consignee:
            </div>
            <div className="text-sm font-bold text-black">{challan.buyerName}</div>
            <div className="text-gray-700">Destination Type: <span className="font-bold">{challan.destination}</span></div>
            {firstItem && (
              <div className="font-mono text-gray-700 pt-1">
                <div><span className="font-semibold">Beam #:</span> {firstItem.beamNumber}</div>
                <div><span className="font-semibold">Lot #:</span> {firstItem.lotNumber}</div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Fabric Specifications:
            </div>
            {firstItem && (
              <>
                <div><span className="font-semibold">Quality:</span> <span className="font-bold text-black">{firstItem.qualityName}</span></div>
                <div><span className="font-semibold">Fabric Type:</span> {firstItem.fabricType}</div>
                <div><span className="font-semibold">Origin Looms:</span> {firstItem.loomNumbers.join(', ')}</div>
              </>
            )}
          </div>
        </div>

        {/* Dispatched Rolls / Pieces Table */}
        <div className="mt-4">
          {hasFoiItems && challan.foiItems ? (
            <table className="w-full text-left border-collapse border border-black text-xs font-mono">
              <thead>
                <tr className="bg-gray-100 border-b border-black text-[10px] font-bold uppercase">
                  <th className="border-r border-black py-2 px-2 text-center w-12">S.No</th>
                  <th className="border-r border-black py-2 px-3">Name</th>
                  <th className="border-r border-black py-2 px-3">Type</th>
                  <th className="border-r border-black py-2 px-2 text-center">Beam</th>
                  <th className="border-r border-black py-2 px-3">SWL #</th>
                  <th className="border-r border-black py-2 px-2 text-right">Thaan</th>
                  <th className="border-r border-black py-2 px-3 text-right">Total Meter</th>
                  <th className="py-2 px-3 text-right">Total KG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {challan.foiItems.map((it) => (
                  <tr key={it.id} className="text-black">
                    <td className="border-r border-black py-1.5 px-2 text-center font-bold">
                      {it.sNo}
                    </td>
                    <td className="border-r border-black py-1.5 px-3 font-semibold">
                      {it.name}
                    </td>
                    <td className="border-r border-black py-1.5 px-3 text-gray-700">
                      {it.type}
                    </td>
                    <td className="border-r border-black py-1.5 px-2 text-center font-bold">
                      {it.beam}
                    </td>
                    <td className="border-r border-black py-1.5 px-3">
                      {it.swlNo}
                    </td>
                    <td className="border-r border-black py-1.5 px-2 text-right font-bold">
                      {it.thaan === 0 ? '—' : it.thaan}
                    </td>
                    <td className="border-r border-black py-1.5 px-3 text-right font-bold">
                      {it.totalMeters === 0 ? '—' : `${formatNumber(it.totalMeters, 1)} m`}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold">
                      {it.totalKg === 0 ? '—' : `${formatNumber(it.totalKg, 1)} kg`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-gray-100 font-bold text-black text-xs">
                  <td colSpan={5} className="border-r border-black py-2.5 px-3 font-black uppercase text-left">
                    GRAND TOTAL DISPATCHED
                  </td>
                  <td className="border-r border-black py-2.5 px-2 text-right font-black">
                    {foiThaanTotal} Thaan
                  </td>
                  <td className="border-r border-black py-2.5 px-3 text-right font-black text-sm">
                    {formatNumber(foiMetersTotal, 1)} m
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-sm">
                    {formatNumber(foiKgTotal, 1)} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full text-left border-collapse border border-black text-xs font-mono">
              <thead>
                <tr className="bg-gray-100 border-b border-black text-[11px] font-bold uppercase">
                  <th className="border-r border-black py-2 px-3 text-center">Piece / Roll #</th>
                  <th className="border-r border-black py-2 px-4 text-right">Length (Meters)</th>
                  <th className="border-r border-black py-2 px-4 text-right">Weight (kg)</th>
                  <th className="py-2 px-3 text-left">Quality Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {challan.items.flatMap((item) =>
                  item.pieces.map((piece) => (
                    <tr key={piece.pieceNumber} className="text-black">
                      <td className="border-r border-black py-1.5 px-3 text-center font-bold">
                        #{piece.pieceNumber.toString().padStart(2, '0')}
                      </td>
                      <td className="border-r border-black py-1.5 px-4 text-right font-bold">
                        {piece.meters.toFixed(1)} m
                      </td>
                      <td className="border-r border-black py-1.5 px-4 text-right">
                        {piece.weightKg.toFixed(2)} kg
                      </td>
                      <td className="py-1.5 px-3 text-[11px] text-gray-700 font-sans">
                        Fresh Grey Fabric Piece
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-gray-100 font-bold text-black text-xs">
                  <td className="border-r border-black py-2.5 px-3 text-center">
                    TOTAL PIECES: {totalPiecesCount}
                  </td>
                  <td className="border-r border-black py-2.5 px-4 text-right text-sm">
                    {formatNumber(totalMetersAll, 1)} m
                  </td>
                  <td className="border-r border-black py-2.5 px-4 text-right text-sm">
                    {formatNumber(totalWeightAll, 2)} kg
                  </td>
                  <td className="py-2.5 px-3 text-xs">
                    Grey State Dispatch Certified
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Declaration & Signatures */}
        <div className="mt-8 pt-4 border-t border-gray-300">
          <p className="text-[10px] text-gray-500 italic">
            Declaration: Goods dispatched in good order and condition as per agreed fabric construction standards.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-4 text-center text-xs font-mono">
            <div>
              <div className="border-t border-black pt-1.5 font-bold">Folding Master</div>
              <div className="text-[10px] text-gray-600">Munir Ahmed</div>
            </div>
            <div>
              <div className="border-t border-black pt-1.5 font-bold">Mill GM / Incharge</div>
              <div className="text-[10px] text-gray-600">M. Kashif (GM Operations)</div>
            </div>
            <div>
              <div className="border-t border-black pt-1.5 font-bold">Receiver Signature</div>
              <div className="text-[10px] text-gray-600">Party Stamp & Name</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
