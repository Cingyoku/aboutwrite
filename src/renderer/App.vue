<script setup>
import { onMounted } from 'vue'
import { store } from './store'
import ArticleList from './components/ArticleList.vue'
import WorkSpace from './components/WorkSpace.vue'
import InspirationView from './components/InspirationView.vue'

async function saveBackupQuick() {
  const api = window.electronAPI
  if (!api?.saveBackupQuick) {
    window.alert('当前环境不支持快速保存（请在桌面版中使用）。')
    return
  }
  const res = await api.saveBackupQuick(JSON.parse(JSON.stringify(store.data)))
  if (res?.saved) window.alert('已保存备份：' + res.path)
  else if (res?.error) window.alert('保存失败：' + res.error)
}

function applyBackup(parsed) {
  try {
    if (!parsed || !Array.isArray(parsed.articles)) throw new Error('不是有效的备份数据（缺少 articles）')
    const aCount = parsed.articles.length
    const iCount = Array.isArray(parsed.inspirations) ? parsed.inspirations.length : 0
    if (!window.confirm(`导入该备份将覆盖当前全部数据（备份含 ${aCount} 篇文章、${iCount} 条灵感）。确定继续？`)) return
    store.replaceAll(parsed)
    window.alert(`已导入：${aCount} 篇文章、${iCount} 条灵感`)
  } catch (err) {
    window.alert('导入失败：' + (err.message || err))
  }
}

// 菜单「导入」：桌面版经主进程对话框（每次触发都稳定响应），浏览器环境回退动态 input
async function importBackup() {
  const api = window.electronAPI
  if (api?.importBackupDialog) {
    const res = await api.importBackupDialog()
    if (!res || res.canceled) return
    if (res.error) {
      window.alert('导入失败：' + res.error)
      return
    }
    applyBackup(res.data)
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      applyBackup(JSON.parse(await file.text()))
    } catch (err) {
      window.alert('导入失败：' + (err.message || err))
    }
  }
  input.click()
}

function onMenuAction(name) {
  if (name === 'save-backup') saveBackupQuick()
  else if (name === 'import-backup') importBackup()
}

onMounted(() => window.electronAPI?.onMenuAction?.(onMenuAction))
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        Writing Studio
        <span class="sub">本地写作 · 文章 / 灵感 / 章节 / 时间轴 / 人物关系</span>
      </div>
      <button v-if="store.view !== 'list'" class="btn small" @click="store.back()">返回主页</button>
    </header>
    <main class="app-main">
      <div v-if="store.loadError" class="load-error">本地数据加载异常，已以空数据启动。历史数据可能仍保留在存储中。</div>
      <div v-if="!store.ready" class="empty">加载中...</div>
      <ArticleList v-else-if="store.view === 'list'" />
      <InspirationView v-else-if="store.view === 'inspiration'" />
      <WorkSpace v-else />
    </main>
  </div>
</template>
