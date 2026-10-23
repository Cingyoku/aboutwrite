<script setup>
import { ref, reactive, watch, nextTick, computed } from 'vue'
import { store, countWords } from '../store'
import { exportArticle } from '../export'
import DocPanel from './DocPanel.vue'
import RelationsPanel from './RelationsPanel.vue'
import TimelinePanel from './TimelinePanel.vue'

const article = computed(() => store.current)

const expanded = reactive(new Set())
const showContent = ref(false)

const cols = [
  { key: 'relations', type: 'relations', title: '人物关系', comp: RelationsPanel, hint: '人物、阵营与关系的可视化图' },
  { key: 'doc', type: 'doc', title: '章节', comp: DocPanel, hint: '自由书写的章节文本窗口' },
  { key: 'timeline', type: 'timeline', title: '时间轴', comp: TimelinePanel, hint: '可拖拽排序的事件文段' }
]

const widths = reactive({ relations: 400, doc: 470, timeline: 430 })
const status = reactive({ relations: 'normal', doc: 'normal', timeline: 'normal' })

const maximizedKey = computed(() => cols.find((c) => status[c.key] === 'max')?.key || null)
const normalKeys = computed(() => cols.filter((c) => status[c.key] === 'normal').map((c) => c.key))

function colStyle(col) {
  if (maximizedKey.value === col.key) return { flex: '1 1 auto' }
  if (status[col.key] === 'min') return { flex: '0 0 44px' }
  const normals = normalKeys.value
  if (normals.length && normals[normals.length - 1] === col.key) {
    return { flex: `1 1 ${widths[col.key]}px`, minWidth: '280px' }
  }
  return { flex: `0 0 ${widths[col.key]}px` }
}

function sepBefore(col) {
  if (maximizedKey.value || status[col.key] !== 'normal') return false
  const idx = cols.findIndex((c) => c.key === col.key)
  for (let i = idx - 1; i >= 0; i--) {
    if (status[cols[i].key] === 'normal') return true
    if (status[cols[i].key] === 'max') return false
  }
  return false
}

function sepDown(e, col) {
  const idx = cols.findIndex((c) => c.key === col.key)
  let leftKey = null
  for (let i = idx - 1; i >= 0; i--) {
    if (status[cols[i].key] === 'normal') {
      leftKey = cols[i].key
      break
    }
  }
  if (!leftKey) return
  const startX = e.clientX
  const w0 = widths[leftKey]
  const move = (ev) => {
    widths[leftKey] = Math.max(280, Math.min(1400, w0 + ev.clientX - startX))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  e.preventDefault()
}

function setStatus(key, val) {
  status[key] = val
}

const totalWords = computed(
  () =>
    article.value?.children
      .filter((c) => c.type === 'doc')
      .reduce((s, d) => s + countWords(d.content), 0) || 0
)

const showExport = ref(false)
const exportParts = reactive({ chapters: true, relations: true, timeline: true })
const exporting = ref(false)

async function doArticleExport() {
  exporting.value = true
  try {
    await exportArticle(article.value, { ...exportParts })
    showExport.value = false
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  } finally {
    exporting.value = false
  }
}

const creating = ref('')
const newTitle = ref('')

function startCreate(type) {
  creating.value = type
  newTitle.value = ''
}

function confirmCreate(type) {
  const col = cols.find((c) => c.type === type)
  const t = newTitle.value.trim() || col.title
  const child = store.addChild(article.value.id, type, t)
  creating.value = ''
  newTitle.value = ''
  if (child) {
    expanded.add(child.id)
    scrollChild(child.id)
  }
}

function cancelCreate() {
  creating.value = ''
  newTitle.value = ''
}

function countOf(type) {
  return article.value.children.filter((c) => c.type === type).length
}

function scrollChild(childId) {
  nextTick(() => {
    const el = document.querySelector(`[data-child-id="${childId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

watch(
  () => store.focus,
  (f) => {
    if (!f || !article.value) return
    expanded.add(f.childId)
    scrollChild(f.childId)
  }
)
</script>

<template>
  <div v-if="article" class="ws-root" style="display: flex; flex-direction: column; flex: 1; min-height: 0">
    <div class="ws-head">
      <input
        class="ws-title"
        v-model="article.title"
        placeholder="文章标题"
        @input="article.updatedAt = Date.now()"
      />
      <span class="word-total" title="全部章节字数合计">章节总字数：{{ totalWords }}</span>
      <button class="btn small" @click="showContent = !showContent">{{ showContent ? '收起正文' : '文章正文' }}</button>
      <button class="btn small" @click="showExport = !showExport">导出</button>
    </div>

    <div v-if="showContent" class="ws-content">
      <textarea v-model="article.content" placeholder="文章正文（母任务内容）..." @input="article.updatedAt = Date.now()"></textarea>
    </div>

    <div v-if="showExport" class="ws-export">
      <span class="exp-title">导出文章内容（.rtf 单一文档）：</span>
      <label class="exp-opt"><input type="checkbox" v-model="exportParts.chapters" /> 章节全部内容（合并为一个文档）</label>
      <label class="exp-opt"><input type="checkbox" v-model="exportParts.relations" /> 人物关系</label>
      <label class="exp-opt"><input type="checkbox" v-model="exportParts.timeline" /> 时间轴</label>
      <button class="btn small primary" :disabled="exporting" @click="doArticleExport">
        {{ exporting ? '导出中...' : '确认导出' }}
      </button>
    </div>

    <div class="ws-body">
      <template v-for="col in cols" :key="col.key">
        <div v-if="sepBefore(col)" class="col-sep" @pointerdown="sepDown($event, col)"></div>

        <section
          v-show="!maximizedKey || maximizedKey === col.key"
          class="col"
          :class="{ mini: status[col.key] === 'min' }"
          :style="colStyle(col)"
        >
          <template v-if="status[col.key] === 'min'">
            <div class="mini-bar" @click="setStatus(col.key, 'normal')">
              <span class="mini-title">{{ col.title }}<span class="count">{{ countOf(col.type) }}</span></span>
              <button class="icon-btn" title="还原" @click.stop="setStatus(col.key, 'normal')">▢</button>
            </div>
          </template>
          <template v-else>
            <div class="col-head">
              <span class="col-title">{{ col.title }}<span class="count">{{ countOf(col.type) }}</span></span>
              <span class="col-tools">
                <template v-if="maximizedKey === col.key">
                  <button class="btn tiny" @click="setStatus(col.key, 'normal')">还原</button>
                </template>
                <template v-else>
                  <button class="icon-btn" title="最小化" @click="setStatus(col.key, 'min')">—</button>
                  <button class="icon-btn" title="最大化" @click="setStatus(col.key, 'max')">□</button>
                </template>
              </span>
              <button
                v-if="maximizedKey !== col.key"
                class="btn small"
                @click="creating === col.type ? cancelCreate() : startCreate(col.type)"
              >
                {{ creating === col.type ? '取消' : '+ 新建' }}
              </button>
            </div>

            <div v-if="creating === col.type" class="create-form">
              <input
                v-model="newTitle"
                :placeholder="`输入${col.title}标题（留空则用默认名）`"
                @keyup.enter="confirmCreate(col.type)"
              />
              <button class="btn small primary" @click="confirmCreate(col.type)">确定</button>
            </div>

            <div class="col-body">
              <component :is="col.comp" :article="article" :expanded="expanded" />
              <div v-if="countOf(col.type) === 0" class="col-empty">
                暂无{{ col.title }}
                <div class="rel-hint">{{ col.hint }}</div>
              </div>
            </div>
          </template>
        </section>
      </template>
    </div>
  </div>
</template>
