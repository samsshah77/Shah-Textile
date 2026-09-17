// src/types/loom.ts
export type LoomCategory = 'G6200' | 'G6300' | 'PU';
export type LoomStatus = 'RUNNING' | 'STOPPED' | 'KNOTTING' | 'BREAKDOWN' | 'BEAM_END';

export interface LoomConfig {
  id: number;
  loomNumber: number;
  category: LoomCategory;
  defaultRpm: number;
}
