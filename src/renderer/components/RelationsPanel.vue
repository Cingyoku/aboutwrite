<script setup>
import { computed } from 'vue'
import { store } from '../store'
import RelationsCard from './RelationsCard.vue'

const props = defineProps({
  article: { type: Object, required: true },
  expanded: { type: Object, required: true }
})

const rels = computed(() => props.article.children.filter((c) => c.type === 'relations'))

function toggle(id) {
  if (props.expanded.has(id)) props.expanded.delete(id)
  else props.expanded.add(id)
}

function remove(child) {
  if (window.confirm(`删除人物关系「${child.title}」？已建立的时间轴关联将一并解除。`)) {
    props.expanded.delete(child.id)
    store.removeChild(props.article.id, child.id)
  }
}
</script>

<template>
  <div
    v-for="r in rels"
    :key="r.id"
    class="child-card"
    :class="{ expanded: expanded.has(r.id) }"
    :data-child-id="r.id"
  >
    <div class="child-head" @click="toggle(r.id)">
      <span class="chev">{{ expanded.has(r.id) ? '▾' : '▸' }}</span>
      <input class="child-title" v-model="r.title" placeholder="人物关系标题" @click.stop />
      <button class="icon-btn danger" title="删除人物关系" @click.stop="remove(r)">✕</button>
    </div>
    <div v-if="expanded.has(r.id)" class="child-body">
      <RelationsCard :article="article" :rel="r" />
    </div>
  </div>
</template>
