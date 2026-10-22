// src/types/loom.ts
export type LoomCategory = 'G6200' | 'G6300' | 'PU'

/** Loom floor conditions — drive Production Sheet row colors. */
export type LoomStatus =
  | 'RUNNING'
  | 'STOPPED'
  | 'BEAM_END' // B/End
  | 'KNOTTING'
  | 'SARNING'
  | 'REKNOT'
  | 'HKNOTTING' // HKntt
  | 'MECH_FAULT'
  | 'ELEC_FAULT'
  | 'JACQUARD_FAULT'
  | 'RSARNING'
  | 'BEAM_CUT' // B/Cut
  | 'RESARNING'
  | 'NO_WEFT' // No Weft (bharti ka dhaga nahi)
  | 'BREAKDOWN' // legacy catch-all

export interface LoomConfig {
  id: number
  loomNumber: number
  category: LoomCategory
  defaultRpm: number
}
