/**
 * 航油加注领域逻辑冒烟测试（node 直接运行 ts 源码需先内联一个 localStorage mock，
 * 这里改为动态改写 data/local-store 的浏览器依赖：通过全局 window 注入）。
 */
const store = new Map<string, string>()
;(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
}

import {
  completeFueling,
  createJob,
  fuelLedger,
  fuelingStats,
  listJobs,
  startFueling,
  submitFueling,
} from '../src/domain/fueling/service'
import { FUELING_RULE } from '../src/domain/fueling/rules'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name} ${detail}`)
  }
}

const allGrounding = Object.fromEntries(FUELING_RULE.groundingChecks.map((c) => [c.key, true]))
const partialGrounding = { ...allGrounding }
partialGrounding[FUELING_RULE.groundingChecks[0].key] = false
const op = '测试员'

console.log('1) 登记')
const ok = createJob({
  航班号: 'TEST-A', 机型: 'A320neo', 油品规格: '3号喷气燃料（Jet A-1）',
  计划加注量: 8000, 加油车号: 'T-1', 作业人员: op, 作业日期: '2026-10-04',
})
check('正常登记成功', ok.ok, ok.message)
const idA = ok.id!

const mismatch = createJob({
  航班号: 'TEST-B', 机型: '塞斯纳172', 油品规格: '3号喷气燃料（Jet A-1）',
  计划加注量: 100, 加油车号: 'T-2', 作业人员: op, 作业日期: '2026-10-04',
})
check('规格不匹配允许登记（放行才拦）', mismatch.ok, mismatch.message)
const idB = mismatch.id!

const dupTruck = createJob({
  航班号: 'TEST-C', 机型: 'A320neo', 油品规格: '3号喷气燃料（Jet A-1）',
  计划加注量: 8000, 加油车号: 'T-1', 作业人员: op, 作业日期: '2026-10-04',
})
check('同一加油车同时段第二条被拒', !dupTruck.ok, dupTruck.message)
check('拒绝信息写明占用作业', dupTruck.message.includes('TEST-A'))

console.log('2) 放行判定')
const ground = startFueling(idA, partialGrounding, op)
check('接地未全通过不许进入加注中', !ground.ok && listJobs().find((j) => j.id === idA)!.status === '待加注', ground.message)
check('提示缺少项数', ground.message.includes('尚有 1 项未通过'))

const specBlock = startFueling(idB, allGrounding, op)
check('规格不匹配即使接地全过也不放行', !specBlock.ok, specBlock.message)
check('放行提示写明适用规格', specBlock.message.includes('航空汽油'))

const pass = startFueling(idA, allGrounding, op)
check('规格匹配+接地全过才放行', pass.ok, pass.message)
check('状态进入加注中', listJobs().find((j) => j.id === idA)!.status === '加注中')
check('放行快照已留存', Boolean(listJobs().find((j) => j.id === idA)!.放行核对))

const doubleStart = startFueling(idA, allGrounding, op)
check('重复开始被拒', !doubleStart.ok)

console.log('3) 超限提示与强行提交留痕')
const normalSubmit = submitFueling(idA, 8000, false, '', op)
check('未超限正常提交', normalSubmit.ok, normalSubmit.message)
check('状态进入待确认', listJobs().find((j) => j.id === idA)!.status === '待确认')
const doubleSubmit = submitFueling(idA, 8000, false, '', op)
check('同一作业重复提交只算一次', !doubleSubmit.ok, doubleSubmit.message)

// 完成 A，释放 T-1
check('完成', completeFueling(idA).ok)
const doubleComplete = completeFueling(idA)
check('重复完成只算一次', !doubleComplete.ok)
check('T-1 完成后可接新作业', createJob({
  航班号: 'TEST-D', 机型: 'A320neo', 油品规格: '3号喷气燃料（Jet A-1）',
  计划加注量: 8000, 加油车号: 'T-1', 作业人员: op, 作业日期: '2026-10-04',
}).ok)
const idD = listJobs().find((j) => j.航班号 === 'TEST-D')!.id
startFueling(idD, allGrounding, op)

const overWarn = submitFueling(idD, 19200, false, '', op)
check('超上限普通提交被拦并给出依据', !overWarn.ok && overWarn.message.includes('19000') && overWarn.message.includes('FUEL-RULE-2026-10'), overWarn.message)
check('超限状态仍为加注中（未写入）', listJobs().find((j) => j.id === idD)!.status === '加注中')
const noReason = submitFueling(idD, 19200, true, '   ', op)
check('强行提交但不填原因被拒', !noReason.ok)
const forced = submitFueling(idD, 19200, true, '机长要求按远程备降油量加注', op)
check('填写原因后强行提交成功', forced.ok, forced.message)
const trace = JSON.parse(listJobs().find((j) => j.id === idD)!.超限留痕 || '{}')
check('留痕含上限/实际量/依据/原因/操作人/时间/规则版本',
  trace.limit === 19000 && trace.amount === 19200 && trace.basis.includes('超出上限') &&
  trace.reason && trace.operator === op && trace.submittedAt && trace.ruleVersion === 'FUEL-RULE-2026-10')
check('强行超限记录标记为异常', listJobs().find((j) => j.id === idD)!.abnormal === true)
completeFueling(idD)

console.log('4) 状态跳步')
const jump = createJob({
  航班号: 'TEST-E', 机型: 'A320neo', 油品规格: '3号喷气燃料（Jet A-1）',
  计划加注量: 8000, 加油车号: 'T-5', 作业人员: op, 作业日期: '2026-10-04',
})
const idE = jump.id!
check('待加注直接提交确认被拒', !submitFueling(idE, 8000, false, '', op).ok)
check('待加注直接确认完成被拒', !completeFueling(idE).ok)

console.log('5) 台账与统计同源')
const ledger = fuelLedger()
const a = ledger.find((e) => e.航班号 === 'TEST-A')
const d = ledger.find((e) => e.航班号 === 'TEST-D')
check('台账只含已完成作业（A、D 已计入；B/E 未完成不计入）',
  Boolean(a) && Boolean(d) && !ledger.some((e) => ['TEST-B', 'TEST-E'].includes(e.航班号)))
check('台账用量等于作业实际加注量', a!.实际加注量 === 8000 && d!.实际加注量 === 19200)
check('台账正常行无依据、超限行带依据',
  a!.超限标记 === '正常' && a!.超限依据 === '' &&
  d!.超限标记 === '超限（已留痕）' && d!.超限依据.includes('超出上限'))
check('台账记录带规则版本', a!.规则版本 === FUELING_RULE.version)
const stats = fuelingStats(new Date('2026-10-04T12:00:00'))
const monthAmount = ledger
  .filter((e) => String(e.完成时间).startsWith('2026-10'))
  .reduce((s, e) => s + e.实际加注量, 0)
check('统计月用量与台账汇总一致', stats.monthAmount === monthAmount, `${stats.monthAmount} vs ${monthAmount}`)
check('强行超限计数', stats.forcedOverLimit >= 1)
check('放行被拦计数（TEST-B 待加注且不匹配）', stats.blocked >= 1)
check('台账行数=已完成作业数', ledger.length === listJobs().filter((j) => j.status === '已完成').length)

console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed > 0) {
  process.exit(1)
}
