<template>
  <section class="page" data-module="fuelledger">
    <header class="page-head">
      <div>
        <h2>油料需求台账</h2>
        <p class="page-desc">{{ meta.desc }}</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="consistency-line" :class="allConsistent ? 'ok' : 'bad'">
      用量一致性核对：台账每条「实际加注量」均回对加油作业记录的「加注量」——
      <strong>{{ consistentCount }}/{{ rows.length }} 条一致</strong>
      （口径：台账用量只取作业记录，调度这条线读到的用量不能与作业记录两样）。
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>与作业记录核对</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-abnormal': row.abnormal }">
          <td v-for="column in columns" :key="column" :title="String(row[column] ?? '')" class="cell-ellipsis">
            {{ row[column] ?? '—' }}
          </td>
          <td>
            <span class="status-tag" :class="checkRow(row) ? 'status-ok' : 'status-danger'">
              {{ checkRow(row) ? `一致（作业记录 ${row['实际加注量']}L）` : '不一致：' + diffText(row) }}
            </span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 1" class="empty-state">
            台账暂无记录：加油作业「确认完成」后自动入账，同一作业重复提交只入账一次
          </td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条台账记录 · 台账不允许手工新增或改动</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import { ledgerStats, listLedger } from '@/api/fuel-service'
import { listRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('fuelledger')
const columns = meta.fields

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 4)
const stats = ref<{ label: string; value: number }[]>([])

function checkRow(row: EntryRow): boolean {
  const job = listRows('fueling').find((item) => String(item['作业编号']) === String(row['作业编号']))
  return Boolean(job) && Number(job?.['加注量']) === Number(row['实际加注量']) && String(job?.status) === '已完成'
}

function diffText(row: EntryRow): string {
  const job = listRows('fueling').find((item) => String(item['作业编号']) === String(row['作业编号']))
  if (!job) {
    return '找不到对应作业记录'
  }
  return `作业记录为 ${job['加注量']}L（状态：${job.status}）`
}

const consistentCount = computed(() => rows.value.filter(checkRow).length)
const allConsistent = computed(() => rows.value.length === 0 || consistentCount.value === rows.value.length)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listLedger(filters.value)
    rows.value = payload.items
    total.value = payload.total
    stats.value = ledgerStats()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '油料需求台账读取失败'
  }
}

onMounted(reload)
</script>
