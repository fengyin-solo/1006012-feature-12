<template>
  <section class="page" data-module="fueling">
    <header class="page-head">
      <div>
        <h2>航油加注管理</h2>
        <p class="page-desc">开始加注前按统一规则核对油品规格与机型、静电接地检查项；超限加注会提示依据，强行提交必须留痕。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记加油作业</button>
        <button class="btn" type="button" @click="showRules = true">查询放行规则</button>
        <button class="btn" type="button" @click="exportRows">导出航油加注清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>作业编号 / 航班号</span>
        <input v-model="keyword" placeholder="按作业编号或航班号检索" />
      </label>
      <label class="filter-item">
        <span>加油车号</span>
        <input v-model="truckFilter" placeholder="按加油车号检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>作业编号</th>
          <th>航班号</th>
          <th>机型</th>
          <th>油品规格核对</th>
          <th>计划/实际加注量（{{ rule.unit }}）</th>
          <th>加油车号</th>
          <th>作业人员</th>
          <th>作业日期</th>
          <th>静电接地检查</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-overlimit': Boolean(row.超限留痕) }">
          <td>{{ row.作业编号 }}</td>
          <td>{{ row.航班号 }}</td>
          <td>{{ row.机型 }}</td>
          <td>
            <span :class="['badge', isMatched(row) ? 'badge-ok' : 'badge-bad']">
              {{ isMatched(row) ? '规格匹配' : '规格不匹配' }}
            </span>
            <div class="cell-sub">{{ row.油品规格 }}</div>
          </td>
          <td>
            计划 {{ row.计划加注量 }}<br />
            实际 {{ row.实际加注量 === '' ? '—' : row.实际加注量 }}
            <span v-if="isOverLimit(row)" class="overlimit-tag">超限已留痕</span>
          </td>
          <td>{{ row.加油车号 }}</td>
          <td>{{ row.作业人员 }}</td>
          <td>{{ row.作业日期 }}</td>
          <td class="cell-ground">{{ row.静电接地检查 }}</td>
          <td>
            <span :class="['status-pill', `st-${statusIndex(row.status)}`]">{{ row.status }}</span>
          </td>
          <td class="row-actions">
            <button
              v-if="String(row.status) === '待加注'"
              class="link"
              type="button"
              @click="openGate(row)"
            >开始加注</button>
            <button
              v-if="String(row.status) === '加注中'"
              class="link"
              type="button"
              @click="openSubmit(row)"
            >提交确认</button>
            <button
              v-if="String(row.status) === '待确认'"
              class="link"
              type="button"
              @click="runComplete(row)"
            >确认完成</button>
            <button class="link" type="button" @click="openTrace(row)">记录</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="11" class="empty-state">暂无航油加注数据，可先登记加油作业</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条加油作业；状态只允许沿 待加注 → 加注中 → 待确认 → 已完成 顺序流转</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 登记加油作业 -->
    <div v-if="createOpen" class="modal-mask" @click.self="createOpen = false">
      <div class="modal">
        <h3>登记加油作业</h3>
        <div class="form-grid">
          <label class="field">
            <span>航班号 *</span>
            <input v-model="createForm.航班号" placeholder="如 CA1501" />
          </label>
          <label class="field">
            <span>机型 *</span>
            <select v-model="createForm.机型">
              <option value="" disabled>请选择机型</option>
              <option v-for="item in rule.aircraft" :key="item.model" :value="item.model">{{ item.model }}</option>
            </select>
          </label>
          <label class="field">
            <span>油品规格 *</span>
            <select v-model="createForm.油品规格">
              <option value="" disabled>请选择油品规格</option>
              <option v-for="grade in rule.fuelGrades" :key="grade.code" :value="grade.name">{{ grade.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>计划加注量（{{ rule.unit }}）*</span>
            <input v-model.number="createForm.计划加注量" type="number" min="0" />
          </label>
          <label class="field">
            <span>加油车号 *</span>
            <input v-model="createForm.加油车号" list="truck-list" placeholder="如 RY-07" />
            <datalist id="truck-list">
              <option v-for="t in truckOptions" :key="t" :value="t" />
            </datalist>
          </label>
          <label class="field">
            <span>作业人员 *</span>
            <input v-model="createForm.作业人员" />
          </label>
          <label class="field">
            <span>作业日期</span>
            <input v-model="createForm.作业日期" type="date" />
          </label>
        </div>
        <p v-if="createHint" :class="['form-hint', createHintOk ? 'hint-ok' : 'hint-bad']">{{ createHint }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="createOpen = false">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">登记</button>
        </div>
      </div>
    </div>

    <!-- 开始加注：放行核对 -->
    <div v-if="gateRow" class="modal-mask" @click.self="gateRow = null">
      <div class="modal modal-wide">
        <h3>放行核对 · {{ gateRow.作业编号 }}（{{ gateRow.航班号 }} / {{ gateRow.机型 }}）</h3>

        <div class="gate-section">
          <h4>一、油品规格与机型匹配</h4>
          <p>
            机型适用油品：
            <strong>{{ gateChecks.requiredFuelGrades.join('、') || '规则未收录该机型' }}</strong>
            ；本作业申报：<strong>{{ gateRow.油品规格 }}</strong>
          </p>
          <p :class="gateChecks.fuelGradeMatched ? 'hint-ok' : 'hint-bad'">
            {{ gateChecks.fuelGradeMatched ? '✓ 油品规格与机型匹配' : '✗ 油品规格与机型不匹配，禁止放行进入加注中' }}
          </p>
        </div>

        <div class="gate-section">
          <h4>二、静电接地检查（{{ rule.groundingChecks.length }} 项须全部通过）</h4>
          <ul class="check-list">
            <li v-for="item in rule.groundingChecks" :key="item.key">
              <label>
                <input type="checkbox" :checked="!!gateChecks.groundingResults[item.key]" @change="toggleGrounding(item.key, ($event.target as HTMLInputElement).checked)" />
                <span>{{ item.label }}</span>
              </label>
            </li>
          </ul>
          <p :class="gateChecks.groundingAllPassed ? 'hint-ok' : 'hint-bad'">
            {{ gateChecks.groundingAllPassed
              ? '✓ 接地检查项全部通过'
              : `✗ 尚有 ${gatePassedCount}/${rule.groundingChecks.length} 项通过，未全部通过前不许进入加注中` }}
          </p>
        </div>

        <div class="gate-section">
          <h4>三、加油车同时段占用</h4>
          <p :class="gateChecks.truckFree ? 'hint-ok' : 'hint-bad'">
            {{ gateChecks.truckFree
              ? `✓ 加油车「${gateRow.加油车号}」当前无其他在执行业`
              : `✗ 加油车「${gateRow.加油车号}」同时段已在执行其他作业，禁止放行` }}
          </p>
        </div>

        <p class="rule-cite">判定依据：《{{ rule.title }}》{{ rule.version }}（{{ rule.effectiveDate }} 起施行）</p>
        <p v-if="gateMessage" class="form-hint hint-bad">{{ gateMessage }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="gateRow = null">取消</button>
          <button class="btn primary" type="button" :disabled="!canStart" @click="confirmStart">
            核对通过，开始加注
          </button>
        </div>
      </div>
    </div>

    <!-- 提交确认：加注量核对，超限提示 + 强行提交留痕 -->
    <div v-if="submitRow" class="modal-mask" @click.self="submitRow = null">
      <div class="modal">
        <h3>提交确认 · {{ submitRow.作业编号 }}</h3>
        <p class="form-line">机型「{{ submitRow.机型 }}」加注量合理区间上限：
          <strong>{{ limitOf(submitRow) === null ? '规则未收录' : `${limitOf(submitRow)} ${rule.unit}` }}</strong>
        </p>
        <label class="field">
          <span>实际加注量（{{ rule.unit }}）*</span>
          <input v-model.number="submitAmount" type="number" min="0" />
        </label>
        <p v-if="submitOver" class="form-hint hint-bad">{{ overBasis }}</p>
        <template v-if="submitOver">
          <label class="field force-row">
            <input type="checkbox" v-model="forceSubmit" />
            <span>我已核对，确需超该机型区间上限强行提交（将在作业记录上留痕）</span>
          </label>
          <label class="field">
            <span>强行提交原因 *（写入留痕）</span>
            <textarea v-model="forceReason" rows="2" placeholder="如：机长要求按远程备降油量加注"></textarea>
          </label>
        </template>
        <p v-if="submitMessage" class="form-hint hint-bad">{{ submitMessage }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="submitRow = null">取消</button>
          <button class="btn primary" type="button" @click="confirmSubmit">提交确认</button>
        </div>
      </div>
    </div>

    <!-- 记录留痕查看 -->
    <div v-if="traceRow" class="modal-mask" @click.self="traceRow = null">
      <div class="modal">
        <h3>作业记录 · {{ traceRow.作业编号 }}</h3>
        <table class="data-table trace-table">
          <tbody>
            <tr><th>航班号</th><td>{{ traceRow.航班号 }}</td></tr>
            <tr><th>机型</th><td>{{ traceRow.机型 }}</td></tr>
            <tr><th>油品规格</th><td>{{ traceRow.油品规格 }}（{{ isMatched(traceRow) ? '匹配' : '不匹配' }}）</td></tr>
            <tr><th>计划加注量</th><td>{{ traceRow.计划加注量 }} {{ rule.unit }}</td></tr>
            <tr><th>实际加注量</th><td>{{ traceRow.实际加注量 === '' ? '—' : `${traceRow.实际加注量} ${rule.unit}` }}</td></tr>
            <tr><th>静电接地检查</th><td>{{ traceRow.静电接地检查 }}</td></tr>
            <tr><th>放行核对</th><td><pre class="json-pre">{{ prettyJson(traceRow.放行核对) }}</pre></td></tr>
            <tr><th>超限留痕</th><td><pre class="json-pre">{{ prettyJson(traceRow.超限留痕) }}</pre></td></tr>
            <tr><th>完成时间</th><td>{{ traceRow.完成时间 || '—' }}</td></tr>
          </tbody>
        </table>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="traceRow = null">关闭</button>
        </div>
      </div>
    </div>

    <!-- 放行规则查询（唯一口径） -->
    <div v-if="showRules" class="modal-mask" @click.self="showRules = false">
      <div class="modal modal-wide">
        <h3>{{ rule.title }}</h3>
        <p class="rule-cite">版本 {{ rule.version }} · {{ rule.effectiveDate }} 起施行 · 页面、动作层、统计共用本口径</p>

        <div class="gate-section">
          <h4>一、机型与油品规格匹配 / 加注量合理区间上限</h4>
          <table class="data-table">
            <thead>
              <tr><th>机型</th><th>适用油品规格</th><th>加注量区间上限（{{ rule.unit }}）</th><th>备注</th></tr>
            </thead>
            <tbody>
              <tr v-for="item in rule.aircraft" :key="item.model">
                <td>{{ item.model }}</td>
                <td>{{ item.fuelGradeCodes.map((code) => gradeName(code)).join('、') }}</td>
                <td>{{ item.maxAmount }}</td>
                <td>{{ item.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="gate-section">
          <h4>二、静电接地检查项清单（全部通过方可进入加注中）</h4>
          <ol class="check-list ordered">
            <li v-for="item in rule.groundingChecks" :key="item.key">{{ item.label }}</li>
          </ol>
        </div>

        <div class="modal-actions">
          <button class="btn primary" type="button" @click="showRules = false">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import { downloadEntries } from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import {
  completeFueling,
  createJob,
  evaluateGate,
  fuelingStats,
  listJobs,
  startFueling,
  submitFueling,
} from '@/domain/fueling/service'
import { FUELING_RULE as rule, gradeName, isFuelGradeMatched, overLimitBasis } from '@/domain/fueling/rules'
import type { FuelingJob, GateChecks } from '@/domain/fueling/types'

const session = useSessionStore()

const statuses = ['待加注', '加注中', '待确认', '已完成']
const rows = ref<FuelingJob[]>([])
const keyword = ref('')
const truckFilter = ref('')
const errorMessage = ref('')

const statusSummary = computed(() =>
  statuses.map((status) => ({ status, count: rows.value.filter((row) => String(row.status) === status).length })),
)

const statCards = computed(() => {
  // 依赖 rows，确保完成/提交后统计随之刷新
  void rows.value
  const stats = fuelingStats()
  return [
    { label: `今日加油架次（${rule.unit}口径见台账）`, value: stats.todayCompleted },
    { label: '加注中作业', value: stats.fueling },
    { label: `本月实际加注量（${rule.unit}）`, value: stats.monthAmount },
    { label: '放行被拦（规格不匹配）', value: stats.blocked },
    { label: '强行超限留痕', value: stats.forcedOverLimit },
  ]
})

const truckOptions = computed(() => {
  const set = new Set<string>()
  for (const row of rows.value) {
    set.add(String(row.加油车号))
  }
  return [...set].sort()
})

function isMatched(row: FuelingJob): boolean {
  return isFuelGradeMatched(String(row.机型), String(row.油品规格))
}

function limitOf(row: FuelingJob): number | null {
  const found = rule.aircraft.find((item) => item.model === row.机型)
  return found ? found.maxAmount : null
}

function isOverLimit(row: FuelingJob): boolean {
  return Boolean(row.超限留痕)
}

function statusIndex(status: string): number {
  const idx = statuses.indexOf(status)
  return idx < 0 ? 0 : idx
}

function reload() {
  errorMessage.value = ''
  try {
    const kw = keyword.value.trim()
    const truck = truckFilter.value.trim()
    rows.value = listJobs().filter((row) => {
      const hitKeyword = !kw || row.作业编号.includes(kw) || row.航班号.includes(kw)
      const hitTruck = !truck || String(row.加油车号).includes(truck)
      return hitKeyword && hitTruck
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '航油加注列表读取失败'
  }
}

function resetFilters() {
  keyword.value = ''
  truckFilter.value = ''
  reload()
}

function exportRows() {
  downloadEntries('fueling')
}

onMounted(reload)

/* ---------- 登记 ---------- */

const createOpen = ref(false)
const createHint = ref('')
const createHintOk = ref(false)
const createForm = reactive({
  航班号: '',
  机型: '',
  油品规格: '',
  计划加注量: 0,
  加油车号: '',
  作业人员: '',
  作业日期: new Date().toISOString().slice(0, 10),
})

function openCreate() {
  Object.assign(createForm, {
    航班号: '',
    机型: '',
    油品规格: '',
    计划加注量: 0,
    加油车号: '',
    作业人员: session.operator === '值班管理员' ? '' : session.operator,
    作业日期: new Date().toISOString().slice(0, 10),
  })
  createHint.value = ''
  createOpen.value = true
}

// 选机型时页面侧只做提示，真正拦截在动作层（放行判定）。
const createPreview = computed(() => {
  if (!createForm.机型) {
    return null
  }
  const item = rule.aircraft.find((a) => a.model === createForm.机型)
  if (!item) {
    return null
  }
  return {
    matched: createForm.油品规格
      ? isFuelGradeMatched(createForm.机型, createForm.油品规格)
      : null,
    limit: item.maxAmount,
    grades: item.fuelGradeCodes.map((code) => gradeName(code)).join('、'),
  }
})

function submitCreate() {
  const result = createJob({ ...createForm })
  if (!result.ok) {
    createHintOk.value = false
    createHint.value = result.message
    return
  }
  createOpen.value = false
  errorMessage.value = ''
  reload()
}

/* ---------- 放行核对 ---------- */

const gateRow = ref<FuelingJob | null>(null)
const gateChecks = ref<GateChecks>(evaluateGate({} as FuelingJob))
const gateMessage = ref('')

const gatePassedCount = computed(() =>
  rule.groundingChecks.filter((item) => gateChecks.value.groundingResults[item.key]).length,
)
const canStart = computed(
  () =>
    gateChecks.value.fuelGradeMatched &&
    gateChecks.value.groundingAllPassed &&
    gateChecks.value.truckFree,
)

function openGate(row: FuelingJob) {
  gateRow.value = row
  gateChecks.value = evaluateGate(row)
  gateMessage.value = ''
}

function toggleGrounding(key: string, checked: boolean) {
  const results = { ...gateChecks.value.groundingResults, [key]: checked }
  gateChecks.value = {
    ...gateChecks.value,
    groundingResults: results,
    groundingAllPassed: rule.groundingChecks.every((item) => results[item.key]),
  }
}

function confirmStart() {
  if (!gateRow.value) {
    return
  }
  const result = startFueling(Number(gateRow.value.id), gateChecks.value.groundingResults, session.operator)
  gateChecks.value = result.checks
  if (!result.ok) {
    gateMessage.value = result.message
    return
  }
  gateRow.value = null
  reload()
}

/* ---------- 提交确认 ---------- */

const submitRow = ref<FuelingJob | null>(null)
const submitAmount = ref<number>(0)
const forceSubmit = ref(false)
const forceReason = ref('')
const submitMessage = ref('')

const submitOver = computed(() => {
  if (!submitRow.value) {
    return false
  }
  const limit = limitOf(submitRow.value)
  return limit === null ? false : submitAmount.value > limit
})
const overBasis = computed(() =>
  submitRow.value ? overLimitBasis(String(submitRow.value.机型), submitAmount.value) : '',
)

function openSubmit(row: FuelingJob) {
  submitRow.value = row
  submitAmount.value = Number(row.计划加注量) || 0
  forceSubmit.value = false
  forceReason.value = ''
  submitMessage.value = ''
}

function confirmSubmit() {
  if (!submitRow.value) {
    return
  }
  const result = submitFueling(
    Number(submitRow.value.id),
    submitAmount.value,
    forceSubmit.value,
    forceReason.value,
    session.operator,
  )
  if (!result.ok) {
    submitMessage.value = result.message
    return
  }
  submitRow.value = null
  reload()
}

function runComplete(row: FuelingJob) {
  const result = completeFueling(Number(row.id))
  errorMessage.value = result.ok ? '' : result.message
  reload()
}

/* ---------- 记录 ---------- */

const traceRow = ref<FuelingJob | null>(null)

function openTrace(row: FuelingJob) {
  traceRow.value = row
}

function prettyJson(raw: string | undefined): string {
  if (!raw) {
    return '无'
  }
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

/* ---------- 规则面板 ---------- */

const showRules = ref(false)

// 登记弹窗的实时提示（页面引用同一份规则，判定仍以动作层为准）
watch(createPreview, (preview) => {
  if (!preview) {
    createHint.value = ''
    return
  }
  const parts: string[] = [`该机型适用：${preview.grades}；区间上限 ${preview.limit} ${rule.unit}。`]
  if (preview.matched === false) {
    createHintOk.value = false
    parts.push('当前所选油品规格与机型不匹配，登记后放行环节会被拦下。')
  } else if (preview.matched === true) {
    createHintOk.value = true
    parts.push('油品规格与机型匹配。')
  } else {
    createHintOk.value = true
  }
  if (createForm.计划加注量 > preview.limit) {
    createHintOk.value = false
    parts.push(`计划加注量已超过该机型上限 ${preview.limit}，提交实际加注量时将要求留痕。`)
  }
  createHint.value = parts.join('')
}, { immediate: false })
</script>

<style scoped>
.badge {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  white-space: nowrap;
}
.badge-ok { background: #e7f6ec; color: #1a7f37; border: 1px solid #b7e0c4; }
.badge-bad { background: #fdeceb; color: #b42318; border: 1px solid #f3c0bd; }
.cell-sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
.cell-ground { font-size: 12px; }
.overlimit-tag {
  display: inline-block;
  margin-left: 6px;
  background: #fff4e5;
  color: #b54708;
  border: 1px solid #f5d3a6;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 12px;
}
.row-overlimit { background: #fffbf5; }
.status-pill {
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
}
.st-0 { background: #eef2f7; color: #475569; }
.st-1 { background: #e8f0fe; color: #1f6feb; }
.st-2 { background: #fdf3e0; color: #b54708; }
.st-3 { background: #e7f6ec; color: #1a7f37; }

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background: #fff;
  border-radius: 10px;
  padding: 20px 24px;
  width: 560px;
  max-height: 86vh;
  overflow-y: auto;
}
.modal-wide { width: 760px; }
.modal h3 { margin: 0 0 12px; font-size: 16px; }
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
}
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.field span { color: var(--muted); font-size: 12px; }
.field input, .field select, .field textarea {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}
.form-hint {
  margin: 10px 0 0;
  font-size: 12px;
  border-radius: 6px;
  padding: 6px 8px;
}
.form-line { font-size: 13px; }
.hint-ok { background: #e7f6ec; color: #1a7f37; }
.hint-bad { background: #fdeceb; color: #b42318; }
.force-row { flex-direction: row; align-items: center; gap: 8px; margin: 10px 0; }
.gate-section { margin-bottom: 14px; }
.gate-section h4 { margin: 0 0 6px; font-size: 13px; }
.check-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.check-list label { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; }
.check-list.ordered { padding-left: 18px; list-style: decimal; gap: 4px; }
.rule-cite { color: var(--muted); font-size: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.modal .btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.trace-table th { width: 110px; white-space: nowrap; }
.json-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  background: #f6f8fb;
  padding: 6px 8px;
  border-radius: 6px;
}
</style>
