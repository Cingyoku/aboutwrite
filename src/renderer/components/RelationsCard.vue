<script setup>
import { ref } from 'vue'
import { store } from '../store'

const props = defineProps({
  article: { type: Object, required: true },
  rel: { type: Object, required: true }
})

const selectedPerson = ref(null)
const selectedEdge = ref(null)
const relFrom = ref(null)
const relTo = ref(null)
const edgeLabel = ref('')
const editingPerson = ref(null)
const pName = ref('')
const pNote = ref('')
const newName = ref('')
const editLabel = ref('')
const draggingId = ref(null)

function personById(id) {
  return props.rel.persons.find((p) => p.id === id)
}

function personNameOf(id) {
  return personById(id)?.name || '（未命名）'
}

function posOf(id) {
  const p = personById(id)
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 }
}

function edgeMid(e) {
  const a = posOf(e.from)
  const b = posOf(e.to)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function addPerson() {
  const name = newName.value.trim()
  if (!name) return
  const p = store.addPerson(props.article.id, props.rel.id, name)
  newName.value = ''
  if (p) {
    selectedPerson.value = p.id
    selectedEdge.value = null
  }
}

function isHighlighted(p) {
  const f = store.focus
  return !!f && f.childId === props.rel.id && f.personId === p.id
}

function nodeDown(e, p) {
  selectedEdge.value = null
  if (relFrom.value && relFrom.value !== p.id) {
    relTo.value = p.id
    edgeLabel.value = ''
    draggingId.value = null
    return
  }
  if (relFrom.value && relFrom.value === p.id) {
    relFrom.value = null
    selectedPerson.value = null
  } else {
    selectedPerson.value = p.id
    relFrom.value = p.id
  }
  draggingId.value = p.id
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch (err) {
    /* ignore */
  }
}

function nodeMove(e, p) {
  if (draggingId.value !== p.id) return
  const svg = e.currentTarget.closest('svg')
  if (!svg) return
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const m = svg.getScreenCTM()
  if (!m) return
  const pos = pt.matrixTransform(m.inverse())
  p.x = Math.max(14, Math.min(586, Math.round(pos.x)))
  p.y = Math.max(14, Math.min(386, Math.round(pos.y)))
}

function nodeUp() {
  draggingId.value = null
}

function startEditPerson(p) {
  editingPerson.value = p.id
  pName.value = p.name
  pNote.value = p.note
  selectedEdge.value = null
}

function savePerson() {
  const p = personById(editingPerson.value)
  if (p) {
    store.updatePerson(props.article.id, props.rel.id, p.id, {
      name: pName.value.trim(),
      note: pNote.value.trim()
    })
  }
  editingPerson.value = null
}

function removePersonSel() {
  const p = personById(selectedPerson.value)
  if (!p) return
  if (window.confirm(`删除人物「${p.name}」及其全部关系？相关时间轴关联将一并解除。`)) {
    store.removePerson(props.article.id, props.rel.id, p.id)
    clearSel()
  }
}

function confirmEdge() {
  store.addEdge(props.article.id, props.rel.id, relFrom.value, relTo.value, edgeLabel.value.trim())
  clearSel()
}

function cancelEdge() {
  clearSel()
}

function selectEdge(e) {
  selectedPerson.value = null
  relFrom.value = null
  relTo.value = null
  editingPerson.value = null
  selectedEdge.value = selectedEdge.value === e.id ? null : e.id
  editLabel.value = e.label
}

function saveEdge() {
  if (!selectedEdge.value) return
  store.updateEdge(props.article.id, props.rel.id, selectedEdge.value, editLabel.value.trim())
  clearSel()
}

function removeEdgeSel() {
  if (selectedEdge.value && window.confirm('删除该关系？')) {
    store.removeEdge(props.article.id, props.rel.id, selectedEdge.value)
  }
  clearSel()
}

function clearSel() {
  selectedPerson.value = null
  selectedEdge.value = null
  relFrom.value = null
  relTo.value = null
  editingPerson.value = null
}
</script>

<template>
  <div class="rel-toolbar">
    <input v-model="newName" placeholder="人物名称" @keyup.enter="addPerson" />
    <button class="btn small primary" @click="addPerson">+ 添加人物</button>
    <button v-if="selectedPerson" class="btn small" @click="startEditPerson(personById(selectedPerson))">编辑人物</button>
    <button v-if="selectedPerson" class="btn small danger" @click="removePersonSel">删除人物</button>
    <button v-if="selectedPerson || selectedEdge" class="btn small" @click="clearSel">清除选择</button>
  </div>
  <div class="rel-hint">
    点击人物选中，再点击另一人物建立关系；按住人物拖动调整位置；双击人物编辑名称与备注；点击连线选中关系。
  </div>

  <div v-if="relFrom && relTo" class="rel-form">
    为「{{ personNameOf(relFrom) }}」与「{{ personNameOf(relTo) }}」建立关系：
    <input v-model="edgeLabel" placeholder="关系描述，如：师徒 / 母子" @keyup.enter="confirmEdge" />
    <button class="btn small primary" @click="confirmEdge">确定</button>
    <button class="btn small" @click="cancelEdge">取消</button>
  </div>

  <div v-if="editingPerson" class="rel-form">
    <input v-model="pName" placeholder="人物名称" @keyup.enter="savePerson" />
    <input v-model="pNote" placeholder="备注（可选）" @keyup.enter="savePerson" />
    <button class="btn small primary" @click="savePerson">保存</button>
    <button class="btn small" @click="editingPerson = null">取消</button>
  </div>

  <div v-if="selectedEdge" class="rel-form">
    关系描述：
    <input v-model="editLabel" placeholder="关系描述" @keyup.enter="saveEdge" />
    <button class="btn small primary" @click="saveEdge">保存</button>
    <button class="btn small danger" @click="removeEdgeSel">删除关系</button>
  </div>

  <svg
    class="rel-canvas"
    viewBox="0 0 600 400"
    @pointerdown.self="clearSel()"
    @dragover.prevent
    @drop.prevent
  >
    <text v-if="rel.persons.length === 0" x="300" y="200" text-anchor="middle" class="canvas-hint">
      点击上方「+ 添加人物」开始构建关系图
    </text>

    <g
      v-for="e in rel.edges"
      :key="e.id"
      class="edge"
      :class="{ sel: selectedEdge === e.id }"
      @click.stop="selectEdge(e)"
    >
      <line class="hit" :x1="posOf(e.from).x" :y1="posOf(e.from).y" :x2="posOf(e.to).x" :y2="posOf(e.to).y" />
      <line class="line" :x1="posOf(e.from).x" :y1="posOf(e.from).y" :x2="posOf(e.to).x" :y2="posOf(e.to).y" />
      <text :x="edgeMid(e).x" :y="edgeMid(e).y - 8">{{ e.label }}</text>
    </g>

    <g
      v-for="p in rel.persons"
      :key="p.id"
      class="node"
      :class="{ sel: selectedPerson === p.id, hi: isHighlighted(p) }"
      @pointerdown.stop.prevent="nodeDown($event, p)"
      @pointermove="nodeMove($event, p)"
      @pointerup="nodeUp"
      @pointercancel="nodeUp"
      @dblclick.stop="startEditPerson(p)"
    >
      <title>{{ (p.name || '未命名') + (p.note ? '：' + p.note : '') }}</title>
      <circle :cx="p.x" :cy="p.y" r="22" />
      <circle v-if="p.note" class="note-dot" :cx="p.x + 16" :cy="p.y - 16" r="4" />
      <text :x="p.x" :y="p.y + 38">{{ p.name || '（未命名）' }}</text>
    </g>
  </svg>
</template>

<style scoped>
.canvas-hint {
  fill: var(--muted);
  font-size: 13px;
}
.note-dot {
  fill: var(--accent-2);
}
</style>
