'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProductionGrid } from '@/hooks/useProductionGrid'
import { ProductionSheetTable, type SheetTextSize } from '@/components/floor/ProductionSheetTable'
import { FloorEntryTable } from '@/components/floor/FloorEntryTable'
import { FabricFaultTable } from '@/components/floor/FabricFaultTable'
import { LoomMasterTable } from '@/components/floor/LoomMasterTable'
import {
  BeamMasterTable,
  BeamStockFilterBar,
  beamStockCounts,
  type BeamFilterType,
} from '@/components/floor/BeamMasterTable'
import { YarnStockTable } from '@/components/floor/YarnStockTable'
import {
  QualityMasterTable,
  QualityStatusFilterBar,
  qualityStatusCounts,
  type QualityStatusFilter,
} from '@/components/floor/QualityMasterTable'
import { ProductionWorkspaceSkeleton } from '@/components/floor/ProductionSkeleton'
import { PrintBrandHeader } from '@/components/shared/PrintBrandHeader'
import { BeamEndedHistory } from '@/components/floor/BeamEndedHistory'
import { FabricFaultTabs } from '@/components/floor/FabricFaultTabs'
import { ExportPdfButton, exportSheetPdf } from '@/components/shared/ExportPdfButton'
import { WhatsAppShareButton } from '@/components/shared/WhatsAppShareButton'
import { productionWhatsAppText } from '@/lib/floor/shareText'
import { qualityWhatsAppText, type QualityShareData } from '@/lib/floor/qualityShare'
import { yarnWhatsAppText } from '@/lib/floor/yarnShare'
// jsPDF (~350 KB) loads only when a PDF is actually made.
const loadProductionPdf = () => import('@/lib/floor/generateProductionPdf')
const loadQualityPdf = () => import('@/lib/floor/generateQualityPdf')
const loadYarnPdf = () => import('@/lib/floor/generateYarnPdf')
import { type TableGridMode } from '@/components/shared/ViewModeToggle'
import { useAuth } from '@/context/AuthContext'
import { PRODUCTION_TAB_AREA } from '@/lib/access'
import { useFloorDateLabel } from '@/context/FloorDateContext'
import { DateStepper } from '@/components/floor/DateStepper'
import { FloorMonthLockBar, useFloorMonthLocked } from '@/components/floor/FloorMonthLock'
import { getCalendarToday, getProductionToday, productionMonthBounds, productionMonthOf } from '@/constants/productionCalendar'
import { monthOptions } from '@/services/floorReportsClient'
import { DateNav } from '@/components/shared/DateNav'
import { fetchBeamsAsOf } from '@/lib/floor/beamStints'
import { longDateFromYmd } from '@/lib/longDate'
import type { BeamMaster } from '@/services/production/masterTypes'

function ProductionWorkspaceContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab') || 'sheet'
  const currentTab =
    rawTab === 'daily'
      ? 'entry'
      : rawTab === 'beam-stock'
        ? 'beams'
        : rawTab === 'weft-stock'
          ? 'yarn'
          : rawTab === 'qualities'
            ? 'quality'
            : rawTab

  const { canEditProduction, isAdmin, canView, canEdit, user } = useAuth()
  // Administration → Permissions: each tab is Hide / View / Edit for this person.
  // Quality Ends is its own tab, under the same Quality permission.
  const tabArea = PRODUCTION_TAB_AREA[currentTab === 'quality-ends' ? 'quality' : currentTab]
  const tabEdit = tabArea ? canEdit(tabArea) : canEditProduction
  const tabViewOnly = Boolean(tabArea && canView(tabArea) && !canEdit(tabArea))
  const { setDateLabel, setPicker } = useFloorDateLabel()
  const [yarnDateMode, setYarnDateMode] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY')
  const [beamFilter, setBeamFilter] = useState<BeamFilterType>('IN_STOCK')
  const [qualityStatusFilter, setQualityStatusFilter] = useState<QualityStatusFilter>('ACTIVE')
  // Quality tab = Active / Hold; Quality Ends tab = Ended.
  const qualityFilter: QualityStatusFilter =
    currentTab === 'quality-ends' ? 'ENDED' : qualityStatusFilter === 'ENDED' ? 'ACTIVE' : qualityStatusFilter
  const changeQualityFilter = (f: QualityStatusFilter) => {
    if (f === 'ENDED') {
      if (currentTab !== 'quality-ends') router.push('/floor/production?tab=quality-ends')
      return
    }
    setQualityStatusFilter(f)
    if (currentTab === 'quality-ends') router.push('/floor/production?tab=quality')
  }
  /** Quality table fills this with its Active / Hold rows for the toolbar WhatsApp / PDF. */
  const qualityShareRef = useRef<(() => QualityShareData) | null>(null)
  // Quality Ends has its own month + day (not the header date): ends in that month up to that day.
  const [endsDate, setEndsDate] = useState(() => getCalendarToday())
  const endsMonth = productionMonthOf(endsDate)
  const setEndsMonth = (m: string) => {
    const { to } = productionMonthBounds(m)
    const today = getCalendarToday()
    setEndsDate(to < today ? to : today)
  }
  const endsMonthOptions = useMemo(() => monthOptions(), [])
  const [qualityEdit, setQualityEdit] = useState(false)
  const [qualityViewMode, setQualityViewMode] = useState<TableGridMode>('table')
  const [qualityAddOpen, setQualityAddOpen] = useState(false)
  const [loomEdit, setLoomEdit] = useState(false)
  const [loomAddOpen, setLoomAddOpen] = useState(false)
  const [beamEdit, setBeamEdit] = useState(false)
  const [beamAddOpen, setBeamAddOpen] = useState(false)
  const [entryEdit, setEntryEdit] = useState(false)
  const [entryScanOpen, setEntryScanOpen] = useState(false)
  const [fabricFaultEdit, setFabricFaultEdit] = useState(false)
  const [yarnEdit, setYarnEdit] = useState(false)
  const [yarnAddOpen, setYarnAddOpen] = useState(false)
  const [sheetTextSize, setSheetTextSize] = useState<SheetTextSize>('normal')
  const [isSheetExportOpen, setIsSheetExportOpen] = useState(false)

  // A hidden tab opens the first tab this person may see.
  useEffect(() => {
    if (!user || !tabArea || canView(tabArea)) return
    const first = ['sheet', 'entry', 'fabric-fault', 'looms', 'beams', 'yarn', 'quality'].find((t) =>
      canView(PRODUCTION_TAB_AREA[t])
    )
    if (first) router.replace(first === 'sheet' ? '/floor/production' : `/floor/production?tab=${first}`)
  }, [user, tabArea, canView, router])

  const {
    looms,
    beams,
    yarn,
    qualities,
    entries,
    selectedDate,
    setSelectedDate,
    selectedMonth,
    updateLoom,
    addQualitySegment,
    removeQualitySegment,
    addLoom,
    deleteLoom,
    updateBeam,
    addBeam,
    deleteBeam,
    mountBeam,
    unmountBeam,
    receiveBeamFromSizing,
    sendBeamToSizing,
    restoreBeamToLoom,
    updateYarn,
    addYarn,
    deleteYarn,
    addYarnInward,
    issueYarnToLoom,
    yarnIssuances,
    yarnMovements,
    updateQuality,
    addQuality,
    deleteQuality,
    reassignEndedQuality,
    updateEntry,
    resetDayMeters,
    submitForApproval,
    approveSheet,
    unlockSheet,
    loading,
  } = useProductionGrid()

  // ?date=YYYY-MM-DD (e.g. from the Data Check page or a WhatsApp link) opens that day once.
  const dateParam = searchParams.get('date')

  useEffect(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setSelectedDate(dateParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam])


  // A locked production month is view-only for everyone (the server refuses changes too).
  const monthLocked = useFloorMonthLocked(productionMonthOf(selectedDate))
  const canEditDay = tabEdit && !monthLocked

  const getFormattedDateLabel = (dateStr: string) => {
    try {
      return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  // Publish selected floor date into the main website header (before the clock).
  useEffect(() => {
    setDateLabel(getFormattedDateLabel(selectedDate))
    return () => setDateLabel(null)
  }, [selectedDate, setDateLabel])

  useEffect(() => {
    if (qualityFilter !== 'ACTIVE') {
      setQualityEdit(false)
      setQualityAddOpen(false)
    }
  }, [qualityFilter])

  useEffect(() => {
    setQualityEdit(false)
    setQualityAddOpen(false)
    setLoomEdit(false)
    setLoomAddOpen(false)
    setBeamEdit(false)
    setBeamAddOpen(false)
    setEntryEdit(false)
    setFabricFaultEdit(false)
    setYarnEdit(false)
    setYarnAddOpen(false)
  }, [currentTab])

  const tabTitle: Record<string, string> = {
    entry: 'Daily Entry',
    'fabric-fault': 'Fabric Fault',
    sheet: 'Production Sheet',
    looms: 'Looms',
    beams: 'Beams',
    yarn: 'Yarn Stock',
    quality: 'Active Qualities',
    'quality-ends': 'Quality Ends',
  }

  const showDateBar =
    currentTab === 'sheet' ||
    currentTab === 'entry' ||
    currentTab === 'fabric-fault' ||
    currentTab === 'quality' ||
    currentTab === 'looms'
  const isYarnTab = currentTab === 'yarn'
  const isBeamsTab = currentTab === 'beams'
  // The day picker lives in the top header chip (‹ date › + Today) on these tabs.
  const headerPicksDate = showDateBar || isBeamsTab
  // The header shows today's date / time only; the day is picked on the page (left, DateNav).
  useEffect(() => () => setPicker(null), [setPicker])
  const isQualityTab = currentTab === 'quality' || currentTab === 'quality-ends'
  // Beams tab always shows the beams as they are now and stays editable on any date; a mount /
  // take-off done while a past date is selected is dated that day. (Beam changes are still
  // recorded day-wise on the server — floor_beam_history.)
  // Past day: the beams as they stood that day (beam history) — Beams tab (view) and the
  // Looms table's "beam attach karein" note. Today, or Beams with Edit on: the live beams.
  const isPastDay = selectedDate < getCalendarToday()
  const wantPastBeams = isPastDay && (isBeamsTab || currentTab === 'looms')
  const [pastBeams, setPastBeams] = useState<{ date: string; beams: BeamMaster[] } | null>(null)
  /** Bumped after an older run is changed in the Beams table — read the day again. */
  const [pastBeamsTick, setPastBeamsTick] = useState(0)
  useEffect(() => {
    if (!wantPastBeams) return
    let live = true
    const load = () =>
      fetchBeamsAsOf<BeamMaster>(selectedDate)
        .then((list) => {
          if (live) setPastBeams({ date: selectedDate, beams: list })
        })
        .catch(() => {
          if (live) setPastBeams(null)
        })
    void load()
    // A beam just mounted / taken off is saved to the server a moment later (then its history
    // row is written): read the day again after that, so the view does not keep the old state.
    const again = [setTimeout(() => void load(), 2500), setTimeout(() => void load(), 6000)]
    return () => {
      live = false
      again.forEach(clearTimeout)
    }
  }, [wantPastBeams, selectedDate, beams, beamEdit, pastBeamsTick])
  const dayBeams = wantPastBeams && pastBeams?.date === selectedDate ? pastBeams.beams : null
  const showDayBeams = Boolean(dayBeams) && !beamEdit
  const beamCounts = useMemo(() => beamStockCounts(showDayBeams && dayBeams ? dayBeams : beams), [beams, dayBeams, showDayBeams])
  const qualityCounts = useMemo(
    () => qualityStatusCounts(qualities, selectedDate),
    [qualities, selectedDate]
  )

  return (
    <div className="sara-production-workspace">
      {/* PDF / print header (logo + SARA TEXTILES left, print date-time right). Outside the
          print-hidden toolbar below, so it shows on paper. */}
      <PrintBrandHeader sheetTitle={tabTitle[currentTab] || 'Production'} />
      <div className="sara-production-chrome print:hidden">
        <div className="sara-page-header sara-prod-toolbar-row">
          <div className="d-flex flex-wrap align-items-center gap-2 justify-content-between w-100">
            <div className="d-flex flex-wrap align-items-center gap-2">
              {headerPicksDate && <DateNav value={selectedDate} onChange={setSelectedDate} />}
              {currentTab === 'fabric-fault' && <FabricFaultTabs active="table" />}
              {currentTab === 'quality-ends' && (
                <>
                  <select
                    className="form-select form-select-sm fw-semibold"
                    style={{ width: 'auto', minWidth: 160, height: '2.25rem' }}
                    value={endsMonth}
                    onChange={(e) => setEndsMonth(e.target.value)}
                    aria-label="Month"
                  >
                    {endsMonthOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <DateStepper
                    size="sm"
                    value={endsDate}
                    max={getProductionToday()}
                    ariaLabel="Quality ends date"
                    onChange={(next) => next && setEndsDate(next)}
                  />
                </>
              )}
              {isYarnTab && (
                <>
                  <DateStepper
                    size="sm"
                    value={selectedDate}
                    ariaLabel="Yarn date"
                    onChange={(next) => {
                      setSelectedDate(next)
                      if (yarnDateMode === 'ALL') setYarnDateMode('DAILY')
                    }}
                  />
                  <div className="btn-group btn-group-sm" role="group" aria-label="Yarn period">
                    {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`btn ${yarnDateMode === mode ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setYarnDateMode(mode)}
                      >
                        {mode === 'ALL'
                          ? 'All'
                          : mode === 'DAILY'
                            ? 'Daily'
                            : mode === 'WEEKLY'
                              ? 'Weekly'
                              : 'Monthly'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2 ms-auto">
              {/* Month lock sits in this toolbar row (no extra empty row); the "locked" note shows below. */}
              {showDateBar && !isQualityTab && currentTab !== 'looms' && (
                <FloorMonthLockBar month={productionMonthOf(selectedDate)} isAdmin={isAdmin} variant="button" />
              )}
              {isQualityTab && tabEdit && qualityFilter === 'ACTIVE' && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${qualityEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    title={qualityEdit ? 'Lock table (view only)' : 'Enable editing'}
                    onClick={() => setQualityEdit(!qualityEdit)}
                  >
                    <i className={`bi ${qualityEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {qualityEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setQualityAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Quality
                  </button>
                </>
              )}

              {currentTab === 'looms' && tabEdit && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${loomEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setLoomEdit(!loomEdit)}
                  >
                    <i className={`bi ${loomEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {loomEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setLoomAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Loom
                  </button>
                </>
              )}

              {isBeamsTab && tabEdit && beamFilter !== 'ENDED' && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${beamEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setBeamEdit(!beamEdit)}
                  >
                    <i className={`bi ${beamEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {beamEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setBeamAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Beam
                  </button>
                </>
              )}

              {currentTab === 'entry' && canEditDay && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${entryEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setEntryEdit(!entryEdit)}
                  >
                    <i className={`bi ${entryEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {entryEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1.5 shadow-xs"
                    onClick={() => setEntryScanOpen(true)}
                    title="Auto-fill Weight, Shift A and Shift B per loom from a register photo"
                  >
                    <i className="bi bi-camera-fill" />
                    <span>Entry from photo</span>
                  </button>
                </>
              )}

              {currentTab === 'fabric-fault' && canEditDay && (
                <button
                  type="button"
                  className={`btn btn-sm ${fabricFaultEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                  onClick={() => setFabricFaultEdit(!fabricFaultEdit)}
                >
                  <i className={`bi ${fabricFaultEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                  {fabricFaultEdit ? 'Done' : 'Edit'}
                </button>
              )}

              {isYarnTab && tabEdit && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm ${yarnEdit ? 'btn-warning' : 'btn-outline-secondary'}`}
                    onClick={() => setYarnEdit(!yarnEdit)}
                  >
                    <i className={`bi ${yarnEdit ? 'bi-lock' : 'bi-pencil-square'} me-1`} />
                    {yarnEdit ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => setYarnAddOpen(true)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add Inward Yarn
                  </button>
                </>
              )}

              {currentTab === 'sheet' ? (
                <>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Sheet font size">
                    <button
                      type="button"
                      className={`btn ${sheetTextSize === 'normal' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSheetTextSize('normal')}
                      title="Normal font size"
                    >
                      A
                    </button>
                    <button
                      type="button"
                      className={`btn ${sheetTextSize === 'large' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSheetTextSize('large')}
                      title="Large font size (+20% Bara)"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      className={`btn ${sheetTextSize === 'xlarge' ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSheetTextSize('xlarge')}
                      title="Extra Large font size (+40% Sab Se Bara)"
                    >
                      A++
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1.5"
                    onClick={() => setIsSheetExportOpen(true)}
                    title="PDF save / print"
                  >
                    <i className="bi bi-file-earmark-pdf" />
                    <span>PDF</span>
                  </button>

                  <WhatsAppShareButton
                    documentTitle={`Production Sheet ${selectedDate}`}
                    message={() => productionWhatsAppText(selectedDate, entries)}
                    onDownloadPdf={() => void loadProductionPdf().then((m) => m.downloadProductionPdf(entries, selectedDate))}
                    getPdfAttachment={() => loadProductionPdf().then(async (m) => m.generateProductionPdfBase64(entries, selectedDate, { logoDataUrl: await m.loadPdfLogo() }))}
                  />
                </>
              ) : isQualityTab && qualityFilter !== 'ENDED' ? (
                <>
                  {/* Same as the Production Sheet: a real PDF file, and WhatsApp / Email with it attached. */}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1.5"
                    onClick={() => {
                      const data = qualityShareRef.current?.()
                      if (data) void loadQualityPdf().then((m) => m.downloadQualityPdf(data))
                    }}
                    title="PDF save"
                  >
                    <i className="bi bi-file-earmark-pdf" />
                    <span>PDF</span>
                  </button>
                  <WhatsAppShareButton
                    documentTitle={qualityFilter === 'HOLD' ? 'Hold Qualities' : 'Active Qualities'}
                    message={() => {
                      const data = qualityShareRef.current?.()
                      return data ? qualityWhatsAppText(data) : '*Sara Textile — Qualities*'
                    }}
                    onDownloadPdf={() => {
                      const data = qualityShareRef.current?.()
                      if (data) void loadQualityPdf().then((m) => m.downloadQualityPdf(data))
                    }}
                    getPdfAttachment={() => {
                      const data = qualityShareRef.current?.()
                      return data ? loadQualityPdf().then((m) => m.generateQualityPdfBase64(data)) : null
                    }}
                  />
                </>
              ) : isYarnTab ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1.5"
                    onClick={() => void loadYarnPdf().then((m) => m.downloadYarnPdf(yarn, selectedDate))}
                    title="PDF save"
                  >
                    <i className="bi bi-file-earmark-pdf" />
                    <span>PDF</span>
                  </button>
                  <WhatsAppShareButton
                    documentTitle={`Yarn Stock ${selectedDate}`}
                    message={() => yarnWhatsAppText(selectedDate, yarn)}
                    onDownloadPdf={() => void loadYarnPdf().then((m) => m.downloadYarnPdf(yarn, selectedDate))}
                    getPdfAttachment={() => loadYarnPdf().then((m) => m.generateYarnPdfBase64(yarn, selectedDate))}
                  />
                </>
              ) : currentTab === 'quality-ends' ? (
                <>
                  <ExportPdfButton
                    filename={`Quality-Ends-Report-${endsDate || ''}`}
                    sheetLabel="Quality Ends • Completion Register"
                  />
                  <WhatsAppShareButton
                    documentTitle="Quality Ends"
                    message={`*Sara Textile — Quality Ends*${endsDate ? `\n${endsDate}` : ''}`}
                    onDownloadPdf={() => exportSheetPdf(`Quality-Ends-Report-${endsDate || ''}`, 'Quality Ends • Completion Register')}
                  />
                </>
              ) : (
                <ExportPdfButton
                  filename={`Production-${tabTitle[currentTab] || 'Production-Sheet'}-${selectedDate || selectedMonth || 'export'}`}
                  sheetLabel={tabTitle[currentTab] || 'Production Sheet'}
                />
              )}
            </div>
          </div>

          {isBeamsTab && (
            <div className="d-flex align-items-center justify-content-start mt-2">
              <BeamStockFilterBar
                filter={beamFilter}
                onChange={setBeamFilter}
                counts={beamCounts}
              />
            </div>
          )}

          {currentTab === 'quality' && (
            <div className="d-flex align-items-center justify-content-start mt-2">
              <QualityStatusFilterBar
                showEnded={false}
                filter={qualityFilter}
                onChange={changeQualityFilter}
                counts={qualityCounts}
              />
            </div>
          )}
        </div>

        {showDateBar && !isQualityTab && currentTab !== 'looms' && (
          <FloorMonthLockBar month={productionMonthOf(selectedDate)} isAdmin={isAdmin} variant="note" />
        )}

        {tabViewOnly && (
          <div className="alert alert-warning border-warning-subtle text-dark d-flex align-items-center gap-2 py-2 px-3 mb-0 fw-medium" role="status">
            <i className="bi bi-shield-lock-fill text-warning fs-5 flex-shrink-0" />
            <span>
              <strong>View only</strong> — you cannot make changes in this tab.
            </span>
          </div>
        )}
      </div>

      <div className="sara-production-panel">
        {loading ? (
          <ProductionWorkspaceSkeleton tab={currentTab} />
        ) : (
          <>
            {currentTab === 'entry' && (
              <FloorEntryTable
                entries={entries}
                onUpdateEntry={updateEntry}
                onResetDayMeters={resetDayMeters}
                onRemoveQualitySegment={removeQualitySegment}
                canEdit={canEditDay}
                selectedDate={selectedDate}
                onSubmitForApproval={submitForApproval}
                onApproveSheet={approveSheet}
                onUnlockSheet={unlockSheet}
                toolbarInChrome
                tableEdit={entryEdit}
                onTableEditChange={setEntryEdit}
                scanOpen={entryScanOpen}
                onScanOpenChange={setEntryScanOpen}
              />
            )}

            {currentTab === 'fabric-fault' && (
              <FabricFaultTable
                entries={entries}
                selectedDate={selectedDate}
                onUpdateEntry={updateEntry}
                canEdit={canEditDay && fabricFaultEdit}
              />
            )}

            {currentTab === 'sheet' && (
              <ProductionSheetTable
                entries={entries}
                sheetDate={selectedDate}
                textSize={sheetTextSize}
                onChangeTextSize={setSheetTextSize}
                isExportOpen={isSheetExportOpen}
                onExportOpenChange={setIsSheetExportOpen}
              />
            )}

            {currentTab === 'looms' && (
              <LoomMasterTable
                looms={looms}
                yarn={yarn}
                qualities={qualities}
                entries={entries}
                sheetDate={selectedDate}
                onUpdate={updateLoom}
                beams={beams}
                noteBeams={currentTab === 'looms' ? dayBeams : null}
                onEndBeam={sendBeamToSizing}
                onAddQualitySegment={addQualitySegment}
                onRemoveQualitySegment={removeQualitySegment}
                onAdd={addLoom}
                onDelete={deleteLoom}
                readOnly={!tabEdit}
                toolbarInChrome
                tableEdit={loomEdit}
                onTableEditChange={setLoomEdit}
                addModalOpen={loomAddOpen}
                onAddModalOpenChange={setLoomAddOpen}
              />
            )}

            {currentTab === 'beams' && beamFilter === 'ENDED' && (
              <BeamEndedHistory
                month={productionMonthOf(selectedDate)}
                beams={beams}
                canEdit={tabEdit}
                onRestore={restoreBeamToLoom}
              />
            )}

            {currentTab === 'beams' && beamFilter !== 'ENDED' && isPastDay && beamEdit && (
              <div className="alert alert-warning py-2 mb-2 small d-print-none" role="status">
                <i className="bi bi-pencil-square me-1" />
                Edit shows the <strong>current (live) list</strong>. Beams mounted / removed here are dated{' '}
                {longDateFromYmd(selectedDate)}. A <strong>grey-blue row</strong> is a beam that was in an older run on this day
                (now ended): it shows that run, and changes there change that run only. To correct dates, use the beam’s{' '}
                <strong>History</strong> button.
              </div>
            )}
            {currentTab === 'beams' && beamFilter !== 'ENDED' && showDayBeams && (
              <div className="alert alert-info py-2 mb-2 small d-print-none" role="status">
                <i className="bi bi-clock-history me-1" />
                Beams as they were on <strong>{longDateFromYmd(selectedDate)}</strong> (view only). To mount / remove a beam,
                press Edit — the current list opens and changes are dated this day.
              </div>
            )}
            {currentTab === 'beams' && beamFilter !== 'ENDED' && (
              <BeamMasterTable
                beams={showDayBeams && dayBeams ? dayBeams : beams}
                looms={looms}
                qualities={qualities}
                selectedDate={selectedDate}
                onUpdate={updateBeam}
                onAdd={addBeam}
                onMount={mountBeam}
                onUnmount={unmountBeam}
                onReceiveFromSizing={receiveBeamFromSizing}
                onSendToSizing={sendBeamToSizing}
                entries={entries}
                onDelete={deleteBeam}
                readOnly={!tabEdit || showDayBeams}
                historyEdit={tabEdit}
                dayState={isPastDay && pastBeams?.date === selectedDate ? pastBeams.beams : undefined}
                onDayStateChanged={() => setPastBeamsTick((n) => n + 1)}
                filter={beamFilter}
                onFilterChange={setBeamFilter}
                toolbarInChrome
                tableEdit={beamEdit}
                onTableEditChange={setBeamEdit}
                addModalOpen={beamAddOpen}
                onAddModalOpenChange={setBeamAddOpen}
              />
            )}

            {currentTab === 'yarn' && (
              <YarnStockTable
                yarn={yarn}
                looms={looms}
                qualities={qualities}
                onUpdate={updateYarn}
                onAdd={(yarnData, arrival) => {
                  if (arrival) {
                    addYarnInward({
                      yarnType: yarnData.yarnType || 'New Yarn',
                      bags: arrival.bags,
                      weightKg: arrival.weightKg,
                      dateStr: arrival.date,
                      lotOrSupplier: arrival.lotOrSupplier,
                    })
                  } else {
                    addYarn(yarnData)
                  }
                }}
                onIssue={issueYarnToLoom}
                issuances={yarnIssuances}
                movements={yarnMovements}
                selectedDate={selectedDate}
                dateFilterMode={yarnDateMode}
                setDateFilterMode={setYarnDateMode}
                onDelete={deleteYarn}
                readOnly={!tabEdit}
                toolbarInChrome
                tableEdit={yarnEdit}
                onTableEditChange={setYarnEdit}
                addModalOpen={yarnAddOpen}
                onAddModalOpenChange={setYarnAddOpen}
              />
            )}

            {isQualityTab && (
              <QualityMasterTable
                shareRef={qualityShareRef}
                qualities={qualities}
                onUpdate={updateQuality}
                onAdd={addQuality}
                onDelete={deleteQuality}
                onReassignEnded={reassignEndedQuality}
                readOnly={!tabEdit}
                entries={entries}
                looms={looms}
                beams={beams}
                yarn={yarn}
                statusFilter={qualityFilter}
                onStatusFilterChange={changeQualityFilter}
                sheetDate={currentTab === 'quality-ends' ? endsDate : selectedDate}
                toolbarInChrome
                tableEdit={qualityEdit}
                onTableEditChange={setQualityEdit}
                viewMode={qualityViewMode}
                onViewModeChange={setQualityViewMode}
                addModalOpen={qualityAddOpen}
                onAddModalOpenChange={setQualityAddOpen}
              />
            )}
          </>
        )}
      </div>

    </div>
  )
}

export default function ProductionGridPage() {
  return (
    <Suspense
      fallback={
        <div className="sara-production-workspace p-3">
          <ProductionWorkspaceSkeleton tab="sheet" />
        </div>
      }
    >
      <ProductionWorkspaceContent />
    </Suspense>
  )
}
