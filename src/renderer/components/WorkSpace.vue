<script setup>
import { ref, reactive, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { store, countWords, FONT_SIZES } from '../store'
import {
  buildArticleRtf,
  saveFile,
  saveFiles,
  buildRelationsSvg,
  buildTimelineSvg,
  relationsToCsv,
  timelineToCsv,
  rtfToText,
  parseTableText,
  detectTableKind,
  parseRelationsTable,
  parseTimelineTable,
  exportChaptersPdf
} from '../export'
import DocPanel from './DocPanel.vue'
import RelationsPanel from './RelationsPanel.vue'
import TimelinePanel from './TimelinePanel.vue'

const article = computed(() => store.current)

const expanded = reactive(new Set())
const showContent = ref(false)

const cols = [
  { key: 'relations', type: 'relations', title: '人物关系', comp: RelationsPanel },
  { key: 'doc', type: 'doc', title: '章节', comp: DocPanel },
  { key: 'timeline', type: 'timeline', title: '时间轴', comp: TimelinePanel }
]

// 列宽使用弹性权重，默认 人物关系 : 章节 : 时间轴 = 1 : 2 : 1
const widths = reactive({ relations: 1, doc: 2, timeline: 1 })
// 面板状态：open 显示 / off 收起（工作区移除，靠边栏可还原）/ max 全屏
const status = reactive({ relations: 'open', doc: 'open', timeline: 'open' })

// 章节逆序显示开关（「顺序」功能键，默认关闭 = 正序）
const docReversed = ref(false)
// 章节列头「导出」：打开 DocPanel 内嵌导出面板
const docExportOpen = ref(false)

const inspOpen = ref(false)
const inspViewId = ref(null)

const maximizedKey = computed(() => cols.find((c) => status[c.key] === 'max')?.key || null)

function colStyle(col) {
  if (maximizedKey.value === col.key) return { flex: '1 1 auto' }
  return { flex: `${widths[col.key]} 1 0%` }
}

function sepBefore(col) {
  if (maximizedKey.value || status[col.key] !== 'open') return false
  const idx = cols.findIndex((c) => c.key === col.key)
  for (let i = idx - 1; i >= 0; i--) {
    if (status[cols[i].key] === 'open') return true
    if (status[cols[i].key] === 'max') return false
  }
  return false
}

function sepDown(e, col) {
  const idx = cols.findIndex((c) => c.key === col.key)
  let leftKey = null
  for (let i = idx - 1; i >= 0; i--) {
    if (status[cols[i].key] === 'open') {
      leftKey = cols[i].key
      break
    }
  }
  if (!leftKey) return
  const leftEl = document.querySelector(`[data-col-key="${leftKey}"]`)
  if (!leftEl) return
  const startX = e.clientX
  const startW = leftEl.getBoundingClientRect().width
  const pxPerWeight = startW / widths[leftKey]
  const pair = widths[leftKey] + widths[col.key]
  // 280px 最小宽度换算成权重单位；保证上限不低于下限
  const minW = 280 / pxPerWeight
  const move = (ev) => {
    let w = (startW + ev.clientX - startX) / pxPerWeight
    w = Math.min(Math.max(w, minW), Math.max(pair - minW, minW))
    widths[leftKey] = Math.round(w * 100) / 100
    widths[col.key] = Math.round((pair - w) * 100) / 100
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

function toggleCol(key) {
  status[key] = status[key] === 'open' ? 'off' : 'open'
}

function toggleInsp() {
  if (maximizedKey.value) return
  inspOpen.value = !inspOpen.value
  inspViewId.value = null
}

function toggleIndent() {
  store.updateDocFormat(article.value.id, { indent: !article.value.docFormat.indent })
}

function setFontSize(s) {
  store.updateDocFormat(article.value.id, { fontSize: s })
}

// 选中文本的加粗 / 斜体（作用于章节富文本编辑器中的当前选区）
const boldOn = ref(false)
const italicOn = ref(false)

function updateFmtState() {
  try {
    const sel = document.getSelection()
    const inEditor = !!sel?.anchorNode?.parentElement?.closest?.('.rich-editor')
    boldOn.value = inEditor && document.queryCommandState('bold')
    italicOn.value = inEditor && document.queryCommandState('italic')
  } catch (err) {
    /* noop */
  }
}

onMounted(() => document.addEventListener('selectionchange', updateFmtState))
onBeforeUnmount(() => document.removeEventListener('selectionchange', updateFmtState))

function applyCmd(cmd) {
  const sel = document.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    window.alert('请先在章节文本中选中要设置格式的内容')
    return
  }
  document.execCommand(cmd, false, null)
  updateFmtState()
}

const totalWords = computed(
  () =>
    article.value?.children
      .filter((c) => c.type === 'doc')
      .reduce((s, d) => s + countWords(d.content), 0) || 0
)

const showExport = ref(false)
const exportParts = reactive({ chapters: true, relations: true, timeline: true })
const exportFmt = reactive({ chapters: 'rtf', relations: 'svg', timeline: 'svg' })
const exporting = ref(false)
const anyExportPart = computed(() => exportParts.chapters || exportParts.relations || exportParts.timeline)

// 关系 / 时间轴按所选格式生成文件列表（每图 / 每轴一个文件）
function relationFiles(type, fmt) {
  const a = article.value
  const list = a.children.filter((c) => c.type === type)
  const label = type === 'relations' ? '人物关系' : '时间轴'
  if (!list.length) throw new Error(`暂无${label}可导出`)
  return list.map((c) => {
    const name = (c.title || label).replace(/[\\/:*?"<>|]/g, '_')
    if (fmt === 'csv') {
      return {
        name: `${name}.csv`,
        data: type === 'relations' ? relationsToCsv(c) : timelineToCsv(c, a),
        mime: 'text/csv;charset=utf-8'
      }
    }
    return {
      name: `${name}.svg`,
      data: type === 'relations' ? buildRelationsSvg(c) : buildTimelineSvg(c, a),
      mime: 'image/svg+xml'
    }
  })
}

async function doArticleExport() {
  const a = article.value
  const base = (a.title || '文章').replace(/[\\/:*?"<>|]/g, '_')
  exporting.value = true
  try {
    const files = []
    let pdfDone = false
    if (exportParts.chapters) {
      const docs = a.children.filter((c) => c.type === 'doc')
      if (!docs.length) throw new Error('暂无章节可导出')
      if (exportFmt.chapters === 'pdf') {
        await exportChaptersPdf(docs, `${base}-全书`, a.docFormat)
        pdfDone = true
      } else {
        files.push({
          name: `${base}-全书.rtf`,
          data: buildArticleRtf(a, { chapters: true, relations: false, timeline: false }),
          mime: 'application/rtf'
        })
      }
    }
    if (exportParts.relations) files.push(...relationFiles('relations', exportFmt.relations))
    if (exportParts.timeline) files.push(...relationFiles('timeline', exportFmt.timeline))
    if (files.length === 1) {
      await saveFile(files[0].name, files[0].data, files[0].mime)
    } else if (files.length > 1) {
      const res = await saveFiles(files)
      if (res?.saved && res.paths?.length) window.alert(`已导出 ${res.paths.length} 个文件到：${res.folder}`)
    }
    showExport.value = false
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  } finally {
    exporting.value = false
  }
}

const creating = ref('')
const newTitle = ref('')

// ---------- 顶部导入（人物关系 / 时间轴表格，按表头自动识别类型） ----------
function startImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.rtf,.csv,.svc'
  input.onchange = () => {
    const file = input.files?.[0]
    input.value = ''
    handleImportFile(file)
  }
  input.click()
}

function handleImportFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      let text = String(reader.result || '')
      if (/\.rtf$/i.test(file.name)) text = rtfToText(text)
      const table = parseTableText(text)
      if (!table || !table.rows.length) throw new Error('文件中没有可识别的表格内容')
      const kind = detectTableKind(table.headers)
      if (kind !== 'relations' && kind !== 'timeline') {
        throw new Error('无法识别表格类型（需要人物关系或时间轴表头）')
      }
      if (kind === 'relations') {
        const data = parseRelationsTable(table)
        if (!data || !data.persons.length) throw new Error('未识别到人物（需要「人物名称」表头列）')
        const child = store.importRelations(article.value.id, data)
        if (child) {
          expanded.add(child.id)
          scrollChild(child.id)
        }
        window.alert(`导入完成：${data.persons.length} 个人物，${data.edges.length} 条关系`)
      } else {
        const groups = parseTimelineTable(table)
        if (!groups.length) throw new Error('未识别到文段（需要「事件」表头列）')
        const created = store.importTimeline(article.value.id, groups)
        if (created.length) {
          expanded.add(created[0].id)
          scrollChild(created[0].id)
        }
        const count = groups.reduce((n, g) => n + g.segments.length, 0)
        window.alert(`导入完成：${created.length} 个时间轴，${count} 个文段`)
      }
    } catch (err) {
      window.alert('导入失败：' + (err.message || err))
    }
  }
  reader.onerror = () => window.alert('导入失败：无法读取文件')
  reader.readAsText(file, 'utf-8')
}

function startCreate(type) {
  creating.value = type
  newTitle.value = ''
}

// 人物关系：点击新建直接创建（无需标题），随后在卡片内直接添加人物、阵营
function directCreateRelations() {
  const child = store.addChild(article.value.id, 'relations', '')
  if (!child) return
  expanded.add(child.id)
  scrollChild(child.id)
}

// 时间轴：点击列头新建直接向现有时间轴追加文段；没有时间轴时先创建一个
function headCreateTimeline() {
  const tls = article.value.children.filter((c) => c.type === 'timeline')
  let tl = tls[tls.length - 1]
  if (!tl) {
    tl = store.addChild(article.value.id, 'timeline', '')
    if (!tl) return
  }
  expanded.add(tl.id)
  scrollChild(tl.id)
  store.segFocus = { tlId: tl.id, ts: Date.now() }
}

function headCreate(col) {
  if (col.type === 'doc') {
    creating.value === 'doc' ? cancelCreate() : startCreate('doc')
  } else if (col.type === 'relations') {
    directCreateRelations()
  } else {
    headCreateTimeline()
  }
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

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

watch(
  () => store.focus,
  (f) => {
    if (!f || !article.value) return
    expanded.add(f.childId)
    nextTick(() => {
      // 指定了文段时定位到具体条目并短暂高亮，否则定位到子项目卡片
      const el = f.segId
        ? document.querySelector(`[data-seg-id="${f.segId}"]`)
        : document.querySelector(`[data-child-id="${f.childId}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (f.segId && el) {
        el.classList.add('seg-flash')
        setTimeout(() => el.classList.remove('seg-flash'), 1800)
      }
    })
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
      <button class="btn small" @click="showContent = !showContent">{{ showContent ? '收起大纲' : '大纲' }}</button>
      <button class="btn small" title="导入人物关系或时间轴表格文件（.rtf / .csv / .svc，自动识别类型）" @click="startImport()">导入</button>
      <button class="btn small" @click="showExport = !showExport">导出</button>
    </div>

    <div v-if="showContent" class="ws-content">
      <textarea v-model="article.content" placeholder="文章大纲（母任务内容）..." @input="article.updatedAt = Date.now()"></textarea>
    </div>

    <div v-if="showExport" class="ws-export">
      <span class="exp-title">导出文章内容：</span>
      <label class="exp-opt">
        <input type="checkbox" v-model="exportParts.chapters" /> 章节全部内容（合并为一个文档）
        <select v-model="exportFmt.chapters">
          <option value="rtf">.rtf</option>
          <option value="pdf">.pdf</option>
        </select>
      </label>
      <label class="exp-opt">
        <input type="checkbox" v-model="exportParts.relations" /> 人物关系
        <select v-model="exportFmt.relations">
          <option value="svg">.svg</option>
          <option value="csv">.csv</option>
        </select>
      </label>
      <label class="exp-opt">
        <input type="checkbox" v-model="exportParts.timeline" /> 时间轴
        <select v-model="exportFmt.timeline">
          <option value="svg">.svg</option>
          <option value="csv">.csv</option>
        </select>
      </label>
      <button class="btn small primary" :disabled="exporting || !anyExportPart" @click="doArticleExport">
        {{ exporting ? '导出中...' : '确认导出' }}
      </button>
    </div>

    <div class="ws-main">
      <aside class="side-bar">
        <span class="side-label">面板</span>
        <button
          class="side-item"
          :class="{ on: inspOpen }"
          :disabled="!!maximizedKey"
          :title="maximizedKey ? '还原全屏后可查看灵感' : '查看我的灵感'"
          @click="toggleInsp"
        >
          <span class="side-dot"></span>灵感
        </button>
        <button class="side-item" :class="{ on: status.relations !== 'off' }" @click="toggleCol('relations')">
          <span class="side-dot"></span>人物关系
        </button>
        <button class="side-item" :class="{ on: status.timeline !== 'off' }" @click="toggleCol('timeline')">
          <span class="side-dot"></span>时间轴
        </button>

        <div class="side-sep"></div>
        <span class="side-label">文本格式</span>
        <button class="side-item" :class="{ on: article.docFormat.indent }" @click="toggleIndent">
          首行缩进
        </button>
        <button
          class="side-item"
          :class="{ on: boldOn }"
          title="对章节中选中的内容加粗"
          @mousedown.prevent
          @click="applyCmd('bold')"
        >
          加粗
        </button>
        <button
          class="side-item"
          :class="{ on: italicOn }"
          title="对章节中选中的内容斜体"
          @mousedown.prevent
          @click="applyCmd('italic')"
        >
          斜体
        </button>
        <span class="side-label">字号</span>
        <button
          v-for="s in FONT_SIZES"
          :key="s"
          class="side-item size"
          :class="{ on: article.docFormat.fontSize === s }"
          @click="setFontSize(s)"
        >
          {{ s }} 号
        </button>
      </aside>

      <div class="ws-body">
        <template v-for="col in cols" :key="col.key">
          <div
            v-if="status[col.key] === 'open' && sepBefore(col)"
            class="col-sep"
            @pointerdown="sepDown($event, col)"
          ></div>

          <section
            v-if="status[col.key] !== 'off'"
            v-show="!maximizedKey || maximizedKey === col.key"
            class="col"
            :class="{ maxed: maximizedKey === col.key }"
            :data-col-key="col.key"
            :style="colStyle(col)"
          >
            <div class="col-head">
              <span class="col-title">{{ col.title }}<span class="count">{{ countOf(col.type) }}</span></span>
              <span class="col-tools">
                <template v-if="maximizedKey === col.key">
                  <button class="btn tiny" @click="setStatus(col.key, 'open')">还原</button>
                </template>
                <template v-else>
                  <button
                    v-if="col.key !== 'doc' && col.key !== 'relations'"
                    class="icon-btn"
                    title="收起（左侧靠边栏可还原）"
                    @click="setStatus(col.key, 'off')"
                  >—</button>
                  <button
                    v-if="col.key !== 'doc'"
                    class="icon-btn"
                    title="全屏"
                    @click="setStatus(col.key, 'max')"
                  >□</button>
                </template>
              </span>
              <button
                v-if="col.key === 'doc' && maximizedKey !== col.key"
                class="btn small"
                :class="{ primary: docReversed }"
                :title="docReversed ? '当前为逆序显示，点击恢复正序' : '逆序显示章节'"
                @click="docReversed = !docReversed"
              >
                顺序
              </button>
              <button
                v-if="col.key === 'doc' && maximizedKey !== col.key"
                class="btn small"
                title="导出章节内容（全部 / 指定文本窗口，.docx / .md / .rtf / .png）"
                @click="docExportOpen = !docExportOpen"
              >
                导出
              </button>
              <button
                v-if="col.key === 'relations' && maximizedKey !== col.key"
                class="btn small"
                title="将所有人物移动到视野中央"
                @click="store.relFitTick++"
              >
                居中视图
              </button>
              <button
                v-if="maximizedKey !== col.key"
                class="btn small"
                @click="headCreate(col)"
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
              <component
                :is="col.comp"
                :article="article"
                :expanded="expanded"
                :reversed="col.key === 'doc' ? docReversed : undefined"
                :export-open="col.key === 'doc' ? docExportOpen : undefined"
                @close-export="docExportOpen = false"
              />
              <div v-if="countOf(col.type) === 0" class="col-empty">暂无{{ col.title }}</div>
            </div>
          </section>
        </template>
      </div>

      <div v-if="inspOpen && !maximizedKey" class="insp-float">
        <div class="float-head">
          <span class="float-title">我的灵感<span class="count">{{ store.data.inspirations.length }}</span></span>
          <button class="icon-btn" title="关闭灵感面板" @click="toggleInsp">✕</button>
        </div>
        <div class="float-body">
          <div v-if="store.data.inspirations.length === 0" class="float-empty">
            还没有灵感。回到主页「我的灵感」即可创建，创建后会在这里显示。
          </div>
          <div
            v-for="i in store.data.inspirations"
            :key="i.id"
            class="float-item"
            :class="{ open: inspViewId === i.id }"
          >
            <div class="fi-head" @click="inspViewId = inspViewId === i.id ? null : i.id">
              <span class="fi-title">{{ i.title || '（未命名灵感）' }}</span>
              <span class="fi-meta">{{ fmtDate(i.updatedAt) }}</span>
            </div>
            <div v-if="inspViewId === i.id" class="fi-content" v-html="i.content || '（暂无内容，可在主页中编辑）'"></div>
          </div>
        </div>
        <div class="float-foot">内容为只读预览，编辑请回到主页「我的灵感」。</div>
      </div>
    </div>
  </div>
</template>
