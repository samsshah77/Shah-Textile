import { LoomCategory, LoomConfig } from '@/types/loom'
import { DailyLoomProductionEntry } from '@/types/production'

export const INITIAL_34_LOOMS_CONFIG: LoomConfig[] = Array.from({ length: 34 }, (_, index) => {
  const loomNumber = index + 1
  let category: LoomCategory = 'G6200'
  let defaultRpm = 340

  if (loomNumber >= 1 && loomNumber <= 20) {
    category = 'G6200'
    defaultRpm = 340
  } else if (loomNumber >= 21 && loomNumber <= 26) {
    category = 'PU'
    defaultRpm = 330
  } else {
    // 27 to 34
    category = 'G6300'
    defaultRpm = 350
  }

  return {
    id: loomNumber,
    loomNumber,
    category,
    defaultRpm,
  }
})

export function getInitialProductionEntries(): DailyLoomProductionEntry[] {
  return []
}
