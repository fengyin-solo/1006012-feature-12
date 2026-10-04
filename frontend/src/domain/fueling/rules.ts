/**
 * 航油加注放行规则 —— 全平台唯一口径。
 * 页面（加油作业页/台账页）、动作层（service.ts 的放行判定）、统计（fuelingStats/台账派生）
 * 都只允许引用本文件，不得在别处再抄一份匹配关系、检查清单或上限。
 */

export const FUELING_RULE = {
  // 规则版本会写进每一条超限留痕与台账记录，规则调整时升版，记录上能查出当时按哪版判定。
  version: 'FUEL-RULE-2026-10',
  effectiveDate: '2026-10-01',
  title: '航油加注放行规则',
  unit: '千克',
  fuelGrades: [
    { code: 'JETA1', name: '3号喷气燃料（Jet A-1）' },
    { code: 'AVGAS', name: '航空汽油（AVGAS 100LL）' },
  ],
  // 机型 → 适用油品规格 + 单架次加注量合理区间上限。
  aircraft: [
    {
      model: 'A320neo',
      fuelGradeCodes: ['JETA1'],
      maxAmount: 19000,
      note: '窄体机单通道主力机型',
    },
    {
      model: 'B737-800',
      fuelGradeCodes: ['JETA1'],
      maxAmount: 20900,
      note: '窄体机单通道主力机型',
    },
    {
      model: 'B777-300ER',
      fuelGradeCodes: ['JETA1'],
      maxAmount: 181000,
      note: '宽体远程机型',
    },
    {
      model: '庞巴迪CRJ-900',
      fuelGradeCodes: ['JETA1'],
      maxAmount: 10300,
      note: '支线喷气机型',
    },
    {
      model: '塞斯纳172',
      fuelGradeCodes: ['AVGAS'],
      maxAmount: 212,
      note: '活塞发动机通用航空机型',
    },
  ],
  // 静电接地检查项清单：全部通过才允许进入「加注中」，一项不过都不放行。
  groundingChecks: [
    { key: 'clamp', label: '静电接地夹外观完好，与航空器接地点连接牢固' },
    { key: 'cable', label: '接地导线无破损、断股，两端接头无松动锈蚀' },
    { key: 'resistance', label: '接地电阻检测合格，阻值不超过规定阈值' },
    { key: 'bonding', label: '加油车与航空器等电位跨接已完成并确认' },
    { key: 'monitor', label: '静电接地监测装置通电自检正常，无报警' },
    { key: 'staticRelease', label: '作业人员已释放人体静电，加油前静置计时满足要求' },
  ],
} as const

export type AircraftRule = (typeof FUELING_RULE.aircraft)[number]

export function gradeName(code: string): string {
  return FUELING_RULE.fuelGrades.find((grade) => grade.code === code)?.name ?? code
}

export function aircraftRule(model: string): AircraftRule | undefined {
  return FUELING_RULE.aircraft.find((item) => item.model === model)
}

/** 机型适用的油品规格名称；规则未收录的机型返回空数组，由调用方按「不放行」处理。 */
export function requiredFuelGrades(model: string): string[] {
  return aircraftRule(model)?.fuelGradeCodes.map(gradeName) ?? []
}

/** 油品规格与机型是否匹配：机型必须在规则内，且当前规格属于该机型的适用清单。 */
export function isFuelGradeMatched(model: string, fuelGrade: string): boolean {
  const rule = aircraftRule(model)
  return Boolean(rule && rule.fuelGradeCodes.some((code) => gradeName(code) === fuelGrade))
}

/** 加注量超过该机型合理区间上限时，统一返回这句话作为提示与留痕依据。 */
export function overLimitBasis(model: string, amount: number): string {
  const rule = aircraftRule(model)
  if (!rule) {
    return `依据《${FUELING_RULE.title}》（${FUELING_RULE.version}）：机型「${model}」未收录，无法核定加注量合理区间上限。`
  }
  return `依据《${FUELING_RULE.title}》（${FUELING_RULE.version}）：机型「${model}」单架次加注量合理区间上限为 ${rule.maxAmount} ${FUELING_RULE.unit}，本次申报 ${amount} ${FUELING_RULE.unit}，已超出上限。`
}
