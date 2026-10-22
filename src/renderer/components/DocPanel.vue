<script setup>
import { computed } from 'vue'
import { store } from '../store'

const props = defineProps({
  article: { type: Object, required: true },
  expanded: { type: Object, required: true }
})

const docs = computed(() => props.article.children.filter((c) => c.type === 'doc'))

function toggle(id) {
  if (props.expanded.has(id)) props.expanded.delete(id)
  else props.expanded.add(id)
}

function remove(child) {
  if (window.confirm(`删除独立文档「${child.title}」？已建立的时间轴关联将一并解除。`)) {
    props.expanded.delete(child.id)
    store.removeChild(props.article.id, child.id)
  }
}
</script>

<template>
  <div
    v-for="d in docs"
    :key="d.id"
    class="child-card"
    :class="{ expanded: expanded.has(d.id) }"
    :data-child-id="d.id"
  >
    <div class="child-head" @click="toggle(d.id)">
      <span class="chev">{{ expanded.has(d.id) ? '▾' : '▸' }}</span>
      <input class="child-title" v-model="d.title" placeholder="文档标题" @click.stop />
      <button class="icon-btn danger" title="删除文档" @click.stop="remove(d)">✕</button>
    </div>
    <div v-if="expanded.has(d.id)" class="child-body">
      <textarea v-model="d.content" class="doc-text" placeholder="自由书写..."></textarea>
    </div>
  </div>
</template>
