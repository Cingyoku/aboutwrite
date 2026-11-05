<script setup>
import { ref, computed } from 'vue'
import { store, dateKey } from '../store'

const stats = computed(() => store.data.stats || { words: {}, duration: {} })

const todayKey = dateKey()
const selected = ref(todayKey)

// 年度选项：数据中出现的年份 + 最近 5 年
const yearOptions = computed(() => {
  const set = new Set([new Date().getFullYear()])
  for (const k of Object.keys(stats.value.words || {})) {
    const y = Number(k.slice(0, 4))
    if (!Number.isNaN(y)) set.add(y)
  }
  return [...set].sort((a, b) => b - a)
})
const year = ref(new Date().getFullYear())

// 月历当前显示的年月
const ym = ref({ y: new Date().getFullYear(), m: new Date().getMonth() })

function wordsOf(k) {
  return stats.value.words?.[k] || 0
}
function durOf(k) {
  return stats.value.duration?.[k] || 0
}
function fmtDur(sec) {
  sec = Math.round(sec || 0)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h) return `${h} 小时 ${m} 分`
  if (m) return `${m} 分 ${s} 秒`
  return `${s} 秒`
}

const selWords = computed(() => wordsOf(selected.value))
const selDur = computed(() => fmtDur(durOf(selected.value)))

const yearWords = computed(() => {
  let s = 0
  for (const k of Object.keys(stats.value.words || {})) {
    if (k.startsWith(String(year.value))) s += stats.value.words[k]
  }
  return s
})
const yearDur = computed(() => {
  let s = 0
  for (const k of Object.keys(stats.value.duration || {})) {
    if (k.startsWith(String(year.value))) s += stats.value.duration[k]
  }
  return fmtDur(s)
})
const totalWords = computed(() => {
  let s = 0
  for (const k of Object.keys(stats.value.words || {})) s += stats.value.words[k]
  return s
})
const totalDur = computed(() => {
  let s = 0
  for (const k of Object.keys(stats.value.duration || {})) s += stats.value.duration[k]
  return fmtDur(s)
})

const WEEKS = ['日', '一', '二', '三', '四', '五', '六']

const cells = computed(() => {
  const { y, m } = ym.value
  const offset = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const arr = []
  for (let i = 0; i < offset; i++) arr.push(null)
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    arr.push({ d, k, w: wordsOf(k) })
  }
  return arr
})

function prevMonth() {
  let { y, m } = ym.value
  m -= 1
  if (m < 0) {
    m = 11
    y -= 1
  }
  ym.value = { y, m }
}
function nextMonth() {
  let { y, m } = ym.value
  m += 1
  if (m > 11) {
    m = 0
    y += 1
  }
  ym.value = { y, m }
}
function goToday() {
  const now = new Date()
  ym.value = { y: now.getFullYear(), m: now.getMonth() }
  selected.value = dateKey()
}
</script>

<template>
  <div class="stats-panel">
    <div class="stat-grid">
      <div class="stat-item">
        <span>今日码字字数</span><b>{{ selWords }}</b>
      </div>
      <div class="stat-item">
        <span>今日码字时长</span><b>{{ selDur }}</b>
      </div>
      <div class="stat-item">
        <span>年度码字字数</span><b>{{ yearWords }}</b>
      </div>
      <div class="stat-item">
        <span>年度码字时长</span><b>{{ yearDur }}</b>
      </div>
      <div class="stat-item">
        <span>累计码字字数</span><b>{{ totalWords }}</b>
      </div>
      <div class="stat-item">
        <span>累计码字时长</span><b>{{ totalDur }}</b>
      </div>
    </div>

    <label class="stat-year">
      统计年份
      <select v-model.number="year">
        <option v-for="y in yearOptions" :key="y" :value="y">{{ y }} 年</option>
      </select>
    </label>

    <div class="cal-head">
      <button class="btn tiny" title="上一个月" @click="prevMonth">‹</button>
      <span class="cal-title">{{ ym.y }} 年 {{ ym.m + 1 }} 月</span>
      <button class="btn tiny" title="下一个月" @click="nextMonth">›</button>
    </div>
    <div class="cal-week">
      <span v-for="w in WEEKS" :key="w">{{ w }}</span>
    </div>
    <div class="cal-grid">
      <div
        v-for="(c, i) in cells"
        :key="i"
        class="cal-cell"
        :class="{ blank: !c, sel: c && c.k === selected, today: c && c.k === todayKey, has: c && c.w > 0 }"
        @click="c && (selected = c.k)"
      >
        <template v-if="c">
          <span class="cal-day">{{ c.d }}</span>
          <span v-if="c.w > 0" class="cal-words">{{ c.w }}</span>
        </template>
      </div>
    </div>
    <button class="btn tiny cal-back" @click="goToday">回到今天</button>
  </div>
</template>
