import type { EntryRow } from '@/data/types'

/** 加油作业：在通用 EntryRow 之上扩展的专有字段，全部随记录持久化。 */
export type FuelingJob = EntryRow & {
  作业编号: string
  航班号: string
  机型: string
  油品规格: string
  计划加注量: number
  实际加注量: number | string
  加油车号: string
  作业人员: string
  作业日期: string
  静电接地检查: string
  作业状态: string
  放行核对?: string
  超限留痕?: string
  完成时间?: string
  [field: string]: string | number | boolean | undefined
}

export interface CreateJobInput {
  航班号: string
  机型: string
  油品规格: string
  计划加注量: number
  加油车号: string
  作业人员: string
  作业日期: string
}

export interface GateChecks {
  fuelGradeMatched: boolean
  groundingAllPassed: boolean
  groundingResults: Record<string, boolean>
  truckFree: boolean
  requiredFuelGrades: string[]
}

export interface StartGateResult {
  ok: boolean
  message: string
  checks: GateChecks
}

export interface FuelingStats {
  /** 今日加油架次：仅统计已完成作业。 */
  todayCompleted: number
  /** 加注中作业：停在「加注中」状态的作业数。 */
  fueling: number
  /** 本月实际加注量：仅汇总已完成作业的实际加注量（含强行超限的）。 */
  monthAmount: number
  /** 已完成作业总数（台账口径，与本月/今日统计同源）。 */
  totalCompleted: number
  /** 放行判定不通过而被拦下的作业数（待加注且规格不匹配）。 */
  blocked: number
  /** 强行超限提交的作业数。 */
  forcedOverLimit: number
}

/** 油料需求台账行：完全由已完成加油作业派生，不允许手工增改。 */
export interface FuelLedgerEntry {
  作业编号: string
  航班号: string
  机型: string
  需求油品规格: string
  核定上限: number | string
  实际加注量: number
  加油车号: string
  作业人员: string
  作业日期: string
  完成时间: string
  超限标记: string
  超限依据: string
  规则版本: string
}
