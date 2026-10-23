<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { store, countWords, FONT_SIZES } from '../store'
import { exportChapters } from '../export'
import RichEditor from './RichEditor.vue'

const props = defineProps({
  article: { type: Object, required: true },
  expanded: { type: Object, required: true }
})

const docs = computed(() => props.article.children.filter((c) => c.type === 'doc'))
const fmt = computed(() => props.article.docFormat)

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

function toggle(id) {
  if (props.expanded.has(id)) props.expanded.delete(id)
  else props.expanded.add(id)
}

function wc(d) {
  return countWords(d.content)
}

function remove(child) {
  if (window.confirm(`删除章节「${child.title}」？已建立的时间轴关联将一并解除。`)) {
    props.expanded.delete(child.id)
    store.removeChild(props.article.id, child.id)
  }
}

const showExport = ref(false)
const scope = ref('all')
const picked = reactive(new Set())
const format = ref('docx')
const exporting = ref(false)

function togglePick(id) {
  if (picked.has(id)) picked.delete(id)
  else picked.add(id)
}

async function doExport() {
  let list = docs.value
  if (scope.value === 'pick') {
    list = docs.value.filter((d) => picked.has(d.id))
    if (!list.length) {
      window.alert('请至少勾选一个章节')
      return
    }
  }
  const baseName = list.length === 1 ? list[0].title || '章节' : `${props.article.title}-章节合集`
  exporting.value = true
  try {
    await exportChapters(list, format.value, baseName, props.article.docFormat)
    showExport.value = false
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="fmt-bar">
    <span class="fmt-label">文本格式</span>
    <label class="fmt-item">
      <input
        type="checkbox"
        :checked="fmt.indent"
        @change="store.updateDocFormat(article.id, { indent: $event.target.checked })"
      />
      回车缩进
    </label>
    <label class="fmt-item">
      字号
      <select :value="fmt.fontSize" @change="store.updateDocFormat(article.id, { fontSize: Number($event.target.value) })">
        <option v-for="s in FONT_SIZES" :key="s" :value="s">{{ s }}</option>
      </select>
    </label>
    <button
      class="btn small fmt-btn"
      :class="{ on: boldOn }"
      title="对选中内容加粗"
      @mousedown.prevent
      @click="applyCmd('bold')"
    >
      <b>B</b>
    </button>
    <button
      class="btn small fmt-btn"
      :class="{ on: italicOn }"
      title="对选中内容斜体"
      @mousedown.prevent
      @click="applyCmd('italic')"
    >
      <i>I</i>
    </button>
  </div>

  <div
    v-for="d in docs"
    :key="d.id"
    class="child-card"
    :class="{ expanded: expanded.has(d.id) }"
    :data-child-id="d.id"
  >
    <div class="child-head" @click="toggle(d.id)">
      <span class="chev">{{ expanded.has(d.id) ? '▾' : '▸' }}</span>
      <input class="child-title" v-model="d.title" placeholder="章节标题" @click.stop />
      <span class="word-badge" :title="`当前章节字数：${wc(d)}`">{{ wc(d) }} 字</span>
      <button class="icon-btn danger" title="删除章节" @click.stop="remove(d)">✕</button>
    </div>
    <div v-if="expanded.has(d.id)" class="child-body">
      <RichEditor v-model="d.content" :font-size="fmt.fontSize" :indent="fmt.indent" placeholder="自由书写..." />
    </div>
  </div>

  <div class="export-row">
    <button class="btn small" @click="showExport = !showExport">导出</button>
  </div>

  <div v-if="showExport" class="export-panel">
    <div class="exp-scope">
      <label class="exp-opt"><input type="radio" value="all" v-model="scope" /> 全部文本窗口</label>
      <label class="exp-opt"><input type="radio" value="pick" v-model="scope" /> 指定文本窗口</label>
    </div>
    <div v-if="scope === 'pick'" class="exp-list">
      <label v-for="d in docs" :key="d.id" class="exp-opt">
        <input type="checkbox" :checked="picked.has(d.id)" @change="togglePick(d.id)" />
        {{ d.title || '（未命名章节）' }}
        <span class="exp-sub">{{ wc(d) }} 字</span>
      </label>
      <div v-if="docs.length === 0" class="exp-sub">暂无章节</div>
    </div>
    <div class="exp-fmt">
      <label class="fmt-item">
        格式
        <select v-model="format">
          <option value="docx">.docx</option>
          <option value="md">.md</option>
          <option value="rtf">.rtf</option>
          <option value="png">.png</option>
        </select>
      </label>
      <button class="btn small primary" :disabled="exporting" @click="doExport">
        {{ exporting ? '导出中...' : '确认导出' }}
      </button>
    </div>
  </div>
</template>
