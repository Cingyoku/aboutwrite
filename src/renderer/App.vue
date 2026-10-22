<script setup>
import { store } from './store'
import ArticleList from './components/ArticleList.vue'
import WorkSpace from './components/WorkSpace.vue'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        Writing Studio
        <span class="sub">本地写作 · 文章 / 独立文档 / 时间轴 / 人物关系</span>
      </div>
      <button v-if="store.view === 'workspace'" class="btn small" @click="store.back()">返回文章列表</button>
    </header>
    <main class="app-main">
      <div v-if="store.loadError" class="load-error">本地数据加载异常，已以空数据启动。历史数据可能仍保留在存储中。</div>
      <div v-if="!store.ready" class="empty">加载中...</div>
      <ArticleList v-else-if="store.view === 'list'" />
      <WorkSpace v-else />
    </main>
  </div>
</template>
