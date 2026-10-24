<script setup>
import { ref, reactive, computed } from 'vue'
import { store, FACTION_COLORS } from '../store'
import { saveFile, buildRelationsSvg } from '../export'

const props = defineProps({
  article: { type: Object, required: true },
  rel: { type: Object, required: true }
})

const selectedPerson = ref(null)
const selectedEdge = ref(null)
const hoverEdge = ref(null)
const relFrom = ref(null)
const relTo = ref(null)
const edgeLabel = ref('')
const personEditing = ref(false)
const pDraft = reactive({ name: '', note: '', bio: '', factionId: null })
const newName = ref('')
const editLabel = ref('')
const draggingId = ref(null)
const bendingId = ref(null)

const factionView = ref(null)
const factionEditing = ref(false)
const fDraft = reactive({ name: '', desc: '', color: FACTION_COLORS[0] })
const newFactionName = ref('')

const draggingPerson = ref(null)
const dropFactionId = ref(null)

const R = 22

function personById(id) {
  return props.rel.persons.find((p) => p.id === id)
}

function personNameOf(id) {
  return personById(id)?.name || '（未命名）'
}

function factionById(id) {
  return props.rel.factions.find((f) => f.id === id)
}

function factionOf(p) {
  return p?.factionId ? factionById(p.factionId) : null
}

function factionColor(p) {
  return factionOf(p)?.color || ''
}

function posOf(id) {
  const p = personById(id)
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 }
}

function shorten(a, b, dist) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: a.x + (dx / len) * dist, y: a.y + (dy / len) * dist }
}

const edgeLayout = computed(() => {
  const groups = new Map()
  for (const e of props.rel.edges) {
    const key = [e.from, e.to].sort().join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e.id)
  }
  const m = new Map()
  for (const ids of groups.values()) {
    ids.forEach((id, i) => m.set(id, { index: i, count: ids.length }))
  }
  return m
})

const edgePaths = computed(() =>
  props.rel.edges.map((e) => {
    const a0 = posOf(e.from)
    const b0 = posOf(e.to)
    const a = shorten(a0, b0, R + 3)
    const b = shorten(b0, a0, R + 7)
    const lay = edgeLayout.value.get(e.id) || { index: 0, count: 1 }
    const step = 15 + 1.6
    const auto = lay.count > 1 ? (lay.index - (lay.count - 1) / 2) * step : 0
    const m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len
    const py = dx / len
    const off = auto + (e.bend || 0)
    const cx = m0.x + px * off
    const cy = m0.y + py * off
    const d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
    const mid = { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y }
    const labelOff = (lay.count > 1 ? ((lay.count - 1) / 2) * step : 0) + 12 + (lay.count - 1 - lay.index) * 14
    const label = { x: mid.x + px * labelOff, y: mid.y + py * labelOff }
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180
    return { e, d, mid, m0, px, py, auto, label, ang }
  })
)

function addPerson() {
  const name = newName.value.trim()
  if (!name) return
  const p = store.addPerson(props.article.id, props.rel.id, name)
  newName.value = ''
  if (p) {
    selectedPerson.value = p.id
    selectedEdge.value = null
    personEditing.value = false
  }
}

function addFaction() {
  const f = store.addFaction(props.article.id, props.rel.id, newFactionName.value.trim())
  newFactionName.value = ''
  if (f) {
    factionView.value = f.id
    factionEditing.value = false
  }
}

