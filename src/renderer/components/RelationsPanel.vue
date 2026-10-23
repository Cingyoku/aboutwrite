<script setup>
import { computed } from 'vue'
import RelationsCard from './RelationsCard.vue'

const props = defineProps({
  article: { type: Object, required: true },
  expanded: { type: Object, required: true }
})

const rel = computed(() => props.article.children.find((c) => c.type === 'relations'))
</script>

<template>
  <RelationsCard v-if="rel" :article="article" :rel="rel" />
</template>
