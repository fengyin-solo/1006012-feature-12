import { listEntries } from './local-service'
import { listRows, saveRows } from '@/data/local-store'
import {
  FUELING_FLOW,
  FUEL_SPECS,
  GROUND_CHECK_ITEMS,
  aircraftFuelRule,
  currentMonthText,
  evaluateRelease,
  findTruckConflict,
  flowStep,
  groundingPassedCount,
  isAmountOverLimit,
  isSpecMatched,
  nowText,
  overLimitBasis,
  parseGrounding,
  todayText,
  type GroundCheckResult,
} from '@/data/fuel-rules'
import type { EntryRow, FuelActionResult } from '@/data/types'

/**
 * 航油加注动作层。
 * 页面只能通过这里改变加油作业状态：放行判定、超限拦截/留痕、状态链顺序、
 * 加油车冲突、台账落账全部在此执行，判定口径全部引用 data/fuel-rules.ts。
 */

const FUELING_KEY = 'fueling'
const LEDGER_KEY = 'fuelledger'
const SPEC_LABELS = FUEL_SPECS.map((item) => item.label)

export type FuelJobDraft = {
  航班号: string
  机型: string
  油品规格: string
  加油车号: string
  作业人员: string
}

function pad4(value: number): string {
  return String(value).padStart(4, '0')
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function toAmount(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : NaN
}

export function listFuelJobs(filters: Record<string, string> = {}) {
  return listEntries(FUELING_KEY, filters)
}

/** 登记加油作业：机型、油品、加油车冲突先按规则口径校验，不合格连登记都进不了。 */
export function createFuelJob(draft: FuelJobDraft): FuelActionResult {
  const 航班号 = draft.航班号.trim()
  const 机型 = draft.机型.trim()
  const 油品规格 = draft.油品规格.trim()
  const 加油车号 = draft.加油车号.trim()
  const 作业人员 = draft.作业人员.trim()

  if (!航班号 || !机型 || !油品规格 || !加油车号 || !作业人员) {
    return { ok: false, message: '航班号、机型、油品规格、加油车号、作业人员均为必填项' }
  }
  if (!aircraftFuelRule(机型)) {
    return { ok: false, message: `机型「${机型}」不在《航油加注放行规则》机型清单内，无法判定油品匹配与加注量上限，不能登记` }
  }
  if (!SPEC_LABELS.includes(油品规格)) {
    return { ok: false, message: `油品规格「${油品规格}」不在在录油品目录内` }
  }
  if (!isSpecMatched(机型, 油品规格)) {
    const allowed = aircraftFuelRule(机型)?.allowedSpecs.join('、') ?? ''
    return {
      ok: false,
      message: `油品规格与机型不匹配：机型「${机型}」只允许加注 ${allowed}，登记被拦截（依据《航油加注放行规则》机型-油品匹配关系）`,
    }
  }

  const rows = listRows(FUELING_KEY)
  const conflict = findTruckConflict(rows, 加油车号)
  if (conflict) {
    return {
      ok: false,
      message: `加油车「${加油车号}」同一时段已在参与作业 ${conflict['作业编号']}（${conflict['航班号']}，状态：${conflict.status}），同一时段只允许参与一条作业`,
    }
  }

  const id = nextId(rows)
  const row: EntryRow = {
    id,
    status: '待加注',
    pending: true,
    abnormal: false,
    作业编号: `FUEL-${pad4(id)}`,
    航班号,
    机型,
    油品规格,
    加注量: '',
    加油车号,
    作业人员,
    静电接地检查: '未核对',
    接地检查明细: '',
    放行结论: '',
    放行依据: '',
    放行时间: '',
    超限留痕: '',
    完成时间: '',
  }
  saveRows(FUELING_KEY, [...rows, row])
  return { ok: true, message: `加油作业 ${row['作业编号']} 已登记，当前状态「待加注」` }
}

/**
 * 开始加注（放行判定）。
 * 三道硬闸，任何一道不过都不许进入「加注中」：
 * 1) 油品规格与机型匹配；2) 静电接地检查项全部通过；3) 加油车同一时段无冲突。
 */
export function startFueling(id: number, grounding: GroundCheckResult[]): FuelActionResult {
  const rows = listRows(FUELING_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的加油作业` }
  }
  const row = rows[index]
  const step = flowStep(String(row.status))
  if (!step || step.action !== '开始加注') {
    return {
      ok: false,
      message: `作业 ${row['作业编号']} 当前状态为「${row.status}」，放行只允许在「待加注」执行；状态只能按 ${FUELING_FLOW.join('→')} 依次流转，不许跳步`,
    }
  }

  const evaluation = evaluateRelease(row, rows, grounding)
  if (!evaluation.specMatched) {
    const rule = aircraftFuelRule(String(row['机型'] ?? ''))
    return {
      ok: false,
      message: rule
        ? `放行驳回：油品规格「${row['油品规格']}」与机型「${row['机型']}」不匹配，该机型允许：${rule.allowedSpecs.join('、')}（依据《航油加注放行规则》机型-油品匹配关系）`
        : `放行驳回：机型「${row['机型']}」不在规则清单内，无法核对油品匹配`,
    }
  }
  if (!evaluation.groundingAllPass) {
    const failed = GROUND_CHECK_ITEMS.filter(
      (item) => !grounding.some((r) => r.code === item.code && r.passed),
    ).map((item) => item.label)
    return {
      ok: false,
      message: `放行驳回：静电接地检查未全部通过（${groundingPassedCount(grounding)}/${GROUND_CHECK_ITEMS.length} 项），未通过项：${failed.join('；')}。全部通过前不许进入加注中`,
    }
  }
  if (evaluation.truckConflict) {
    const other = evaluation.truckConflict
    return {
      ok: false,
      message: `放行驳回：加油车「${row['加油车号']}」同一时段还在参与作业 ${other['作业编号']}（${other['航班号']}，状态：${other.status}），同一时段只允许参与一条作业`,
    }
  }

  const passed = groundingPassedCount(grounding)
  const updated: EntryRow = {
    ...row,
    status: '加注中',
    pending: true,
    静电接地检查: `${passed}/${GROUND_CHECK_ITEMS.length}项通过`,
    接地检查明细: JSON.stringify(grounding),
    放行结论: `放行通过：油品规格与机型匹配，静电接地${passed}项全部通过，加油车${row['加油车号']}同时段无其他作业`,
    放行依据: `机型${row['机型']}允许${String(row['油品规格'])}；接地清单${GROUND_CHECK_ITEMS.map((item) => item.code).join('-')}全部通过`,
    放行时间: nowText(),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(FUELING_KEY, next)
  return { ok: true, message: `作业 ${updated['作业编号']} 放行通过，进入「加注中」` }
}

/**
 * 提交确认（登记加注量）。
 * 超过该机型合理区间上限：先返回超限提示并写明依据；force=true 为强行提交，
 * 在作业记录上留痕，再进入「待确认」。
 */
export function submitFuelAmount(id: number, rawAmount: unknown, force: boolean): FuelActionResult {
  const rows = listRows(FUELING_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的加油作业` }
  }
  const row = rows[index]
  const step = flowStep(String(row.status))
  if (!step || step.action !== '提交确认') {
    return {
      ok: false,
      message: `作业 ${row['作业编号']} 当前状态为「${row.status}」，登记加注量只允许在「加注中」执行，不许跳步`,
    }
  }

  const amount = toAmount(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: '加注量必须是大于 0 的数字' }
  }
  const aircraft = String(row['机型'] ?? '')
  const over = isAmountOverLimit(aircraft, amount)
  const basis = overLimitBasis(aircraft, amount)

  if (over && !force) {
    const limit = aircraftFuelRule(aircraft)?.maxAmount
    return {
      ok: false,
      overLimit: true,
      basis,
      message: `加注量 ${amount}L 超过机型「${aircraft}」合理区间上限 ${limit}L。${basis}。如确认无误可强行提交，系统将在作业记录与台账上留痕`,
    }
  }

  const trail = over
    ? `【超限强行提交】${nowText()} 作业人员${row['作业人员']}确认强行提交：加注量${amount}L超过机型${aircraft}合理区间上限${aircraftFuelRule(aircraft)?.maxAmount}L，超${amount - (aircraftFuelRule(aircraft)?.maxAmount ?? 0)}L。依据：${basis}`
    : ''
  const updated: EntryRow = {
    ...row,
    status: '待确认',
    pending: true,
    abnormal: over || row.abnormal === true,
    加注量: amount,
    超限留痕: trail,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(FUELING_KEY, next)
  return {
    ok: true,
    overLimit: over,
    basis: over ? basis : undefined,
    message: over
      ? `作业 ${updated['作业编号']} 已强行提交并留痕，进入「待确认」`
      : `作业 ${updated['作业编号']} 加注量已登记，进入「待确认」`,
  }
}

