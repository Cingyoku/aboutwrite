<script setup>
import { ref, reactive, watch, nextTick, computed } from 'vue'
import { store } from '../store'
import DocPanel from './DocPanel.vue'
import RelationsPanel from './RelationsPanel.vue'
import TimelinePanel from './TimelinePanel.vue'

const article = computed(() => store.current)

const expanded = reactive(new Set())
const showContent = ref(false)

const columns = [
  { type: 'doc', title: '独立文档', comp: DocPanel, hint: '自由书写的文本素材' },
  { type: 'relations', title: '人物关系', comp: RelationsPanel, hint: '人物与关系的可视化图' },
  { type: 'timeline', title: '时间轴', comp: TimelinePanel, hint: '可拖拽排序的事件文段' }
]

const creating = ref('')
const newTitle = ref('')

function startCreate(type) {
  creating.value = type
  newTitle.value = ''
}

function confirmCreate(type) {
  const col = columns.find((c) => c.type === type)
  const t = newTitle.value.trim() || col.title
  const child = store.addChild(article.value.id, type, t)
  creating.value = ''
  newTitle.value = ''
  if (child) {
    expanded.add(child.id)
    scrollChild(child.id)
  }
}

function cancelCreate() {
  creating.value = ''
  newTitle.value = ''
}

function countOf(type) {
  return article.value.children.filter((c) => c.type === type).length
}

function scrollChild(childId) {
  nextTick(() => {
    const el = document.querySelector(`[data-child-id="${childId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

watch(
  () => store.focus,
  (f) => {
    if (!f || !article.value) return
    expanded.add(f.childId)
    scrollChild(f.childId)
  }
)
</script>

<template>
  <div v-if="article" class="ws-root" style="display: flex; flex-direction: column; flex: 1; min-height: 0">
    <div class="ws-head">
      <input
        class="ws-title"
        v-model="article.title"
        placeholder="文章标题"
        @input="article.updatedAt = Date.now()"
      />
      <button class="btn small" @click="showContent = !showContent">{{ showContent ? '收起正文' : '文章正文' }}</button>
    </div>

    <div v-if="showContent" class="ws-content">
      <textarea v-model="article.content" placeholder="文章正文（母任务内容）..." @input="article.updatedAt = Date.now()"></textarea>
    </div>

    <div class="ws-body">
      <section v-for="col in columns" :key="col.type" class="col">
        <div class="col-head">
          <span class="col-title">{{ col.title }}<span class="count">{{ countOf(col.type) }}</span></span>
          <button class="btn small" @click="creating === col.type ? cancelCreate() : startCreate(col.type)">
            {{ creating === col.type ? '取消' : '+ 新建' }}
          </button>
        </div>

        <div v-if="creating === col.type" class="create-form">
          <input
            v-model="newTitle"
            :placeholder="`输入${col.title}标题（留空则用默认名）`"
            @keyup.enter="confirmCreate(col.type)"
          />
          <button class="btn small primary" @click="confirmCreate(col.type)">确定</button>
        </div>

        <div class="col-body">
          <component :is="col.comp" :article="article" :expanded="expanded" />
          <div v-if="countOf(col.type) === 0" class="col-empty">
            暂无{{ col.title }}
            <div class="rel-hint">{{ col.hint }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
