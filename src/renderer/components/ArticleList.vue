<script setup>
import { ref, reactive, computed } from 'vue'
import { store, countWords } from '../store'
import { htmlToPlain, buildArticleRtf, buildInspirationRtf, saveFiles } from '../export'
import StatsPanel from './StatsPanel.vue'

const title = ref('')
const inspTitle = ref('')

function create() {
  const t = title.value.trim()
  if (!t) return
  store.createArticle(t)
  title.value = ''
}

function del(article) {
  if (window.confirm(`删除文章「${article.title}」？其下全部子项目与文段将一并删除。`)) {
    store.deleteArticle(article.id)
  }
}

function createInsp() {
  // 标题留空也可新建，store 层默认命名为「未命名灵感」
  store.createInspiration(inspTitle.value.trim())
  inspTitle.value = ''
}

function delInsp(insp) {
  if (window.confirm(`删除灵感「${insp.title || '未命名灵感'}」？`)) {
    store.deleteInspiration(insp.id)
  }
}

// 批量模式：del=批量删除 / exp=批量导出，二者互斥，进入一个自动退出另一个
const mode = ref('')
const batchMode = computed(() => mode.value !== '')
const pickedA = reactive(new Set())
const pickedI = reactive(new Set())

const pickedCount = computed(() => pickedA.size + pickedI.size)
const totalCount = computed(() => store.data.articles.length + store.data.inspirations.length)

function toggleDel() {
  mode.value = mode.value === 'del' ? '' : 'del'
  clearSel()
}

function toggleExp() {
  mode.value = mode.value === 'exp' ? '' : 'exp'
  clearSel()
}

function toggleA(id) {
  if (pickedA.has(id)) pickedA.delete(id)
  else pickedA.add(id)
}

function toggleI(id) {
  if (pickedI.has(id)) pickedI.delete(id)
  else pickedI.add(id)
}

function selectAll() {
  store.data.articles.forEach((a) => pickedA.add(a.id))
  store.data.inspirations.forEach((i) => pickedI.add(i.id))
}

function clearSel() {
  pickedA.clear()
  pickedI.clear()
}

function delPicked() {
  if (!pickedCount.value) return
  if (window.confirm(`删除所选的 ${pickedCount.value} 项？文章及其全部子项目与文段将一并删除。`)) {
    for (const id of pickedA) store.deleteArticle(id)
    for (const id of pickedI) store.deleteInspiration(id)
    clearSel()
  }
}

function previewOf(content) {
  return htmlToPlain(content)
}

// ---------- 批量导出：勾选的每个文章 / 灵感分别导出为独立 .rtf ----------
function sanitizeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名'
}

const exporting = ref(false)

async function exportPicked() {
  if (!pickedCount.value || exporting.value) return
  exporting.value = true
  try {
    const files = []
    for (const id of pickedA) {
      const a = store.data.articles.find((x) => x.id === id)
      if (!a) continue
      try {
        files.push({ name: `${sanitizeName(a.title)}.rtf`, data: buildArticleRtf(a), mime: 'application/rtf' })
      } catch (err) {
        // 空文章无可导出内容，跳过
      }
    }
    for (const id of pickedI) {
      const i = store.data.inspirations.find((x) => x.id === id)
      if (!i) continue
      files.push({ name: `${sanitizeName(i.title || '未命名灵感')}.rtf`, data: buildInspirationRtf(i), mime: 'application/rtf' })
    }
    if (!files.length) {
      window.alert('所选项目都没有可导出的内容')
      return
    }
    const res = await saveFiles(files)
    if (res?.saved && res.paths?.length) {
      window.alert(`已导出 ${res.paths.length} 个 .rtf 文件到：${res.folder}`)
      clearSel()
    } else if (res?.canceled) {
      // 用户取消选择文件夹
    } else if (res?.error) {
      window.alert('导出失败：' + res.error)
    }
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  } finally {
    exporting.value = false
  }
}

// ---------- 本地导入：读取备份 .json 恢复数据 ----------
const importInput = ref(null)
const importMsg = ref('')
const importErr = ref(false)

function pickImport() {
  importInput.value?.click()
}

function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  importMsg.value = ''
  importErr.value = false
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''))
      if (!parsed || !Array.isArray(parsed.articles)) throw new Error('不是有效的备份数据（缺少 articles）')
      const aCount = parsed.articles.length
      const iCount = Array.isArray(parsed.inspirations) ? parsed.inspirations.length : 0
      if (!window.confirm(`导入该备份将覆盖当前全部数据（备份含 ${aCount} 篇文章、${iCount} 条灵感）。确定继续？`)) return
      store.replaceAll(parsed)
      importMsg.value = `已导入：${aCount} 篇文章、${iCount} 条灵感`
    } catch (err) {
      importErr.value = true
      importMsg.value = '导入失败：' + (err.message || err)
    }
  }
  reader.onerror = () => {
    importErr.value = true
    importMsg.value = '导入失败：无法读取文件'
  }
  reader.readAsText(file, 'utf-8')
}

const backuping = ref(false)
const backupMsg = ref('')
const backupErr = ref(false)

