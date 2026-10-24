<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { store } from '../store'
import { saveFile, buildTimelineSvg } from '../export'
import LinkPicker from './LinkPicker.vue'

const props = defineProps({
  article: { type: Object, required: true },
  expanded: { type: Object, required: true }
})

const timelines = computed(() => props.article.children.filter((c) => c.type === 'timeline'))

const editing = reactive(new Set())
const draft = reactive({})
const errors = reactive({})
const dragOn = reactive({})
const picker = ref(null)

const drag = reactive({ active: false, timelineId: null, fromIndex: -1, overIndex: -1, before: false })

function toggle(id) {
  if (props.expanded.has(id)) props.expanded.delete(id)
  else props.expanded.add(id)
}

function removeTl(tl) {
  if (window.confirm(`删除时间轴「${tl.title}」及其全部文段？`)) {
    props.expanded.delete(tl.id)
    store.removeChild(props.article.id, tl.id)
  }
}

function addSegment(tl) {
  const seg = store.addSegment(props.article.id, tl.id)
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

async function exportSvg(tl) {
  try {
    const svg = buildTimelineSvg(tl, props.article)
    const name = (tl.title || '时间轴').replace(/[\\/:*?"<>|]/g, '_')
    await saveFile(`${name}.svg`, svg, 'image/svg+xml')
  } catch (err) {
    window.alert('导出失败：' + (err.message || err))
  }
}

function startEdit(tl, seg) {
  draft[seg.id] = { time: seg.time, event: seg.event }
  editing.add(seg.id)
  delete errors[seg.id]
}

function saveEdit(tl, seg) {
  const d = draft[seg.id] || { time: '', event: '' }
  if (!d.event.trim()) {
    errors[seg.id] = '事件内容不能为空'
    return
  }
  store.updateSegment(props.article.id, tl.id, seg.id, { time: d.time, event: d.event })
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

function removeSeg(tl, seg) {
  if (window.confirm('删除该文段？')) {
    finishEdit(seg)
    store.removeSegment(props.article.id, tl.id, seg.id)
  }
}

function resetDrag() {
  drag.active = false
  drag.timelineId = null
  drag.fromIndex = -1
  drag.overIndex = -1
  drag.before = false
}

function onDragStart(e, tl, index) {
  drag.active = true
  drag.timelineId = tl.id
  drag.fromIndex = index
  drag.overIndex = index
  drag.before = true
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', tl.segments[index].id)
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

function onSegDragOver(e, tl, index) {
  if (!drag.active || drag.timelineId !== tl.id) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  drag.overIndex = index
  drag.before = e.clientY < rect.top + rect.height / 2
}

function onListDragOver(e, tl) {
  if (!drag.active || drag.timelineId !== tl.id) return
  e.preventDefault()
  drag.overIndex = tl.segments.length - 1
  drag.before = false
}

function doDrop(tl, overIndex, before) {
  let to = before ? overIndex : overIndex + 1
  const from = drag.fromIndex
  if (to > from) to -= 1
  if (from >= 0 && to !== from) {
    store.moveSegment(props.article.id, tl.id, from, to)
  }
}

function onSegDrop(e, tl) {
  if (!drag.active || drag.timelineId !== tl.id) return
  e.preventDefault()
  doDrop(tl, drag.overIndex, drag.before)
  resetDrag()
}

function onListDrop(e, tl) {
  if (!drag.active || drag.timelineId !== tl.id) return
  e.preventDefault()
  doDrop(tl, tl.segments.length - 1, false)
  resetDrag()
}

function indicator(tl, i, flag) {
  return drag.active && drag.timelineId === tl.id && drag.overIndex === i && drag.before === flag
}

function openPicker(tl, seg, mode) {
  picker.value = { tlId: tl.id, segId: seg.id, mode }
}

function onPickDoc(docId) {
  store.addDocLink(props.article.id, picker.value.tlId, picker.value.segId, docId)
  picker.value = null
}

function onPickPerson(relationsId, personId) {
  store.addPersonLink(props.article.id, picker.value.tlId, picker.value.segId, relationsId, personId)
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
  <div
    v-for="tl in timelines"
    :key="tl.id"
    class="child-card"
    :class="{ expanded: expanded.has(tl.id) }"
    :data-child-id="tl.id"
  >
    <div class="child-head" @click="toggle(tl.id)">
      <span class="chev">{{ expanded.has(tl.id) ? '▾' : '▸' }}</span>
      <input class="child-title" v-model="tl.title" placeholder="时间轴标题" @click.stop />
      <button class="icon-btn danger" title="删除时间轴" @click.stop="removeTl(tl)">✕</button>
    </div>

    <div v-if="expanded.has(tl.id)" class="child-body">
      <div class="rel-hint">按住文段左侧手柄拖动可排序；时间可留空，事件内容必填。</div>
      <div class="sub-row">
        <button class="btn small primary" @click="addSegment(tl)">+ 新建文段</button>
        <button class="btn small" title="导出为 .svg 矢量图" @click="exportSvg(tl)">导出 .svg</button>
      </div>

      <div class="seg-list" @dragover="onListDragOver($event, tl)" @drop="onListDrop($event, tl)">
        <div
          v-for="(seg, i) in tl.segments"
          :key="seg.id"
          class="seg"
          :class="{
            dragging: drag.active && drag.timelineId === tl.id && drag.fromIndex === i,
            'drop-before': indicator(tl, i, true),
            'drop-after': indicator(tl, i, false)
          }"
          :draggable="false"
          @dragstart="onDragStart($event, tl, i)"
          @dragend="onDragEnd($event, seg.id)"
          @dragover="onSegDragOver($event, tl, i)"
          @drop="onSegDrop($event, tl)"
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
            <button class="btn small primary" @click="saveEdit(tl, seg)">保存</button>
            <button class="btn small" @click="cancelEdit(seg)">取消</button>
            <span v-if="errors[seg.id]" class="seg-error">{{ errors[seg.id] }}</span>
          </div>
          <div v-else class="seg-actions">
            <button class="btn small" @click="startEdit(tl, seg)">编辑</button>
            <button class="btn small" @click="openPicker(tl, seg, 'doc')">关联章节</button>
            <button class="btn small" @click="openPicker(tl, seg, 'person')">关联人物</button>
            <button class="btn small danger" @click="removeSeg(tl, seg)">删除</button>
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

      <div v-if="tl.segments.length === 0" class="col-empty">暂无文段。可乱序录入，再拖拽排出顺序。</div>
    </div>
  </div>

  <LinkPicker
    v-if="picker"
    :article="article"
    :mode="picker.mode"
    @close="picker = null"
    @pick-doc="onPickDoc"
    @pick-person="onPickPerson"
  />
</template>
