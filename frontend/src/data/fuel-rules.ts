import type { EntryRow } from './types'

/**
 * 航油加注唯一规则口径（单一事实源）。
 *
 * 机型与油品规格的匹配关系、静电接地检查项清单、各机型加注量合理区间上限、
 * 加油车同一时段占用口径、加注作业状态流转链，全部集中在本文件。
 *
 * 页面（views/fueling、views/fuelledger）、动作层（api/fuel-service）、
 * 统计（fuel-service 的 fuelingStats / ledgerStats）都只能引用这里，
 * 不许在任何一处再各写一遍。
 */

// 加注量计量单位：全链路统一，页面提示与统计都引用它。
export const FUEL_AMOUNT_UNIT = 'L'

export type FuelSpec = {
  code: string
  label: string
}

// 平台在录的油品规格目录，登记作业时的下拉也从这里取。
export const FUEL_SPECS: FuelSpec[] = [
  { code: 'JET-A-1', label: 'JET A-1（3号喷气燃料）' },
  { code: '100LL', label: '100LL（航空汽油）' },
]

export type AircraftFuelRule = {
  /** 机型 */
  aircraft: string
  /** 该机型允许加注的油品规格（规则口径：不在清单内即不匹配） */
  allowedSpecs: string[]
  /** 加注量合理区间上限（含），超过必须提示并写明依据 */
  maxAmount: number
  /** 上限口径说明，提示与留痕都引用这段文字 */
  basis: string
}

// 机型 → 油品规格匹配关系 + 加注量合理区间上限。
export const FUEL_RULES: AircraftFuelRule[] = [
  { aircraft: 'A320', allowedSpecs: ['JET A-1（3号喷气燃料）'], maxAmount: 23800, basis: 'A320 油箱容量约 23,860L，合理区间上限取 23,800L' },
  { aircraft: 'A321', allowedSpecs: ['JET A-1（3号喷气燃料）'], maxAmount: 29800, basis: 'A321 油箱容量约 29,870L，合理区间上限取 29,800L' },
  { aircraft: 'A330-300', allowedSpecs: ['JET A-1（3号喷气燃料）'], maxAmount: 97500, basis: 'A330-300 油箱容量约 97,530L，合理区间上限取 97,500L' },
  { aircraft: 'B737-800', allowedSpecs: ['JET A-1（3号喷气燃料）'], maxAmount: 26000, basis: 'B737-800 油箱容量约 26,020L，合理区间上限取 26,000L' },
  { aircraft: 'B777-300ER', allowedSpecs: ['JET A-1（3号喷气燃料）'], maxAmount: 181200, basis: 'B777-300ER 油箱容量约 181,283L，合理区间上限取 181,200L' },
  { aircraft: 'B787-9', allowedSpecs: ['JET A-1（3号喷气燃料）'], maxAmount: 126400, basis: 'B787-9 油箱容量约 126,428L，合理区间上限取 126,400L' },
  { aircraft: 'C172', allowedSpecs: ['100LL（航空汽油）'], maxAmount: 212, basis: 'C172 为活塞发动机，仅允许航空汽油；油箱容量约 212L，合理区间上限取 212L' },
  { aircraft: 'R44', allowedSpecs: ['100LL（航空汽油）'], maxAmount: 170, basis: 'R44 直升机为活塞发动机，仅允许航空汽油；油箱容量约 170L，合理区间上限取 170L' },
]

export type GroundCheckItem = {
  code: string
  label: string
  standard: string
}

// 静电接地检查项清单：开始加注前逐项核对，必须全部通过才放行。
export const GROUND_CHECK_ITEMS: GroundCheckItem[] = [
  { code: 'G1', label: '加油车静电接地装置可靠接地', standard: '接地带/接地盘卷放到位，与机坪接地极连接牢固，无锈蚀断裂' },
  { code: 'G2', label: '加油车与航空器等电位跨接', standard: '跨接线夹两端连接牢固，导电良好' },
  { code: 'G3', label: '航空器静电接地栓可靠连接', standard: '航空器接地栓与机坪接地极连接到位' },
  { code: 'G4', label: '加油接头等电位连接', standard: '加油接头（加油枪）与航空器加油口等电位线连接良好' },
  { code: 'G5', label: '接地电阻检测合格', standard: '接地连接电阻检测值 ≤ 10Ω，检测读数已记录' },
]

// 加油车占用口径：处于以下状态的作业仍占用加油车，同一辆车在这些时段只允许参与一条作业。
export const TRUCK_BUSY_STATUSES = ['待加注', '加注中', '待确认']

// 加注作业状态链：只能顺着依次流转，不许跳步。
export const FUELING_FLOW = ['待加注', '加注中', '待确认', '已完成'] as const
export const FUELING_ACTIONS = ['开始加注', '提交确认', '确认完成'] as const

const RULES_BY_AIRCRAFT = new Map(FUEL_RULES.map((rule) => [rule.aircraft, rule]))

