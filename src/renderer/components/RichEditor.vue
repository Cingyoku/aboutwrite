<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  fontSize: { type: Number, default: 16 },
  indent: { type: Boolean, default: true },
  placeholder: { type: String, default: '' },
  // F11 全屏开关：仅章节文本窗口启用，灵感编辑器等保持关闭
  f11Fullscreen: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const el = ref(null)

function onInput() {
  emit('update:modelValue', el.value.innerHTML)
}

// 编辑状态（焦点位于编辑器内）下按 F11：本窗口进入全屏，再次按下或 Esc 退出
function toggleFullscreen() {
  if (document.fullscreenElement === el.value) {
    document.exitFullscreen?.()
  } else if (!document.fullscreenElement) {
    el.value?.requestFullscreen?.().catch(() => {})
  }
}

function onKeydown(e) {
  if (e.key === 'F11') {
    if (props.f11Fullscreen) {
      e.preventDefault()
      toggleFullscreen()
    }
    return
  }
  if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  try {
    document.execCommand('insertParagraph', false, null)
    if (props.indent) {
      document.execCommand('insertText', false, '\u3000\u3000')
    }
  } catch (err) {
    el.value.innerHTML += '<p></p>'
  }
  onInput()
}

watch(
  () => props.modelValue,
  (nv) => {
    if (el.value && nv !== el.value.innerHTML) el.value.innerHTML = nv || ''
  }
)

onMounted(() => {
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  } catch (err) {
    /* noop */
  }
  el.value.innerHTML = props.modelValue || ''
})
</script>

<template>
  <div
    ref="el"
    class="rich-editor"
    :class="{ 'indent-on': indent }"
    :style="{ fontSize: fontSize + 'px' }"
    contenteditable="true"
    :data-placeholder="placeholder"
    @input="onInput"
    @keydown="onKeydown"
  ></div>
</template>

<style scoped>
.rich-editor {
  width: 100%;
  min-height: 220px;
  max-height: 480px;
  overflow-y: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  line-height: 1.85;
  outline: none;
  word-break: break-word;
}
.rich-editor:focus { border-color: var(--accent); }
.rich-editor p { margin: 0; }
.rich-editor:empty::before { content: attr(data-placeholder); color: var(--muted); }
.rich-editor:fullscreen {
  max-height: none;
  border: none;
  border-radius: 0;
  padding: 10vh 14vw;
  font-size: 18px;
}
</style>
