<template>
  <section class="page" data-module="fueling">
    <header class="page-head">
      <div>
        <h2>航油加注管理</h2>
        <p class="page-desc">{{ meta.desc }}</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记加油作业</button>
        <button class="btn" type="button" @click="showRules = !showRules">{{ showRules ? '收起' : '查看' }}放行规则</button>
        <button class="btn" type="button" @click="exportRows">导出加油作业清单</button>
      </div>
    </header>

    <!-- 规则口径（页面引用 fuel-rules，不在页面另写匹配关系/清单/上限） -->
    <section v-if="showRules" class="rule-panel">
      <h3>航油加注放行规则（判定口径以此为准）</h3>
      <p class="rule-note">页面、动作层、统计三处引用同一份规则：机型-油品匹配关系、静电接地检查清单、加注量合理区间上限，均取自本规则。</p>
      <div class="rule-grid">
        <article>
          <h4>一、机型与油品规格匹配 / 加注量合理区间上限</h4>
          <table class="rule-table">
            <thead>
              <tr><th>机型</th><th>允许油品规格</th><th>加注量上限(L)</th><th>上限依据</th></tr>
            </thead>
            <tbody>
              <tr v-for="rule in fuelRules" :key="rule.aircraft">
                <td>{{ rule.aircraft }}</td>
                <td>{{ rule.allowedSpecs.join('、') }}</td>
                <td>{{ rule.maxAmount }}</td>
                <td>{{ rule.basis }}</td>
              </tr>
            </tbody>
          </table>
        </article>
        <article>
          <h4>二、静电接地检查项清单（须全部通过）</h4>
          <ol class="rule-list">
            <li v-for="item in groundItems" :key="item.code">
              <strong>{{ item.code }} {{ item.label }}</strong>
              <span>{{ item.standard }}</span>
            </li>
          </ol>
          <h4>三、状态流转与车辆口径</h4>
          <ul class="rule-list plain">
            <li>状态只能按「{{ flow.join(' → ') }}」依次流转，不许跳步；同一作业重复提交只算一次。</li>
            <li>同一加油车同一时段只允许参与一条作业（时段口径：{{ busyStatuses.join('、') }}）。</li>
            <li>作业「确认完成」后自动落入油料需求台账，用量直接取作业记录。</li>
          </ul>
        </article>
      </div>
    </section>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
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
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-abnormal': row.abnormal }">
            <td v-for="column in columns" :key="column" :title="String(row[column] ?? '')" class="cell-ellipsis">
              {{ row[column] === '' || row[column] === undefined ? '—' : row[column] }}
            </td>
            <td>
              <span class="status-tag" :class="overTrail(row) ? 'status-danger' : ''">{{ row.status }}</span>
            </td>
            <td class="row-actions">
              <button
                v-if="allowedAction(row) === '开始加注'"
                class="link"
                type="button"
                @click="openRelease(row)"
              >开始加注（放行核对）</button>
              <button
                v-else-if="allowedAction(row) === '提交确认'"
                class="link"
                type="button"
                @click="openAmount(row)"
              >提交确认（登记加注量）</button>
              <button
                v-else-if="allowedAction(row) === '确认完成'"
                class="link"
                type="button"
                @click="complete(row)"
              >确认完成（落入台账）</button>
              <span v-else class="muted-text">流程已闭环</span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 2" class="empty-state">暂无加油作业，可先登记</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="page-foot">
      <span>共 {{ total }} 条加油作业记录 · 数据保存在本机浏览器</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 登记加油作业 -->
    <div v-if="createOpen" class="modal-mask" @click.self="closeCreate">
      <div class="modal">
        <h3>登记加油作业</h3>
        <p class="modal-hint">登记时即按规则口径预校验：机型与油品不匹配、加油车同一时段有其他作业的，不予登记。</p>
        <div class="form-grid">
          <label>
            <span>航班号 *</span>
            <input v-model="createForm.航班号" placeholder="如 CA1501" />
          </label>
          <label>
            <span>机型 *</span>
            <select v-model="createForm.机型">
              <option value="">请选择机型</option>
              <option v-for="rule in fuelRules" :key="rule.aircraft" :value="rule.aircraft">{{ rule.aircraft }}</option>
            </select>
          </label>
          <label>
            <span>油品规格 *</span>
            <select v-model="createForm.油品规格">
              <option value="">请选择油品规格</option>
              <option v-for="spec in fuelSpecs" :key="spec.code" :value="spec.label">{{ spec.label }}</option>
            </select>
          </label>
          <p v-if="createForm.机型" class="form-hint">
            规则口径：{{ createForm.机型 }} 只允许加注
            <strong>{{ ruleOf(createForm.机型)?.allowedSpecs.join('、') }}</strong>
            ，加注量上限 <strong>{{ ruleOf(createForm.机型)?.maxAmount }}L</strong>
            <em v-if="createForm.油品规格 && !specMatched(createForm.机型, createForm.油品规格)" class="error-text">
              · 当前所选油品规格与机型不匹配，登记将被拦截
            </em>
          </p>
          <label>
            <span>加油车号 *</span>
            <input v-model="createForm.加油车号" placeholder="如 FY-01" />
          </label>
          <label>
            <span>作业人员 *</span>
            <input v-model="createForm.作业人员" placeholder="姓名" />
          </label>
        </div>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeCreate">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">登记</button>
        </div>
      </div>
    </div>

    <!-- 开始加注：放行核对 -->
    <div v-if="releaseRow" class="modal-mask" @click.self="closeRelease">
      <div class="modal modal-wide">
        <h3>开始加注 · 放行核对（{{ releaseRow['作业编号'] }}）</h3>
        <table class="kv-table">
          <tbody>
            <tr><th>航班号 / 机型</th><td>{{ releaseRow['航班号'] }} / {{ releaseRow['机型'] }}</td></tr>
            <tr><th>油品规格</th><td>{{ releaseRow['油品规格'] }}</td></tr>
            <tr><th>加油车 / 作业人员</th><td>{{ releaseRow['加油车号'] }} / {{ releaseRow['作业人员'] }}</td></tr>
          </tbody>
        </table>

        <div class="check-block" :class="releaseEval?.specMatched ? 'check-pass' : 'check-fail'">
          <strong>① 油品规格与机型匹配核对</strong>
          <p v-if="releaseEval?.specMatched">
            通过：机型「{{ releaseRow['机型'] }}」允许 {{ releaseEval.allowedSpecs.join('、') }}，与登记油品规格一致。
          </p>
          <p v-else>
            不通过：机型「{{ releaseRow['机型'] }}」允许 {{ releaseEval?.allowedSpecs.join('、') || '规则未收录' }}，
            与「{{ releaseRow['油品规格'] }}」不匹配。不匹配不许进入加注中。
          </p>
        </div>

        <div class="check-block" :class="releaseEval?.groundingAllPass ? 'check-pass' : 'check-fail'">
          <strong>② 静电接地检查（{{ groundingPassed }}/{{ groundItems.length }} 项通过，须全部通过）</strong>
          <ul class="ground-list">
            <li v-for="item in groundItems" :key="item.code">
              <label>
                <input type="checkbox" :checked="isGroundPassed(item.code)" @change="toggleGround(item.code, ($event.target as HTMLInputElement).checked)" />
                <span>{{ item.code }} {{ item.label }}</span>
              </label>
              <small>{{ item.standard }}</small>
            </li>
          </ul>
        </div>

        <div class="check-block" :class="releaseEval?.truckConflict ? 'check-fail' : 'check-pass'">
          <strong>③ 加油车同一时段冲突核对</strong>
          <p v-if="releaseEval?.truckConflict">
            冲突：加油车「{{ releaseRow['加油车号'] }}」还在参与作业
            {{ releaseEval.truckConflict['作业编号'] }}（{{ releaseEval.truckConflict['航班号'] }}，状态：{{ releaseEval.truckConflict.status }}）。
          </p>
          <p v-else>通过：加油车「{{ releaseRow['加油车号'] }}」在「{{ busyStatuses.join('、') }}」时段内无其他作业。</p>
        </div>

        <p v-if="releaseError" class="error-text">{{ releaseError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeRelease">取消</button>
          <button class="btn primary" type="button" @click="confirmRelease">核对通过，开始加注</button>
        </div>
      </div>
    </div>

    <!-- 提交确认：登记加注量 -->
    <div v-if="amountRow" class="modal-mask" @click.self="closeAmount">
      <div class="modal">
        <h3>提交确认 · 登记加注量（{{ amountRow['作业编号'] }}）</h3>
        <p class="modal-hint">
          机型「{{ amountRow['机型'] }}」加注量合理区间上限
          <strong>{{ ruleOf(String(amountRow['机型']))?.maxAmount }}L</strong>。
        </p>
        <label class="amount-field">
          <span>本次加注量 (L) *</span>
          <input v-model="amountInput" type="number" min="0" step="1" placeholder="按加油车计量读数填写" />
        </label>
        <p class="form-hint">{{ amountBasis }}</p>
        <div v-if="amountOver" class="over-limit-box">
          <strong>超限提示（依据《航油加注放行规则》）</strong>
          <p>{{ amountBasis }}</p>
          <label class="force-line">
            <input type="checkbox" v-model="forceConfirmed" />
            <span>我已知晓加注量超过机型「{{ amountRow['机型'] }}」合理区间上限，确认强行提交，并在作业记录与台账上留痕</span>
          </label>
        </div>
        <p v-if="amountError" class="error-text">{{ amountError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeAmount">取消</button>
          <button class="btn" :class="forceConfirmed ? 'danger' : 'primary'" type="button" @click="submitAmount">
            {{ amountOver ? (forceConfirmed ? '强行提交并留痕' : '超限，请先确认风险') : '提交确认' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
} from '@/api/local-service'
import {
  confirmFueling,
  createFuelJob,
  fuelingStats,
  listFuelJobs,
  startFueling,
  submitFuelAmount,
} from '@/api/fuel-service'
import {
  FUEL_RULES,
  FUEL_SPECS,
  FUELING_FLOW,
  GROUND_CHECK_ITEMS,
  TRUCK_BUSY_STATUSES,
  aircraftFuelRule,
  evaluateRelease,
  flowStep,
  groundingPassedCount,
  isAmountOverLimit,
  isSpecMatched,
  overLimitBasis,
  type GroundCheckResult,
} from '@/data/fuel-rules'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('fueling')
const columns = meta.fields
const statuses = [...FUELING_FLOW]
const fuelRules = FUEL_RULES
const fuelSpecs = FUEL_SPECS
const groundItems = GROUND_CHECK_ITEMS
const busyStatuses = TRUCK_BUSY_STATUSES
const flow = [...FUELING_FLOW]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const showRules = ref(false)
const stats = ref<{ label: string; value: number }[]>([])

const statusSummary = computed(() =>
  statuses.map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function allowedAction(row: EntryRow): string | null {
  return flowStep(String(row.status))?.action ?? null
}

function overTrail(row: EntryRow): boolean {
  return String(row['超限留痕'] ?? '').startsWith('【超限强行提交】')
}

function ruleOf(aircraft: string) {
  return aircraftFuelRule(aircraft)
}

function specMatched(aircraft: string, spec: string): boolean {
  return isSpecMatched(aircraft, spec)
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function reload() {
  errorMessage.value = ''
  const payload = listFuelJobs(filters.value)
  rows.value = payload.items
  total.value = payload.total
  stats.value = fuelingStats()
}

// ---- 登记 ----
const createOpen = ref(false)
const createError = ref('')
const createForm = reactive({ 航班号: '', 机型: '', 油品规格: '', 加油车号: '', 作业人员: '' })

function openCreate() {
  Object.assign(createForm, { 航班号: '', 机型: '', 油品规格: '', 加油车号: '', 作业人员: '' })
  createError.value = ''
  createOpen.value = true
}

function closeCreate() {
  createOpen.value = false
}

function submitCreate() {
  createError.value = ''
  const result = createFuelJob({ ...createForm })
  if (!result.ok) {
    createError.value = result.message
    return
  }
  createOpen.value = false
  reload()
  errorMessage.value = result.message
}

// ---- 开始加注（放行核对） ----
const releaseRow = ref<EntryRow | null>(null)
const releaseError = ref('')
const groundResults = ref<GroundCheckResult[]>([])
const releaseEval = ref<ReturnType<typeof evaluateRelease> | null>(null)

function openRelease(row: EntryRow) {
  releaseRow.value = row
  releaseError.value = ''
  groundResults.value = GROUND_CHECK_ITEMS.map((item) => ({
    code: item.code,
    passed: false,
  }))
  releaseEval.value = evaluateRelease(row, listEntries('fueling').items, groundResults.value)
}

function closeRelease() {
  releaseRow.value = null
  releaseEval.value = null
}

function isGroundPassed(code: string): boolean {
  return groundResults.value.some((item) => item.code === code && item.passed)
}

function toggleGround(code: string, passed: boolean) {
  groundResults.value = groundResults.value.map((item) =>
    item.code === code ? { ...item, passed } : item,
  )
  if (releaseRow.value) {
    releaseEval.value = evaluateRelease(releaseRow.value, listEntries('fueling').items, groundResults.value)
  }
}

const groundingPassed = computed(() => groundingPassedCount(groundResults.value))

function confirmRelease() {
  if (!releaseRow.value) {
    return
  }
  releaseError.value = ''
  const result = startFueling(Number(releaseRow.value.id), groundResults.value)
  if (!result.ok) {
    releaseError.value = result.message
    return
  }
  closeRelease()
  reload()
  errorMessage.value = result.message
}

// ---- 提交确认（加注量） ----
const amountRow = ref<EntryRow | null>(null)
const amountInput = ref('')
const amountError = ref('')
const forceConfirmed = ref(false)

function openAmount(row: EntryRow) {
  amountRow.value = row
  amountInput.value = ''
  amountError.value = ''
  forceConfirmed.value = false
}

function closeAmount() {
  amountRow.value = null
}

const amountValue = computed(() => Number(amountInput.value))
const amountOver = computed(
  () => amountRow.value !== null && amountInput.value !== '' && isAmountOverLimit(String(amountRow.value['机型']), amountValue.value),
)
const amountBasis = computed(() =>
  amountRow.value && amountInput.value !== '' && Number.isFinite(amountValue.value) && amountValue.value > 0
    ? overLimitBasis(String(amountRow.value['机型']), amountValue.value)
    : '超过该机型上限时系统将给出提示并写明依据；强行提交会在作业记录与油料需求台账上留痕。',
)

function submitAmount() {
  if (!amountRow.value) {
    return
  }
  amountError.value = ''
  const result = submitFuelAmount(Number(amountRow.value.id), amountInput.value, forceConfirmed.value)
  if (!result.ok) {
    amountError.value = result.message
    return
  }
  closeAmount()
  reload()
  errorMessage.value = result.message
}

// ---- 确认完成（落入台账） ----
function complete(row: EntryRow) {
  errorMessage.value = ''
  const result = confirmFueling(Number(row.id))
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
  errorMessage.value = result.message
}

onMounted(reload)
</script>
