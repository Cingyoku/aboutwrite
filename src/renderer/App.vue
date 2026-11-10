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
    if (
      !window.confirm(
        `导入该备份仅修正备份中的 ${aCount} 篇文章、${iCount} 条灵感（同 id 以备份为准，备份独有的补入）；导出后新增的文章、灵感与章节将保留不变。确定继续？`
      )
    )
      return
    store.mergeBackup(parsed)
    window.alert(`已按备份修正：${aCount} 篇文章、${iCount} 条灵感（备份外新增内容已保留）`)
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
        写作台
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
