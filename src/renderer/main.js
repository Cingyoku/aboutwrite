import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { store } from './store'

store.init()

let lastEditor = null
document.addEventListener('focusin', (e) => {
  const t = e.target
  if (t.closest?.('.rich-editor')) lastEditor = t.closest('.rich-editor')
  else if (t.matches?.('textarea')) lastEditor = t
})

window.addEventListener('keydown', (e) => {
  if (e.key !== 'F11') return
  e.preventDefault()
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
    return
  }
  lastEditor?.requestFullscreen?.().catch(() => {})
})

createApp(App).mount('#app')