function ledgerText(row: EntryRow): string {
  const amount = toAmount(row['加注量'])
  if (!isAmountOverLimit(String(row['机型'] ?? ''), amount)) {
    return '否'
  }
  const limit = aircraftFuelRule(String(row['机型'] ?? ''))?.maxAmount ?? 0
  return `是（超限${amount - limit}L，已强行提交留痕）`
}

/** 确认完成：状态最后一步，并把结论落到油料需求台账；重复提交只算一次。 */
export function confirmFueling(id: number): FuelActionResult {
  const rows = listRows(FUELING_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的加油作业` }
  }
  const row = rows[index]
  const step = flowStep(String(row.status))
  if (!step || step.action !== '确认完成') {
    if (String(row.status) === '已完成') {
      return { ok: false, message: `作业 ${row['作业编号']} 已完成，重复提交不改变状态、不重复入账` }
    }
    return {
      ok: false,
      message: `作业 ${row['作业编号']} 当前状态为「${row.status}」，确认完成只允许在「待确认」执行，不许跳步`,
    }
  }
  const amount = toAmount(row['加注量'])
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: `作业 ${row['作业编号']} 缺少有效加注量，不能完成` }
  }

  const finishedAt = nowText()
  const updated: EntryRow = { ...row, status: '已完成', pending: false, 完成时间: finishedAt }
  const nextRows = [...rows]
  nextRows[index] = updated
  saveRows(FUELING_KEY, nextRows)

  // 台账用量直接取作业记录字段，调度这条线读到的用量不可能与作业记录两样。
  const ledger = listRows(LEDGER_KEY)
  const existing = ledger.find((item) => String(item['作业编号']) === String(updated['作业编号']))
  if (existing) {
    return { ok: true, message: `作业 ${updated['作业编号']} 已完成；台账 ${existing['台账编号']} 已存在，重复提交不重复入账` }
  }
  const ledgerId = nextId(ledger)
  const entry: EntryRow = {
    id: ledgerId,
    status: '已入账',
    pending: false,
    abnormal: isAmountOverLimit(String(updated['机型'] ?? ''), amount),
    台账编号: `LEDG-${pad4(ledgerId)}`,
    作业编号: updated['作业编号'],
    航班号: updated['航班号'],
    机型: updated['机型'],
    油品规格: updated['油品规格'],
    实际加注量: amount,
    加油车号: updated['加油车号'],
    完成时间: finishedAt,
    超限标记: ledgerText(updated),
    入账状态: '已入账',
  }
  saveRows(LEDGER_KEY, [...ledger, entry])
  return { ok: true, message: `作业 ${updated['作业编号']} 已完成，结论已落入油料需求台账（${entry['台账编号']}，用量 ${amount}L）` }
}

export function listLedger(filters: Record<string, string> = {}) {
  return listEntries(LEDGER_KEY, filters)
}

/** 统计口径：阈值与匹配关系全部引用 fuel-rules，页面不另写一份。 */
export function fuelingStats() {
  const rows = listRows(FUELING_KEY)
  const today = todayText()
  const month = currentMonthText()
  const monthAmount = rows
    .filter((row) => String(row.status) === '已完成' && String(row['完成时间'] ?? '').startsWith(month))
    .reduce((sum, row) => sum + (toAmount(row['加注量']) || 0), 0)
  return [
    { label: '今日加油架次', value: rows.filter((row) => String(row['完成时间'] ?? '').startsWith(today)).length },
    { label: '加注中作业', value: rows.filter((row) => String(row.status) === '加注中').length },
    { label: `本月加注量(L)`, value: monthAmount },
    { label: '超限强提作业', value: rows.filter((row) => String(row['超限留痕'] ?? '').startsWith('【超限强行提交】')).length },
  ]
}

export function ledgerStats() {
  const rows = listRows(LEDGER_KEY)
  return [
    { label: '台账入账条数', value: rows.length },
    { label: '台账累计用量(L)', value: rows.reduce((sum, row) => sum + (toAmount(row['实际加注量']) || 0), 0) },
    { label: '台账超限条数', value: rows.filter((row) => String(row['超限标记'] ?? '').startsWith('是')).length },
  ]
}

/** 供页面回显某作业当前已登记的接地核对结果。 */
export function jobGrounding(row: EntryRow): GroundCheckResult[] {
  return parseGrounding(row['接地检查明细'])
}
