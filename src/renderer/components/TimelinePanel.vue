<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { store } from '../store'
import { saveFile, buildTimelineSvg } from '../export'
import LinkPicker from './LinkPicker.vue'

const props = defineProps({
  article: { type: Object, required: true },
  expanded: { type: Object, required: true }
})

const tl = computed(() => props.article.children.find((c) => c.type === 'timeline'))

const editing = reactive(new Set())
const draft = reactive({})
const errors = reactive({})
const dragOn = reactive({})
const picker = ref(null)

const drag = reactive({ active: false, fromIndex: -1, overIndex: -1, before: false })

function addSegment() {
  if (!tl.value) return
  const seg = store.addSegment(props.article.id, tl.value.id)
  if (!seg) return
  draft[seg.id] = { time: '', event: '' }
  editing.add(seg.id)
  delete errors[seg.id]
  nextTick(() => {
    const el = document.querySelector(`[data-seg-event="${seg.id}"]`)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest' })
  })
}

async function exportSvg() {
  if (!tl.value) return
  try {
    const svg = buildTimelineSvg(tl.value, props.article)
    const name = (tl.value.title || '时间轴').replace(/[\\/:*?"<>|]/g, '_')
    await saveFile(`${name}.svg`, svg, 'image/svg+xml')
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  }
}

function startEdit(seg) {
  draft[seg.id] = { time: seg.time, event: seg.event }
  editing.add(seg.id)
  delete errors[seg.id]
}

function saveEdit(seg) {
  const d = draft[seg.id] || { time: '', event: '' }
  if (!d.event.trim()) {
    errors[seg.id] = '事件内容不能为空'
    return
  }
  store.updateSegment(props.article.id, tl.value.id, seg.id, { time: d.time, event: d.event })
  finishEdit(seg)
}

function cancelEdit(seg) {
  finishEdit(seg)
}

function finishEdit(seg) {
  editing.delete(seg.id)
  delete errors[seg.id]
  delete draft[seg.id]
}

function removeSeg(seg) {
  if (window.confirm('删除该文段？')) {
    finishEdit(seg)
    store.removeSegment(props.article.id, tl.value.id, seg.id)
  }
}

function resetDrag() {
  drag.active = false
  drag.fromIndex = -1
  drag.overIndex = -1
  drag.before = false
}

function onDragStart(e, index) {
  drag.active = true
  drag.fromIndex = index
  drag.overIndex = index
  drag.before = true
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', tl.value.segments[index].id)
}

function armDrag(e, segId) {
  dragOn[segId] = true
  e.currentTarget.closest('.seg')?.setAttribute('draggable', 'true')
}

function disarmDrag(e, segId) {
  dragOn[segId] = false
  e.currentTarget.closest('.seg')?.setAttribute('draggable', 'false')
}

function onDragEnd(e, segId) {
  dragOn[segId] = false
  e.currentTarget.setAttribute('draggable', 'false')
  resetDrag()
}

function onSegDragOver(e, index) {
  if (!drag.active) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  drag.overIndex = index
  drag.before = e.clientY < rect.top + rect.height / 2
}

function onListDragOver(e) {
  if (!drag.active) return
  e.preventDefault()
  drag.overIndex = tl.value.segments.length - 1
  drag.before = false
}

function doDrop(overIndex, before) {
  let to = before ? overIndex : overIndex + 1
  const from = drag.fromIndex
  if (to > from) to -= 1
  if (from >= 0 && to !== from) {
    store.moveSegment(props.article.id, tl.value.id, from, to)
  }
}

function onSegDrop(e) {
  if (!drag.active) return
  e.preventDefault()
  doDrop(drag.overIndex, drag.before)
  resetDrag()
}

function onListDrop(e) {
  if (!drag.active) return
  e.preventDefault()
  doDrop(tl.value.segments.length - 1, false)
  resetDrag()
}

function indicator(i, flag) {
  return drag.active && drag.overIndex === i && drag.before === flag
}

function openPicker(seg, mode) {
  picker.value = { segId: seg.id, mode }
}

function onPickDoc(docId) {
  store.addDocLink(props.article.id, tl.value.id, picker.value.segId, docId)
  picker.value = null
}

function onPickPerson(relationsId, personId) {
  store.addPersonLink(props.article.id, tl.value.id, picker.value.segId, relationsId, personId)
  picker.value = null
}

function childTitle(childId) {
  const c = store.childById(props.article, childId)
  return c ? c.title : '（已删除）'
}

function personName(relationsId, personId) {
  const rel = store.childById(props.article, relationsId)
  const p = rel?.persons.find((x) => x.id === personId)
  return p ? p.name : '（已删除人物）'
}
</script>

<template>
  <template v-if="tl">
    <div class="sub-row tl-toolbar">
      <button class="btn small primary" @click="addSegment">+ 新建文段</button>
      <span class="tool-gap"></span>
      <button class="btn small" title="导出为 .svg 矢量图" @click="exportSvg">导出 .svg</button>
    </div>
    <div class="rel-hint">按住文段左侧手柄拖动可排序；时间可留空，事件内容必填。</div>

    <div class="seg-list" @dragover="onListDragOver($event)" @drop="onListDrop($event)">
      <div
        v-for="(seg, i) in tl.segments"
        :key="seg.id"
        class="seg"
        :class="{
          dragging: drag.active && drag.fromIndex === i,
          'drop-before': indicator(i, true),
          'drop-after': indicator(i, false)
        }"
        :draggable="false"
        @dragstart="onDragStart($event, i)"
        @dragend="onDragEnd($event, seg.id)"
        @dragover="onSegDragOver($event, i)"
        @drop="onSegDrop($event)"
      >
        <div class="seg-top">
          <span
            v-if="!editing.has(seg.id)"
            class="seg-handle"
            title="拖动调整顺序"
            @mousedown="armDrag($event, seg.id)"
            @mouseup="disarmDrag($event, seg.id)"
          >⠿</span>

          <template v-if="editing.has(seg.id)">
            <div class="seg-edit">
              <div class="row">
                <input class="time-input" v-model="draft[seg.id].time" placeholder="时间（可留空）" />
                <input
                  class="event-input"
                  :data-seg-event="seg.id"
                  v-model="draft[seg.id].event"
                  placeholder="事件内容（必填）"
                />
              </div>
            </div>
          </template>
          <template v-else>
            <div class="seg-time">
              <span v-if="seg.time">{{ seg.time }}</span>
              <span v-else class="blank">（无时间）</span>
            </div>
            <div class="seg-event">{{ seg.event }}</div>
          </template>
        </div>

        <div v-if="editing.has(seg.id)" class="seg-actions">
          <button class="btn small primary" @click="saveEdit(seg)">保存</button>
          <button class="btn small" @click="cancelEdit(seg)">取消</button>
          <span v-if="errors[seg.id]" class="seg-error">{{ errors[seg.id] }}</span>
        </div>
        <div v-else class="seg-actions">
          <button class="btn small" @click="startEdit(seg)">编辑</button>
          <button class="btn small" @click="openPicker(seg, 'doc')">关联章节</button>
          <button class="btn small" @click="openPicker(seg, 'person')">关联人物</button>
          <button class="btn small danger" @click="removeSeg(seg)">删除</button>
        </div>

        <div v-if="seg.docLinks.length || seg.personLinks.length" class="chips">
          <span
            v-for="(docId, di) in seg.docLinks"
            :key="'d' + docId"
            class="chip chip-doc"
            title="点击打开该章节"
            @click="store.focusChild(docId)"
          >
            <span class="chip-label">章节 · {{ childTitle(docId) }}</span>
            <button class="chip-x" title="移除关联" @click.stop="store.removeDocLink(props.article.id, tl.id, seg.id, di)">×</button>
          </span>
          <span
            v-for="(pl, pi) in seg.personLinks"
            :key="'p' + pi"
            class="chip chip-person"
            title="点击打开该人物关系"
            @click="store.focusChild(pl.relationsId, pl.personId)"
          >
            <span class="chip-label">
              人物 · {{ childTitle(pl.relationsId) }}{{ pl.personId ? ' / ' + personName(pl.relationsId, pl.personId) : '（整个关系图）' }}
            </span>
            <button class="chip-x" title="移除关联" @click.stop="store.removePersonLink(props.article.id, tl.id, seg.id, pi)">×</button>
          </span>
        </div>
      </div>
    </div>

    <div v-if="tl.segments.length === 0" class="col-empty">暂无文段。点击「+ 新建文段」录入，可乱序录入后再拖拽排出顺序。</div>
  </template>

  <LinkPicker
    v-if="picker"
    :article="article"
    :mode="picker.mode"
    @close="picker = null"
    @pick-doc="onPickDoc"
    @pick-person="onPickPerson"
  />
</template>
