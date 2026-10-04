<template>
  <section class="page" data-module="fuel-ledger">
    <header class="page-head">
      <div>
        <h2>油料需求台账</h2>
        <p class="page-desc">
          台账由「已完成」加油作业自动计入，无独立登记入口；调度线读取的加注量与作业记录同源，超限记录带依据与规则版本。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出台账清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>航班号 / 作业编号</span>
        <input v-model="keyword" placeholder="按航班号或作业编号检索" />
      </label>
      <label class="filter-item">
        <span>机型</span>
        <input v-model="modelFilter" placeholder="按机型检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in entries" :key="row.作业编号" :class="{ 'row-overlimit': row.超限标记 !== '正常' }">
          <td>{{ row.作业编号 }}</td>
          <td>{{ row.航班号 }}</td>
          <td>{{ row.机型 }}</td>
          <td>{{ row.需求油品规格 }}</td>
          <td>{{ row.核定上限 }}</td>
          <td>{{ row.实际加注量 }}</td>
          <td>{{ row.加油车号 }}</td>
          <td>{{ row.作业人员 }}</td>
          <td>{{ row.作业日期 }}</td>
          <td>{{ row.完成时间 }}</td>
          <td>
            <span :class="['badge', row.超限标记 === '正常' ? 'badge-ok' : 'badge-warn']">{{ row.超限标记 }}</span>
          </td>
          <td class="basis-cell">{{ row.超限依据 || '—' }}</td>
          <td>{{ row.规则版本 }}</td>
        </tr>
        <tr v-if="!entries.length">
          <td :colspan="columns.length" class="empty-state">台账暂无数据，加油作业确认完成后自动计入</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ entries.length }} 条台账记录 · 统计口径引用《{{ rule.title }}》{{ rule.version }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import { fuelLedger, fuelingStats } from '@/domain/fueling/service'
import { FUELING_RULE as rule } from '@/domain/fueling/rules'
import type { FuelLedgerEntry } from '@/domain/fueling/types'

const columns = [
  '作业编号', '航班号', '机型', '需求油品规格', '核定上限', '实际加注量',
  '加油车号', '作业人员', '作业日期', '完成时间', '超限标记', '超限依据', '规则版本',
]

const allEntries = ref<FuelLedgerEntry[]>([])
const keyword = ref('')
const modelFilter = ref('')

const entries = computed(() => {
  const kw = keyword.value.trim()
  const model = modelFilter.value.trim()
  return allEntries.value.filter((row) => {
    const hitKw = !kw || row.航班号.includes(kw) || row.作业编号.includes(kw)
    const hitModel = !model || row.机型.includes(model)
    return hitKw && hitModel
  })
})

const statCards = computed(() => {
  const stats = fuelingStats()
  return [
    { label: '已计入完成作业', value: stats.totalCompleted },
    { label: `本月台账用量（${rule.unit}）`, value: stats.monthAmount },
    { label: '超限留痕记录', value: stats.forcedOverLimit },
  ]
})

function reload() {
  allEntries.value = fuelLedger()
}

function resetFilters() {
  keyword.value = ''
  modelFilter.value = ''
  reload()
}

function exportRows() {
  downloadEntries('fuel_ledger')
}

onMounted(reload)
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
.badge-warn { background: #fff4e5; color: #b54708; border: 1px solid #f5d3a6; }
.row-overlimit { background: #fffbf5; }
.basis-cell { max-width: 320px; font-size: 12px; color: #b54708; }
</style>