export function aircraftFuelRule(aircraft: string): AircraftFuelRule | undefined {
  return RULES_BY_AIRCRAFT.get(String(aircraft ?? '').trim())
}

/** 油品规格与机型是否匹配：机型在录且规格在该机型允许清单内才算匹配。 */
export function isSpecMatched(aircraft: string, spec: string): boolean {
  const rule = aircraftFuelRule(aircraft)
  return Boolean(rule && rule.allowedSpecs.includes(String(spec ?? '').trim()))
}

/** 该机型加注量合理区间上限；机型不在规则内返回 undefined。 */
export function amountLimit(aircraft: string): number | undefined {
  return aircraftFuelRule(aircraft)?.maxAmount
}

/** 加注量是否超过该机型区间上限。 */
export function isAmountOverLimit(aircraft: string, amount: number): boolean {
  const limit = amountLimit(aircraft)
  return limit !== undefined && Number.isFinite(amount) && amount > limit
}

/** 超限提示与留痕统一引用的依据文案。 */
export function overLimitBasis(aircraft: string, amount: number): string {
  const rule = aircraftFuelRule(aircraft)
  if (!rule) {
    return `规则库中没有机型「${aircraft}」的加注量区间上限，无法判定`
  }
  return (
    `依据《航油加注放行规则》：${rule.basis}；本次申报加注量 ${amount}${FUEL_AMOUNT_UNIT}，` +
    (amount > rule.maxAmount
      ? `超出上限 ${amount - rule.maxAmount}${FUEL_AMOUNT_UNIT}。`
      : `未超出上限。`)
  )
}

export type GroundCheckResult = {
  code: string
  passed: boolean
}

/** 作业记录里的接地检查明细（JSON 字符串），缺省视为未核对。 */
export function parseGrounding(value: unknown): GroundCheckResult[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return []
  }
  try {
    const parsed = JSON.parse(value) as Array<{ code?: unknown; passed?: unknown }>
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item) => typeof item.code === 'string')
      .map((item) => ({ code: String(item.code), passed: item.passed === true }))
  } catch {
    return []
  }
}

/** 接地检查项是否全部通过（清单口径：有一项未通过或未核对都不算全通过）。 */
export function isGroundingAllPass(results: GroundCheckResult[]): boolean {
  return GROUND_CHECK_ITEMS.every((item) => results.some((r) => r.code === item.code && r.passed))
}

export function groundingPassedCount(results: GroundCheckResult[]): number {
  return GROUND_CHECK_ITEMS.reduce(
    (count, item) => (results.some((r) => r.code === item.code && r.passed) ? count + 1 : count),
    0,
  )
}

/** 同一加油车同一时段冲突检查：返回占用该车的另一条作业，没有返回 null。 */
export function findTruckConflict(
  rows: EntryRow[],
  truck: string,
  excludeId?: number,
): EntryRow | null {
  const plate = String(truck ?? '').trim()
  if (plate === '') {
    return null
  }
  return (
    rows.find(
      (row) =>
        Number(row.id) !== excludeId &&
        String(row['加油车号'] ?? '').trim() === plate &&
        TRUCK_BUSY_STATUSES.includes(String(row.status)),
    ) ?? null
  )
}

/** 状态链：当前状态下唯一允许的动作及目标状态，顺序之外一律返回 null（即不许跳步）。 */
export function flowStep(
  current: string,
): { action: string; target: string } | null {
  const index = FUELING_FLOW.findIndex((status) => status === current)
  if (index < 0 || index >= FUELING_FLOW.length - 1) {
    return null
  }
  return { action: FUELING_ACTIONS[index], target: FUELING_FLOW[index + 1] }
}

export type ReleaseEvaluation = {
  specMatched: boolean
  allowedSpecs: string[]
  groundingResults: GroundCheckResult[]
  groundingAllPass: boolean
  truckConflict: EntryRow | null
}

/** 放行判定口径：页面弹窗与动作层共用这一份判定。 */
export function evaluateRelease(
  row: EntryRow,
  rows: EntryRow[],
  groundingResults?: GroundCheckResult[],
): ReleaseEvaluation {
  const aircraft = String(row['机型'] ?? '')
  const spec = String(row['油品规格'] ?? '')
  const rule = aircraftFuelRule(aircraft)
  const results = groundingResults ?? parseGrounding(row['接地检查明细'])
  return {
    specMatched: isSpecMatched(aircraft, spec),
    allowedSpecs: rule ? rule.allowedSpecs : [],
    groundingResults: results,
    groundingAllPass: isGroundingAllPass(results),
    truckConflict: findTruckConflict(rows, String(row['加油车号'] ?? ''), Number(row.id)),
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 时间戳口径：动作层留痕与页面显示统一格式。 */
export function nowText(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  )
}

export function todayText(): string {
  return nowText().slice(0, 10)
}

export function currentMonthText(): string {
  return nowText().slice(0, 7)
}
