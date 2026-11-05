<script setup>
import { computed } from 'vue'
import { store, countWords } from '../store'
import RichEditor from './RichEditor.vue'

const insp = computed(() => store.currentInspiration)

function onContent(html) {
  if (!insp.value) return
  insp.value.content = html
  insp.value.updatedAt = Date.now()
}

function touchTitle() {
  if (insp.value) insp.value.updatedAt = Date.now()
}

function removeInsp() {
  if (!insp.value) return
  if (window.confirm(`删除灵感「${insp.value.title || '未命名灵感'}」？`)) {
    store.deleteInspiration(insp.value.id)
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
  <div v-if="insp" class="insp-root">
    <div class="ws-head">
      <input class="ws-title" v-model="insp.title" placeholder="灵感标题" @input="touchTitle" />
      <span class="word-total" title="正文字数">字数：{{ countWords(insp.content) }}</span>
      <button class="btn small danger" @click="removeInsp">删除灵感</button>
    </div>
    <div class="insp-body">
      <RichEditor
        :model-value="insp.content"
        :indent="false"
        placeholder="记录灵感：想法、点子、片段、素材、备忘……"
        @update:model-value="onContent"
      />
      <div class="insp-meta">创建于 {{ fmtDate(insp.createdAt) }} · 最近更新 {{ fmtDate(insp.updatedAt) }}</div>
    </div>
  </div>
</template>

<style scoped>
.insp-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.insp-body {
  flex: 1;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 18px 22px 30px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.insp-body :deep(.rich-editor) {
  max-height: none;
  flex: 1;
  min-height: 320px;
}
.insp-meta {
  color: var(--muted);
  font-size: 12px;
}
</style>
