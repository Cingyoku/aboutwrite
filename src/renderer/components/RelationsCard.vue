<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import { store, FACTION_COLORS } from '../store'

const props = defineProps({
  article: { type: Object, required: true },
  rel: { type: Object, required: true }
})

const selectedPerson = ref(null)
const selectedEdge = ref(null)
const relFrom = ref(null)
const relTo = ref(null)
const edgeLabel = ref('')
const personEditing = ref(false)
const pDraft = reactive({ name: '', note: '', bio: '', factionIds: [] })
const newName = ref('')
const editLabel = ref('')
const draggingId = ref(null)

const factionView = ref(null)
const factionEditing = ref(false)
const fDraft = reactive({ name: '', desc: '', color: FACTION_COLORS[0] })
const newFactionName = ref('')

const draggingPerson = ref(null)
const dropFactionId = ref(null)

const R = 22
const EDGE_STEP = 18
const LABEL_GAP = 11

const pan = reactive({ x: 0, y: 0 })
const panning = ref(false)
let panStart = null
const zoom = ref(1)

const viewBox = computed(() => `${pan.x} ${pan.y} ${600 * zoom.value} ${400 * zoom.value}`)

// 滚轮缩放：以指针下的世界坐标为锚点，缩放前后该点保持不动
function onWheel(e) {
  const svg = e.currentTarget
  const m = svg.getScreenCTM()
  if (!m) return
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const world = pt.matrixTransform(m.inverse())
  const old = zoom.value
  const next = Math.min(3, Math.max(0.4, old * (e.deltaY > 0 ? 0.9 : 1.1)))
  if (next === old) return
  zoom.value = next
  pan.x = world.x - (world.x - pan.x) * (next / old)
  pan.y = world.y - (world.y - pan.y) * (next / old)
}

function personById(id) {
  return props.rel.persons.find((p) => p.id === id)
}

function personNameOf(id) {
  return personById(id)?.name || '（未命名）'
}

function factionById(id) {
  return props.rel.factions.find((f) => f.id === id)
}

function factionsOf(p) {
  if (!p) return []
  return (p.factionIds || (p.factionId ? [p.factionId] : []))
    .map((id) => factionById(id))
    .filter(Boolean)
}

function factionOf(p) {
  return factionsOf(p)[0] || null
}

function factionColor(p) {
  return factionOf(p)?.color || ''
}

function posOf(id) {
  const p = personById(id)
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 }
}

