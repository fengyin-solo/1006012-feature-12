import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult } from '@/data/types'

import {
  FUELING_RULE,
  aircraftRule,
  gradeName,
  isFuelGradeMatched,
  overLimitBasis,
  requiredFuelGrades,
} from './rules'
import type {
  CreateJobInput,
  FuelLedgerEntry,
  FuelingJob,
  FuelingStats,
  GateChecks,
  StartGateResult,
} from './types'

const MODULE_KEY = 'fueling'

/** 加油作业状态顺序：只能顺着走，不允许跳步（动作层据此判定）。 */
export const FUELING_STATUSES = ['待加注', '加注中', '待确认', '已完成'] as const
export const FUELING_ACTION_TARGETS: Record<string, string> = {
  开始加注: '加注中',
  提交确认: '待确认',
  确认完成: '已完成',
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function todayStr(): string {
  return nowStamp().slice(0, 10)
}

function monthStr(): string {
  return todayStr().slice(0, 7)
}

function parseAmount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function listJobs(filters: Record<string, string> = {}): FuelingJob[] {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

/** 加油车占用判定：同一辆加油车同时段（只要还有没走到「已完成」的作业）不许再接活。 */
function findTruckOccupant(rows: FuelingJob[], truckNo: string, excludeId?: number): FuelingJob | undefined {
  return rows.find(
    (row) =>
      Number(row.id) !== excludeId &&
      String(row.加油车号).trim() === truckNo.trim() &&
      String(row.status) !== '已完成',
  )
}

export function createJob(input: CreateJobInput): ActionResult & { id?: number } {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  const truckNo = input.加油车号.trim()
  if (!input.航班号.trim() || !input.机型.trim() || !input.油品规格.trim()) {
    return { ok: false, message: '航班号、机型、油品规格均为必填项' }
  }
  if (!truckNo || !input.作业人员.trim()) {
    return { ok: false, message: '加油车号、作业人员必须填写' }
  }
  if (!aircraftRule(input.机型.trim())) {
    return {
      ok: false,
      message: `机型「${input.机型}」不在《${FUELING_RULE.title}》收录范围内，无法核对油品规格与加注量上限`,
    }
  }
  if (!Number.isFinite(input.计划加注量) || input.计划加注量 < 0) {
    return { ok: false, message: '计划加注量必须是不小于 0 的数字' }
  }
  const occupant = findTruckOccupant(rows, truckNo)
  if (occupant) {
    return {
      ok: false,
      message: `加油车「${truckNo}」当前正在执行作业 ${occupant.作业编号}（${occupant.航班号}，状态「${occupant.status}」），同一时段不允许再参与另一条作业`,
    }
  }
  if (rows.some((row) => row.航班号.trim() === input.航班号.trim())) {
    return { ok: false, message: `航班「${input.航班号}」已存在加油作业，不允许重复登记` }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const serial = String(id).padStart(4, '0')
  const matched = isFuelGradeMatched(input.机型.trim(), input.油品规格.trim())
  const job: FuelingJob = {
    id,
    status: '待加注',
    pending: true,
    abnormal: false,
    作业编号: `FUEL-${serial}`,
    航班号: input.航班号.trim(),
    机型: input.机型.trim(),
    油品规格: input.油品规格.trim(),
    计划加注量: input.计划加注量,
    实际加注量: '',
    加油车号: truckNo,
    作业人员: input.作业人员.trim(),
    作业日期: input.作业日期 || todayStr(),
    静电接地检查: '未核对',
    作业状态: '待加注',
  }
  saveRows(MODULE_KEY, [...rows, job])
  return {
    ok: true,
    id,
    message: matched
      ? `加油作业 ${job.作业编号} 已登记，油品规格与机型匹配，待放行核对`
      : `加油作业 ${job.作业编号} 已登记，但油品规格与机型不匹配（应为：${requiredFuelGrades(
          job.机型,
        ).join('、')}），放行环节将被拦下`,
  }
}

/** 放行口径：油品规格匹配 + 接地检查项全部通过 + 加油车未被占用，三者缺一不可。 */
export function evaluateGate(job: FuelingJob, rows?: FuelingJob[]): GateChecks {
  const all = rows ?? (listRows(MODULE_KEY) as FuelingJob[])
  const groundingResults: Record<string, boolean> = {}
  for (const item of FUELING_RULE.groundingChecks) {
    groundingResults[item.key] = false
  }
  const model = String(job.机型 ?? '')
  const grade = String(job.油品规格 ?? '')
  return {
    fuelGradeMatched: model ? isFuelGradeMatched(model, grade) : false,
    groundingAllPassed: false,
    groundingResults,
    truckFree: model ? !findTruckOccupant(all, String(job.加油车号 ?? ''), Number(job.id)) : false,
    requiredFuelGrades: model ? requiredFuelGrades(model) : [],
  }
}

/** 开始加注前的放行判定：规格不匹配或接地检查未全部通过，一律不许进入「加注中」。 */
export function startFueling(
  id: number,
  groundingResults: Record<string, boolean>,
  operator: string,
): StartGateResult {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    const empty: GateChecks = {
      fuelGradeMatched: false,
      groundingAllPassed: false,
      groundingResults: Object.fromEntries(
        FUELING_RULE.groundingChecks.map((item) => [item.key, false]),
      ),
      truckFree: false,
      requiredFuelGrades: [],
    }
    return { ok: false, message: `没有找到编号为 ${id} 的加油作业`, checks: empty }
  }
  const job = rows[index]
  if (String(job.status) === '加注中') {
    return { ok: false, message: '作业已在加注中，请勿重复开始', checks: evaluateGate(job, rows) }
  }
  if (String(job.status) !== '待加注') {
    return {
      ok: false,
      message: `状态只能按「待加注 → 加注中 → 待确认 → 已完成」顺序流转，当前为「${job.status}」，不能开始加注`,
      checks: evaluateGate(job, rows),
    }
  }

  const fuelGradeMatched = isFuelGradeMatched(String(job.机型), String(job.油品规格))
  const passed: Record<string, boolean> = {}
  const missing: string[] = []
  for (const item of FUELING_RULE.groundingChecks) {
    const hit = Boolean(groundingResults[item.key])
    passed[item.key] = hit
    if (!hit) {
      missing.push(item.label)
    }
  }
  const groundingAllPassed = missing.length === 0
  const truckFree = !findTruckOccupant(rows, String(job.加油车号), Number(job.id))

  const checks: GateChecks = {
    fuelGradeMatched,
    groundingAllPassed,
    groundingResults: passed,
    truckFree,
    requiredFuelGrades: requiredFuelGrades(String(job.机型)),
  }
  if (!fuelGradeMatched) {
    return {
      ok: false,
      message: `放行不通过：油品规格「${job.油品规格}」与机型「${job.机型}」不匹配，机型适用规格为 ${checks.requiredFuelGrades.join(
        '、',
      )}（依据《${FUELING_RULE.title}》${FUELING_RULE.version}）`,
      checks,
    }
  }
  if (!groundingAllPassed) {
    return {
      ok: false,
      message: `放行不通过：静电接地检查尚有 ${missing.length} 项未通过（${missing.join(
        '；',
      )}），全部通过前不许进入加注中`,
      checks,
    }
  }
  if (!truckFree) {
    const occupant = findTruckOccupant(rows, String(job.加油车号), Number(job.id))
    return {
      ok: false,
      message: `放行不通过：加油车「${job.加油车号}」同时段已在执行作业 ${occupant?.作业编号}（状态「${occupant?.status}」）`,
      checks,
    }
  }

  const snapshot = JSON.stringify({
    ruleVersion: FUELING_RULE.version,
    checkedAt: nowStamp(),
    operator,
    fuelGrade: job.油品规格,
    grounding: FUELING_RULE.groundingChecks.map((item) => ({
      key: item.key,
      label: item.label,
      passed: passed[item.key],
    })),
  })
  const updated: FuelingJob = {
    ...job,
    status: '加注中',
    pending: true,
    作业状态: '加注中',
    静电接地检查: `已核对 ${FUELING_RULE.groundingChecks.length}/${FUELING_RULE.groundingChecks.length} 项，全部合格`,
    放行核对: snapshot,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(MODULE_KEY, next)
  return { ok: true, message: `放行核对通过，作业 ${job.作业编号} 已进入「加注中」`, checks }
}

/**
 * 提交确认：核对实际加注量是否超过机型区间上限。
 * 超限时只提示并写明依据，不硬拦；force=true 为强行提交，必须填写原因并在记录上留痕。
 * 同一作业重复提交只算一次（状态不是「加注中」一律拒绝）。
 */
export function submitFueling(
  id: number,
  amount: number,
  force: boolean,
  reason: string,
  operator: string,
): ActionResult {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的加油作业` }
  }
  const job = rows[index]
  if (String(job.status) === '待确认') {
    return { ok: false, message: '该作业已提交过确认，重复提交只算一次' }
  }
  if (String(job.status) === '已完成') {
    return { ok: false, message: '该作业已完成，无需重复提交' }
  }
  if (String(job.status) !== '加注中') {
    return {
      ok: false,
      message: `状态只能按「待加注 → 加注中 → 待确认 → 已完成」顺序流转，当前为「${job.status}」，不能提交确认`,
    }
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: '实际加注量必须是不小于 0 的数字' }
  }
  const rule = aircraftRule(String(job.机型))
  const limit = rule?.maxAmount ?? 0
  const overLimit = rule ? amount > rule.maxAmount : true
  const basis = overLimitBasis(String(job.机型), amount)
  if (overLimit && !force) {
    return {
      ok: false,
      message: `${basis}。请确认加注量；确需超上限加注的，勾选「强行提交」并填写原因后留痕提交。`,
    }
  }
  if (overLimit && force && !reason.trim()) {
    return { ok: false, message: '强行提交超限加注必须填写原因，该原因会写入作业记录留痕' }
  }

  const updated: FuelingJob = {
    ...job,
    status: '待确认',
    pending: true,
    abnormal: job.abnormal || overLimit,
    作业状态: '待确认',
    实际加注量: amount,
  }
  if (overLimit) {
    updated.超限留痕 = JSON.stringify({
      ruleVersion: FUELING_RULE.version,
      limit,
      amount,
      basis,
      reason: reason.trim(),
      operator,
      submittedAt: nowStamp(),
    })
  }
  const next = [...rows]
  next[index] = updated
  saveRows(MODULE_KEY, next)
  return {
    ok: true,
    message: overLimit
      ? `作业 ${job.作业编号} 已强行提交，超上限情况已在记录留痕，待确认完成`
      : `作业 ${job.作业编号} 已提交确认，实际加注量 ${amount} ${FUELING_RULE.unit}`,
  }
}

/** 确认完成：状态走到「已完成」，台账在完成这一刻自动落地，调度读到的用量即来自这里。 */
export function completeFueling(id: number): ActionResult {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的加油作业` }
  }
  const job = rows[index]
  if (String(job.status) === '已完成') {
    return { ok: false, message: '该作业已完成，重复确认只算一次' }
  }
  if (String(job.status) !== '待确认') {
    return {
      ok: false,
      message: `状态只能按「待加注 → 加注中 → 待确认 → 已完成」顺序流转，当前为「${job.status}」，不能确认完成`,
    }
  }
  const updated: FuelingJob = {
    ...job,
    status: '已完成',
    pending: false,
    作业状态: '已完成',
    完成时间: job.完成时间 ?? nowStamp(),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(MODULE_KEY, next)
  return { ok: true, message: `作业 ${job.作业编号} 已完成，用量已计入油料需求台账` }
}

export function fuelingStats(now: Date = new Date()): FuelingStats {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const month = today.slice(0, 7)
  const completed = rows.filter((row) => String(row.status) === '已完成')
  return {
    todayCompleted: completed.filter((row) => String(row.完成时间 ?? row.作业日期).startsWith(today)).length,
    fueling: rows.filter((row) => String(row.status) === '加注中').length,
    monthAmount: Math.round(
      completed
        .filter((row) => String(row.完成时间 ?? row.作业日期).startsWith(month))
        .reduce((sum, row) => sum + parseAmount(row.实际加注量), 0) * 100,
    ) / 100,
    totalCompleted: completed.length,
    blocked: rows.filter(
      (row) => String(row.status) === '待加注' && !isFuelGradeMatched(String(row.机型), String(row.油品规格)),
    ).length,
    forcedOverLimit: rows.filter((row) => Boolean(row.超限留痕)).length,
  }
}

function toLedgerEntry(job: FuelingJob): FuelLedgerEntry {
  const rule = aircraftRule(String(job.机型))
  const amount = parseAmount(job.实际加注量)
  const overLimit = rule ? amount > rule.maxAmount : true
  let basis = ''
  if (overLimit) {
    try {
      basis = job.超限留痕 ? (JSON.parse(job.超限留痕).basis as string) : overLimitBasis(String(job.机型), amount)
    } catch {
      basis = overLimitBasis(String(job.机型), amount)
    }
  }
  let ruleVersion: string = FUELING_RULE.version
  if (job.超限留痕) {
    try {
      ruleVersion = (JSON.parse(job.超限留痕).ruleVersion as string) || ruleVersion
    } catch {
      // 留痕损坏时回落到当前规则版本
    }
  }
  return {
    作业编号: job.作业编号,
    航班号: job.航班号,
    机型: job.机型,
    需求油品规格: gradeName(rule?.fuelGradeCodes[0] ?? '') || String(job.油品规格),
    核定上限: rule ? rule.maxAmount : '规则未收录',
    实际加注量: amount,
    加油车号: job.加油车号,
    作业人员: job.作业人员,
    作业日期: job.作业日期,
    完成时间: String(job.完成时间 ?? ''),
    超限标记: overLimit ? '超限（已留痕）' : '正常',
    超限依据: basis,
    规则版本: ruleVersion,
  }
}

/**
 * 油料需求台账：只由「已完成」加油作业派生，没有独立登记表。
 * 调度线读用量走同一份函数，与作业记录不可能两样；重复确认不会产生第二条台账。
 */
export function fuelLedger(): FuelLedgerEntry[] {
  const rows = listRows(MODULE_KEY) as FuelingJob[]
  return rows
    .filter((row) => String(row.status) === '已完成')
    .map(toLedgerEntry)
    .sort((a, b) =>
      b.完成时间.localeCompare(a.完成时间) || b.作业日期.localeCompare(a.作业日期) || b.作业编号.localeCompare(a.作业编号),
    )
}
