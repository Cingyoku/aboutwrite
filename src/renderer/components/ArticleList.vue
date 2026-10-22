<script setup>
import { ref } from 'vue'
import { store } from '../store'

const title = ref('')

function create() {
  const t = title.value.trim()
  if (!t) return
  store.createArticle(t)
  title.value = ''
}

function del(article) {
  if (window.confirm(`删除文章「${article.title}」？其下全部子项目与文段将一并删除。`)) {
    store.deleteArticle(article.id)
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
  <div class="list-page">
    <div class="list-head">
      <h1>我的文章</h1>
      <div class="create-row">
        <input v-model="title" placeholder="输入文章标题，回车或点击按钮创建" @keyup.enter="create" />
        <button class="btn primary" @click="create">新建文章</button>
      </div>
    </div>

    <div v-if="store.data.articles.length === 0" class="empty">还没有文章。输入标题创建第一篇，文章下可以挂载独立文档、时间轴与人物关系。</div>

    <div class="article-grid">
      <div v-for="a in store.data.articles" :key="a.id" class="article-card" @click="store.openArticle(a.id)">
        <div class="a-title">{{ a.title }}</div>
        <div class="a-meta">
          <span>{{ a.children.length }} 个子项目</span>
          <span>{{ fmtDate(a.updatedAt) }}</span>
        </div>
        <div class="a-actions" @click.stop>
          <button class="btn small" @click="store.openArticle(a.id)">打开</button>
          <button class="btn small danger" @click="del(a)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