async function saveBackup() {
  if (backuping.value) return
  backuping.value = true
  backupMsg.value = ''
  backupErr.value = false
  try {
    const api = window.electronAPI
    if (!api?.saveBackup) {
      backupErr.value = true
      backupMsg.value = '当前环境不支持本地备份（请在桌面版中使用）。'
      return
    }
    const res = await api.saveBackup(JSON.parse(JSON.stringify(store.data)))
    if (res?.saved) {
      backupMsg.value = `已备份：${res.path}`
    } else if (res?.canceled) {
      backupMsg.value = ''
    } else {
      backupErr.value = true
      backupMsg.value = `备份失败：${res?.error || '未知错误'}`
    }
  } catch (err) {
    backupErr.value = true
    backupMsg.value = `备份失败：${err?.message || err}`
  } finally {
    backuping.value = false
  }
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<template>
  <div class="list-page">
    <div class="list-main">
      <div class="list-head">
        <h1>我的文章</h1>
        <div class="create-row">
          <input v-model="title" placeholder="输入文章标题，回车或点击按钮创建" @keyup.enter="create" />
          <button class="btn primary" @click="create">新建文章</button>
        </div>
      </div>

      <div v-if="store.data.articles.length === 0" class="empty">还没有文章。输入标题创建第一篇，文章下可以挂载章节、时间轴与人物关系。</div>

      <div class="article-grid">
        <div
          v-for="a in store.data.articles"
          :key="a.id"
          class="article-card"
          :class="{ picked: batchMode && pickedA.has(a.id) }"
          @click="batchMode ? toggleA(a.id) : store.openArticle(a.id)"
        >
          <label v-if="batchMode" class="pick-box" @click.stop>
            <input type="checkbox" :checked="pickedA.has(a.id)" @change="toggleA(a.id)" />
          </label>
          <div class="a-title">{{ a.title }}</div>
          <div class="a-meta">
            <span>{{ a.children.length }} 个子项目</span>
            <span>{{ fmtDate(a.updatedAt) }}</span>
          </div>
          <div class="a-actions" @click.stop>
            <button class="btn small" @click="store.openArticle(a.id)">打开</button>
            <button class="btn small danger" @click="del(a)">删除</button>
          </div>
        </div>
      </div>

      <div class="home-section">
        <div class="list-head insp-head">
          <h1>我的灵感</h1>
          <div class="create-row">
            <input v-model="inspTitle" placeholder="记录一个灵感，回车快速保存" @keyup.enter="createInsp" />
            <button class="btn primary" @click="createInsp">+ 新建灵感</button>
          </div>
        </div>

        <div v-if="store.data.inspirations.length === 0" class="empty slim">
          还没有灵感。随时记下突发的想法、点子与素材，它们会以卡片网格保存在这里，点击卡片即可展开编辑。
        </div>

        <div class="insp-grid">
          <div
            v-for="i in store.data.inspirations"
            :key="i.id"
            class="insp-card"
            :class="{ picked: batchMode && pickedI.has(i.id) }"
            @click="batchMode ? toggleI(i.id) : store.openInspiration(i.id)"
          >
            <label v-if="batchMode" class="pick-box" @click.stop>
              <input type="checkbox" :checked="pickedI.has(i.id)" @change="toggleI(i.id)" />
            </label>
            <div class="a-title">{{ i.title || '（未命名灵感）' }}</div>
            <div class="insp-preview" :class="{ blank: !previewOf(i.content) }">
              {{ previewOf(i.content) || '（点击卡片记录内容）' }}
            </div>
            <div class="a-meta">
              <span>{{ countWords(i.content) }} 字</span>
              <span>{{ fmtDate(i.updatedAt) }}</span>
            </div>
            <div class="a-actions" @click.stop>
              <button class="btn small" @click="store.openInspiration(i.id)">编辑</button>
              <button class="btn small danger" @click="delInsp(i)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <aside class="batch-rail">
      <div class="rail-row">
        <div class="rail-block">
          <div class="rail-title">批量删除</div>
          <button class="btn small" :class="{ primary: mode !== 'del' }" @click="toggleDel">
            {{ mode === 'del' ? '退出批量模式' : '进入批量模式' }}
          </button>
          <template v-if="mode === 'del'">
            <div class="rail-count">已选 {{ pickedCount }} / {{ totalCount }} 项</div>
            <button class="btn small" :disabled="totalCount === 0" @click="selectAll">全选</button>
            <button class="btn small" :disabled="pickedCount === 0" @click="clearSel">清空选择</button>
            <button class="btn small danger" :disabled="pickedCount === 0" @click="delPicked">删除所选</button>
          </template>
        </div>

        <div class="rail-block">
          <div class="rail-title">批量导出</div>
          <button class="btn small" :class="{ primary: mode !== 'exp' }" @click="toggleExp">
            {{ mode === 'exp' ? '退出批量模式' : '进入批量模式' }}
          </button>
          <template v-if="mode === 'exp'">
            <div class="rail-count">已选 {{ pickedCount }} 项</div>
            <button class="btn small primary" :disabled="pickedCount === 0 || exporting" @click="exportPicked">
              {{ exporting ? '导出中…' : '导出所选 (.rtf)' }}
            </button>
          </template>
        </div>
      </div>

      <div class="rail-row">
        <div class="rail-block">
          <div class="rail-title">本地备份</div>
          <button class="btn small" :disabled="backuping" @click="saveBackup">
            {{ backuping ? '备份中…' : '选择文件夹并备份' }}
          </button>
          <div v-if="backupMsg" class="rail-note" :class="{ err: backupErr }">{{ backupMsg }}</div>
        </div>

        <div class="rail-block">
          <div class="rail-title">本地导入</div>
          <button class="btn small" @click="pickImport">选择 .json 文件导入</button>
          <input
            ref="importInput"
            type="file"
            accept=".json"
            style="display: none"
            @change="onImportFile"
          />
          <div v-if="importMsg" class="rail-note" :class="{ err: importErr }">{{ importMsg }}</div>
        </div>
      </div>

      <div class="rail-block grow">
        <div class="rail-title">数据统计</div>
        <StatsPanel />
      </div>
    </aside>
  </div>
</template>