async function exportSvg() {
  try {
    const svg = buildRelationsSvg(props.rel)
    const name = (props.rel.title || '人物关系').replace(/[\\/:*?"<>|]/g, '_')
    await saveFile(`${name}.svg`, svg, 'image/svg+xml')
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  }
}

function isHighlighted(p) {
  const f = store.focus
  return !!f && f.childId === props.rel.id && f.personId === p.id
}

function nodeDown(e, p) {
  if (bendingId.value) return
  selectedEdge.value = null
  factionView.value = null
  factionEditing.value = false
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
    personEditing.value = false
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

function bendDown(e, item) {
  e.stopPropagation()
  bendingId.value = item.e.id
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch (err) {
    /* ignore */
  }
}

function bendMove(e, item) {
  if (bendingId.value !== item.e.id) return
  const svg = e.currentTarget.closest('svg')
  if (!svg) return
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const m = svg.getScreenCTM()
  if (!m) return
  const P = pt.matrixTransform(m.inverse())
  const cx = 2 * P.x - item.m0.x
  const cy = 2 * P.y - item.m0.y
  const off = (cx - item.m0.x) * item.px + (cy - item.m0.y) * item.py
  item.e.bend = Math.max(-120, Math.min(120, Math.round(off - item.auto)))
}

function bendUp() {
  bendingId.value = null
}

function startEditPerson(p) {
  personEditing.value = true
  pDraft.name = p.name
  pDraft.note = p.note
  pDraft.bio = p.bio || ''
  pDraft.factionId = p.factionId || null
  selectedPerson.value = p.id
  selectedEdge.value = null
}

function savePerson() {
  const p = personById(selectedPerson.value)
  if (p) {
    store.updatePerson(props.article.id, props.rel.id, p.id, {
      name: pDraft.name.trim(),
      note: pDraft.note.trim(),
      bio: pDraft.bio,
      factionId: pDraft.factionId
    })
  }
  personEditing.value = false
}

function removePersonSel() {
  const p = personById(selectedPerson.value)
  if (!p) return
  if (window.confirm(`删除人物「${p.name}」及其全部关系？相关时间轴关联将一并解除。`)) {
    store.removePerson(props.article.id, props.rel.id, p.id)
    clearSel()
  }
}

function selectFaction(f) {
  personEditing.value = false
  if (factionView.value === f.id) {
    factionView.value = null
  } else {
    factionView.value = f.id
    factionEditing.value = false
  }
}

function startEditFaction(f) {
  factionEditing.value = true
  fDraft.name = f.name
  fDraft.desc = f.desc || ''
  fDraft.color = f.color
}

function saveFaction() {
  const f = factionById(factionView.value)
  if (f) store.updateFaction(props.article.id, props.rel.id, f.id, { ...fDraft })
  factionEditing.value = false
}

function removeFactionSel() {
  const f = factionById(factionView.value)
  if (!f) return
  if (window.confirm(`删除阵营「${f.name}」？该阵营下的人物将变为无阵营，人物本身保留。`)) {
    store.removeFaction(props.article.id, props.rel.id, f.id)
    factionView.value = null
    factionEditing.value = false
  }
}

function confirmEdge() {
  store.addEdge(props.article.id, props.rel.id, relFrom.value, relTo.value, edgeLabel.value.trim())
  clearSel()
}

function selectEdge(item) {
  if (bendingId.value) return
  selectedPerson.value = null
  relFrom.value = null
  relTo.value = null
  personEditing.value = false
  factionView.value = null
  factionEditing.value = false
  selectedEdge.value = selectedEdge.value === item.e.id ? null : item.e.id
  editLabel.value = item.e.label
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

function onPersonDragStart(e, p) {
  if (!p) return
  draggingPerson.value = p.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', p.id)
}

function onPersonDragEnd() {
  draggingPerson.value = null
  dropFactionId.value = null
}

function factionDragOver(e, key) {
  if (!draggingPerson.value) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropFactionId.value = key
}

function factionDragLeave(key) {
  if (dropFactionId.value === key) dropFactionId.value = null
}

function factionDrop(e, f) {
  if (!draggingPerson.value) return
  store.updatePerson(props.article.id, props.rel.id, draggingPerson.value, { factionId: f ? f.id : null })
  draggingPerson.value = null
  dropFactionId.value = null
}

function clearSel() {
  selectedPerson.value = null
  selectedEdge.value = null
  relFrom.value = null
  relTo.value = null
  personEditing.value = false
  factionView.value = null
  factionEditing.value = false
}
</script>

<template>
  <div class="rel-toolbar">
    <input v-model="newName" placeholder="人物名称" @keyup.enter="addPerson" />
    <button class="btn small primary" @click="addPerson">+ 添加人物</button>
    <input v-model="newFactionName" placeholder="阵营名称" @keyup.enter="addFaction" />
    <button class="btn small" @click="addFaction">+ 添加阵营</button>
    <span class="tool-gap"></span>
    <button class="btn small" title="导出为 .svg 矢量图" @click="exportSvg">导出 .svg</button>
  </div>

  <div v-if="rel.factions.length || draggingPerson" class="faction-row">
    <span class="faction-label">阵营：</span>
    <span
      v-for="f in rel.factions"
      :key="f.id"
      class="faction-chip"
      :class="{ sel: factionView === f.id, drop: dropFactionId === f.id }"
      :style="{ borderColor: f.color }"
      :title="f.desc || '点击查看阵营描述，拖动人物到此处加入阵营'"
      @click="selectFaction(f)"
      @dragover="factionDragOver($event, f.id)"
      @dragleave="factionDragLeave(f.id)"
      @drop="factionDrop($event, f)"
    >
      <i class="dot" :style="{ background: f.color }"></i>{{ f.name || '未命名阵营' }}
    </span>
    <span
      v-if="draggingPerson"
      class="faction-chip drop-none"
      :class="{ drop: dropFactionId === 'none' }"
      @dragover="factionDragOver($event, 'none')"
      @dragleave="factionDragLeave('none')"
      @drop="factionDrop($event, null)"
    >
      移出阵营
    </span>
  </div>

  <div class="rel-hint">
    点击人物选中并查看小传，再点击另一人物建立关系；拖动连线中点的圆点可弯曲线条；同一对人物可建立多条关系；双击人物编辑资料；按住人物小传区的拖动徽标拖到阵营标签上即可加入阵营。
  </div>

  <div v-if="relFrom && relTo" class="rel-form">
    为「{{ personNameOf(relFrom) }}」与「{{ personNameOf(relTo) }}」建立关系：
    <input v-model="edgeLabel" placeholder="关系描述，如：师徒 / 母子" @keyup.enter="confirmEdge" />
    <button class="btn small primary" @click="confirmEdge">确定</button>
    <button class="btn small" @click="clearSel">取消</button>
  </div>

  <div v-if="personEditing" class="rel-form person-form">
    <div class="pf-row">
      <input v-model="pDraft.name" placeholder="人物名称" @keyup.enter="savePerson" />
      <input v-model="pDraft.note" placeholder="备注（可选）" />
      <label class="pf-faction">
        阵营
        <select v-model="pDraft.factionId">
          <option :value="null">无阵营</option>
          <option v-for="f in rel.factions" :key="f.id" :value="f.id">{{ f.name || '未命名阵营' }}</option>
        </select>
      </label>
    </div>
    <textarea v-model="pDraft.bio" class="pf-bio" placeholder="人物小传：出身、经历、性格……"></textarea>
    <div class="pf-actions">
      <button class="btn small primary" @click="savePerson">保存</button>
      <button class="btn small" @click="personEditing = false">取消</button>
    </div>
  </div>

  <div v-else-if="selectedPerson" class="rel-form person-form">
    <div class="pv-head">
      <span
        class="drag-badge"
        draggable="true"
        title="按住拖动到上方阵营标签，加入该阵营"
        @dragstart="onPersonDragStart($event, personById(selectedPerson))"
        @dragend="onPersonDragEnd"
      >⠿ {{ personById(selectedPerson)?.name || '（未命名）' }}</span>
      <span
        v-if="factionOf(personById(selectedPerson))"
        class="faction-chip mini"
        :style="{ borderColor: factionColor(personById(selectedPerson)) }"
      >
        <i class="dot" :style="{ background: factionColor(personById(selectedPerson)) }"></i>
        {{ factionOf(personById(selectedPerson)).name || '未命名阵营' }}
      </span>
      <span v-if="personById(selectedPerson)?.note" class="pv-note">{{ personById(selectedPerson).note }}</span>
    </div>
    <div class="pv-bio">
      <div class="pv-label">人物小传</div>
      <div class="pv-bio-text">{{ personById(selectedPerson)?.bio || '（暂无小传，点击「编辑人物」填写）' }}</div>
    </div>
    <div class="pf-actions">
      <button class="btn small" @click="startEditPerson(personById(selectedPerson))">编辑人物</button>
      <button class="btn small danger" @click="removePersonSel">删除人物</button>
      <button class="btn small" @click="clearSel">清除选择</button>
    </div>
  </div>

  <div v-if="factionView && !factionEditing" class="rel-form person-form">
    <div class="pv-head">
      <b>{{ factionById(factionView)?.name || '未命名阵营' }}</b>
      <i class="dot big" :style="{ background: factionById(factionView)?.color }"></i>
      <span class="pv-note">{{ rel.persons.filter((p) => p.factionId === factionView).length }} 名成员</span>
    </div>
    <div class="pv-bio">
      <div class="pv-label">阵营描述</div>
      <div class="pv-bio-text">{{ factionById(factionView)?.desc || '（暂无描述，点击「编辑阵营」填写）' }}</div>
    </div>
    <div class="pf-actions">
      <button class="btn small" @click="startEditFaction(factionById(factionView))">编辑阵营</button>
      <button class="btn small danger" @click="removeFactionSel">删除阵营</button>
      <button class="btn small" @click="factionView = null">清除选择</button>
    </div>
  </div>

  <div v-if="factionEditing" class="rel-form person-form">
    <div class="pf-row">
      <input v-model="fDraft.name" placeholder="阵营名称" @keyup.enter="saveFaction" />
      <div class="swatches">
        <i
          v-for="c in FACTION_COLORS"
          :key="c"
          class="swatch"
          :class="{ on: fDraft.color === c }"
          :style="{ background: c }"
          @click="fDraft.color = c"
        ></i>
      </div>
    </div>
    <textarea v-model="fDraft.desc" class="pf-bio" placeholder="阵营描述：立场、目标、势力范围……"></textarea>
    <div class="pf-actions">
      <button class="btn small primary" @click="saveFaction">保存</button>
      <button class="btn small" @click="factionEditing = false">取消</button>
    </div>
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
    <defs>
      <marker id="arrow-normal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#94a3b8"></path>
      </marker>
      <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#d97706"></path>
      </marker>
    </defs>

    <text v-if="rel.persons.length === 0" x="300" y="200" text-anchor="middle" class="canvas-hint">
      点击上方「+ 添加人物」开始构建关系图
    </text>

    <g
      v-for="item in edgePaths"
      :key="item.e.id"
      class="edge"
      :class="{ sel: selectedEdge === item.e.id }"
      @click.stop="selectEdge(item)"
      @mouseenter="hoverEdge = item.e.id"
      @mouseleave="hoverEdge = null"
    >
      <path class="hit" :d="item.d"></path>
      <path
        class="line"
        :d="item.d"
        :marker-end="selectedEdge === item.e.id ? 'url(#arrow-sel)' : 'url(#arrow-normal)'"
      ></path>
      <text
        :transform="`translate(${item.label.x} ${item.label.y}) rotate(${item.ang})`"
        text-anchor="middle"
        dominant-baseline="central"
        >{{ item.e.label }}</text
      >
      <circle
        v-if="selectedEdge === item.e.id || hoverEdge === item.e.id || bendingId === item.e.id"
        class="bend-handle"
        :cx="item.mid.x"
        :cy="item.mid.y"
        r="6"
        @pointerdown.stop.prevent="bendDown($event, item)"
        @pointermove="bendMove($event, item)"
        @pointerup.stop="bendUp"
        @pointercancel="bendUp"
      ></circle>
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
      <title>{{ (p.name || '未命名') + (p.bio ? '\n' + p.bio : p.note ? '：' + p.note : '') }}</title>
      <circle :cx="p.x" :cy="p.y" r="22" :style="factionColor(p) ? { stroke: factionColor(p) } : null"></circle>
      <circle
        v-if="factionOf(p)"
        class="faction-dot"
        :cx="p.x + 16"
        :cy="p.y - 16"
        r="4.5"
        :style="{ fill: factionColor(p) }"
      ></circle>
      <text :x="p.x" :y="p.y + 38">{{ p.name || '（未命名）' }}</text>
    </g>
  </svg>
</template>

<style scoped>
.canvas-hint {
  fill: var(--muted);
  font-size: 13px;
}
.faction-dot {
  stroke: #ffffff;
  stroke-width: 1;
}
.bend-handle {
  fill: var(--accent);
  stroke: #ffffff;
  stroke-width: 2;
  cursor: grab;
}
.bend-handle:active {
  cursor: grabbing;
}
.tool-gap {
  flex: 1;
}
.drag-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border: 1px dashed var(--accent);
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.06);
  cursor: grab;
  font-weight: 700;
  user-select: none;
}
.drag-badge:active {
  cursor: grabbing;
}
.faction-chip.drop {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35);
  background: rgba(37, 99, 235, 0.08);
}
.faction-chip.drop-none {
  border-style: dashed;
  color: var(--muted);
}
</style>