function lineTrim(off, dist) {
  const o2 = off * off
  return o2 >= dist * dist ? 0 : Math.sqrt(dist * dist - o2)
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
    const lay = edgeLayout.value.get(e.id) || { index: 0, count: 1 }
    const off = lay.count > 1 ? (lay.index - (lay.count - 1) / 2) * EDGE_STEP : 0
    // 统一按规范方向（id 较小端 -> 较大端）计算几何，保证同一对人物的多条线在共享坐标系中等距偏移；
    // 反向关系线若各自计算，垂直向量会翻转导致偏移落在同一侧而完全重叠
    const forward = String(e.from) <= String(e.to)
    const tail = posOf(forward ? e.from : e.to)
    const head = posOf(forward ? e.to : e.from)
    const dx = head.x - tail.x
    const dy = head.y - tail.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const px = -uy
    const py = ux
    const tA = lineTrim(off, R + 3)
    const tB = lineTrim(off, R + 7)
    const near = { x: tail.x + ux * tA + px * off, y: tail.y + uy * tA + py * off }
    const far = { x: head.x - ux * tB + px * off, y: head.y - uy * tB + py * off }
    const a = forward ? near : far
    const b = forward ? far : near
    const d = `M ${a.x} ${a.y} L ${b.x} ${b.y}`
    const mid = { x: (near.x + far.x) / 2, y: (near.y + far.y) / 2 }
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180
    const rad = (ang * Math.PI) / 180
    // 文字直立的"上方"向量与规范偏移方向的符号关系随规范方向翻转，先换算成可视高度再外推到线条外侧
    const out = dx >= 0 ? -1 : 1
    const side = off * out >= 0 ? 1 : -1
    const label = {
      x: mid.x + Math.sin(rad) * LABEL_GAP * side,
      y: mid.y - Math.cos(rad) * LABEL_GAP * side
    }
    return { e, d, label, ang }
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

// 列头「居中视图」按钮触发：所有关系图画布统一重新居中
watch(
  () => store.relFitTick,
  () => fitView()
)

// 面板展开（组件挂载）时默认居中
onMounted(() => fitView())

function isHighlighted(p) {
  const f = store.focus
  return !!f && f.childId === props.rel.id && f.personId === p.id
}

function nodeDown(e, p) {
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
  p.x = Math.round(pos.x)
  p.y = Math.round(pos.y)
}

function nodeUp() {
  draggingId.value = null
}

function canvasDown(e) {
  clearSel()
  panning.value = true
  panStart = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch (err) {
    /* ignore */
  }
}

function canvasMove(e) {
  if (!panning.value || !panStart) return
  const svg = e.currentTarget
  const m = svg.getScreenCTM()
  if (!m || !m.a) return
  pan.x = panStart.px - (e.clientX - panStart.x) / m.a
  pan.y = panStart.py - (e.clientY - panStart.y) / m.a
}

function canvasUp() {
  panning.value = false
  panStart = null
}

function fitView() {
  zoom.value = 1
  const list = props.rel.persons
  if (!list.length) {
    pan.x = 0
    pan.y = 0
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of list) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  pan.x = (minX + maxX) / 2 - 300
  pan.y = (minY + maxY) / 2 - 200
}

function startEditPerson(p) {
  personEditing.value = true
  pDraft.name = p.name
  pDraft.note = p.note
  pDraft.bio = p.bio || ''
  pDraft.factionIds = [...(p.factionIds || (p.factionId ? [p.factionId] : []))]
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
      factionIds: [...pDraft.factionIds]
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
  const p = personById(draggingPerson.value)
  if (p) {
    if (!f) {
      // 拖到「移出阵营」：清空全部阵营
      store.updatePerson(props.article.id, props.rel.id, p.id, { factionIds: [] })
    } else {
      // 拖到阵营标签：加入 / 退出该阵营（支持多阵营）
      const ids = new Set(p.factionIds || (p.factionId ? [p.factionId] : []))
      if (ids.has(f.id)) ids.delete(f.id)
      else ids.add(f.id)
      store.updatePerson(props.article.id, props.rel.id, p.id, { factionIds: [...ids] })
    }
  }
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

// 当前选中人物关联的时间轴事件：按时间轴在文章中的顺序、时间轴内文段顺序排列
const personTimelineItems = computed(() => {
  const pid = selectedPerson.value
  if (!pid) return []
  const items = []
  for (const c of props.article.children) {
    if (c.type !== 'timeline') continue
    for (const seg of c.segments) {
      if (seg.personLinks.some((pl) => pl.relationsId === props.rel.id && pl.personId === pid)) {
        items.push({ tlId: c.id, tlTitle: c.title, segId: seg.id, time: seg.time, event: seg.event, desc: seg.desc || '' })
      }
    }
  }
  return items
})

// ---------- 人物信息浮窗：弹出时默认在人物关系工作区右侧上浮，可全局拖动 ----------
const floatEl = ref(null)
const floatPos = ref(null)
let floatDrag = null

// 每次弹出重新锚定：右缘贴近人物关系工作区（.col）右缘、顶部对齐工作区顶部
watch(selectedPerson, async (id) => {
  if (!id) return
  await nextTick()
  const el = floatEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const ws = el.closest('.col') || el.parentElement
  if (!ws) return
  const rr = ws.getBoundingClientRect()
  floatPos.value = {
    x: Math.max(8, rr.right - rect.width - 10),
    y: Math.max(8, rr.top + 10)
  }
})

function floatStyle() {
  if (!floatPos.value) return {}
  return { left: floatPos.value.x + 'px', top: floatPos.value.y + 'px', right: 'auto' }
}

function floatDown(e) {
  // 人物拖拽徽章使用 HTML5 drag，交给浏览器处理，不启动浮窗拖动
  if (e.target.closest?.('.drag-badge')) return
  const el = floatEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!floatPos.value) floatPos.value = { x: rect.left, y: rect.top }
  floatDrag = {
    startX: floatPos.value.x,
    startY: floatPos.value.y,
    downX: e.clientX,
    downY: e.clientY,
    w: rect.width,
    h: rect.height
  }
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch (err) {
    /* ignore */
  }
}

function floatMove(e) {
  if (!floatDrag) return
  const nx = floatDrag.startX + (e.clientX - floatDrag.downX)
  const ny = floatDrag.startY + (e.clientY - floatDrag.downY)
  // 全局自由拖动：可在整个窗口范围内移动，保持浮窗至少 60px 可见
  floatPos.value = {
    x: Math.min(Math.max(nx, 60 - floatDrag.w), window.innerWidth - 60),
    y: Math.min(Math.max(ny, 0), window.innerHeight - 40)
  }
}

function floatUp() {
  floatDrag = null
}
</script>

<template>
  <div class="rel-root">
  <div class="rel-toolbar">
    <input v-model="newName" placeholder="人物名称" @keyup.enter="addPerson" />
    <button class="btn small primary" @click="addPerson">+ 添加人物</button>
    <input v-model="newFactionName" placeholder="阵营名称" @keyup.enter="addFaction" />
    <button class="btn small" @click="addFaction">+ 添加阵营</button>
  </div>

  <div v-if="rel.factions.length || draggingPerson" class="faction-row">
    <span class="faction-label">阵营：</span>
    <span
      v-for="f in rel.factions"
      :key="f.id"
      class="faction-chip"
      :class="{ sel: factionView === f.id, drop: dropFactionId === f.id }"
      :style="{ borderColor: f.color }"
      :title="f.desc || '点击查看阵营描述，拖动人物到此处加入 / 退出该阵营（支持多阵营）'"
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
    </div>
    <div class="pf-factions">
      <span class="pv-label">所属阵营（可多选）</span>
      <label v-for="f in rel.factions" :key="f.id" class="pf-faction-check">
        <input type="checkbox" :value="f.id" v-model="pDraft.factionIds" />
        <i class="dot" :style="{ background: f.color }"></i>{{ f.name || '未命名阵营' }}
      </label>
      <span v-if="!rel.factions.length" class="pf-none">（暂无阵营，可先在上方添加）</span>
    </div>
    <textarea v-model="pDraft.bio" class="pf-bio" placeholder="人物小传：出身、经历、性格……"></textarea>
    <div class="pf-actions">
      <button class="btn small primary" @click="savePerson">保存</button>
      <button class="btn small" @click="personEditing = false">取消</button>
    </div>
  </div>

  <div v-if="selectedPerson && !personEditing" ref="floatEl" class="person-float" :style="floatStyle()">
    <button class="pf-close icon-btn" title="关闭" @click="clearSel">✕</button>
    <div
      class="pv-head pf-drag"
      title="按住拖动浮动窗"
      @pointerdown="floatDown"
      @pointermove="floatMove"
      @pointerup="floatUp"
      @pointercancel="floatUp"
    >
      <span
        class="drag-badge"
        draggable="true"
        title="按住此徽章拖到上方阵营标签，加入 / 退出该阵营"
        @dragstart="onPersonDragStart($event, personById(selectedPerson))"
        @dragend="onPersonDragEnd"
      >⠿ {{ personById(selectedPerson)?.name || '（未命名）' }}</span>
      <span
        v-for="f in factionsOf(personById(selectedPerson))"
        :key="f.id"
        class="faction-chip mini"
        :style="{ borderColor: f.color }"
      >
        <i class="dot" :style="{ background: f.color }"></i>
        {{ f.name || '未命名阵营' }}
      </span>
      <span v-if="personById(selectedPerson)?.note" class="pv-note">{{ personById(selectedPerson).note }}</span>
    </div>
    <div class="pv-bio">
      <div class="pv-label">人物小传</div>
      <div class="pv-bio-text">{{ personById(selectedPerson)?.bio || '（暂无小传，点击「编辑人物」填写）' }}</div>
    </div>
    <div class="pt-box">
      <div class="pv-label">关联时间轴（按顺序）</div>
      <div v-if="personTimelineItems.length === 0" class="pt-empty">（该人物暂无关联的时间轴事件）</div>
      <div
        v-for="(it, idx) in personTimelineItems"
        :key="idx"
        class="pt-row"
        :title="`来自「${it.tlTitle}」，点击跳转到该条目`"
        @click="store.focusChild(it.tlId, null, it.segId)"
      >
        <span class="pt-time">{{ it.time || '（无时间）' }}</span>
        <span class="pt-event">{{ it.event || '（未填写事件）' }}</span>
      </div>
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
      <span class="pv-note">{{ rel.persons.filter((p) => (p.factionIds || []).includes(factionView)).length }} 名成员</span>
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
    :class="{ panning }"
    :viewBox="viewBox"
    @pointerdown.self="canvasDown"
    @pointermove="canvasMove"
    @pointerup="canvasUp"
    @pointercancel="canvasUp"
    @wheel.prevent="onWheel"
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

    <text v-if="rel.persons.length === 0" x="300" y="200" text-anchor="middle" class="canvas-hint">暂无人物</text>

    <g
      v-for="item in edgePaths"
      :key="item.e.id"
      class="edge"
      :class="{ sel: selectedEdge === item.e.id }"
      @click.stop="selectEdge(item)"
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
  </div>
</template>

<style scoped>
.rel-root {
  position: relative;
}
.person-float {
  position: fixed;
  top: 96px;
  right: 16px;
  width: min(340px, 92%);
  max-height: min(70vh, calc(100vh - 24px));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 30px 12px 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  z-index: 60;
}
.canvas-hint {
  fill: var(--muted);
  font-size: 13px;
}
.faction-dot {
  stroke: #ffffff;
  stroke-width: 1;
}
.pt-box { border-top: 1px dashed var(--border); margin-top: 10px; padding-top: 8px; max-height: 240px; overflow-y: auto; }
.pt-empty { color: var(--muted); font-size: 12px; }
.pt-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.pt-row:hover { background: var(--card-hi); }
.pt-time {
  flex: 0 0 88px;
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pt-event { flex: 1; min-width: 0; word-break: break-word; }
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
