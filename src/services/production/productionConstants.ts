/** 1 kg = 2.2046 lbs → kg = lbs / 2.2046 */
export const LBS_PER_KG = 2.2046

export const KEY_LOOMS = 'sara_textile_loom_master_v8'
export const KEY_BEAMS = 'sara_textile_beam_master_v9'
export const KEY_YARN = 'sara_textile_yarn_master_v8'
export const KEY_YARN_ISSUANCE = 'sara_textile_yarn_issuance_v8'
export const KEY_QUALITY = 'sara_textile_quality_master_v8'
export const KEY_SHEET = 'sara_textile_production_sheet_v8'
export const KEY_YARN_MOVEMENTS = 'sara_textile_yarn_movements_v8'

/** Browser backup so Quality Ends survive refresh if DB PUT is slow/fails. */
export const KEY_QUALITY_ENDS_LOCAL = 'sara_textile_quality_ends_v1'
/** Browser backup for reused/new Active qualities until DB upsert confirms. */
export const KEY_QUALITY_PENDING_LOCAL = 'sara_textile_quality_pending_v1'
/** Browser backup so Sw# survives refresh if DB patch is slow/fails. */
export const KEY_BEAM_SWLOT_LOCAL = 'sara_textile_beam_swlot_v1'
/** Browser backup for newly added beams until DB upsert confirms. */
export const KEY_BEAM_PENDING_LOCAL = 'sara_textile_beam_pending_v1'

/** Max same-day quality parts per loom (Part 1 + Part 2). */
export const MAX_SAME_DAY_QUALITY_SEGMENTS = 2

/** Sheet remark when quality ended and loom has no new pose yet. */
export const QUALITY_ENDED_REMARK = 'Quality Ended'

/** Same group order as the Production Sheet: G6200, then PU, then G6300, then loom number. */
export const SHEET_MODEL_RANK: Record<string, number> = { G6200: 0, PU: 1, G6300: 2 }

export const DUMMY_LOOM_IMAGES = [
  '/media/modern-loom.jpg',
  '/media/loom-warp.jpg',
  '/media/loom-industrial.jpg',
  '/media/loom-weaving.jpg',
]

/** Max photos stored per loom (base64 in localStorage). */
export const MAX_LOOM_PICTURES = 8
