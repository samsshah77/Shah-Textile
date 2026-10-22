'use client'

import type { QualityMasterTableProps } from '@/components/floor/quality/qualityMasterParts'
import { useQualityCore } from './useQualityCore'
import { qualityStatusActions } from './qualityStatusActions'
import { useQualityAddForm } from './useQualityAddForm'

/** State, data and actions of the Quality table (moved out of QualityMasterTable; behaviour unchanged). */
export function useQualityMasterTable(props: QualityMasterTableProps) {
  const core = useQualityCore(props)
  return { ...core, ...qualityStatusActions(core), ...useQualityAddForm(core) }
}

export type QualityMasterTableState = ReturnType<typeof useQualityMasterTable>
